#!/usr/bin/env python3
"""Generate Gemi兄 Reporter's Independent M0 Forecasts from OCHAP_SHARED_INPUT_YYYYMMDD_M0_v1.

Strictly adheres to:
- Request 044 (OCHAP-20261101-GEMI-PARALLEL-FORECAST-AUTOMATION-044.md)
- OchaP Active Prediction Instructions v3 (Phase 1 items 1-5, Phase 2 items 6-11, ochap.navi.complement.v1)
- OchaP Active Prediction Instructions v4 (ochap.navi.sense.v1; stabilizer adjustment paused)
- Zero reference to ChatGPT's picks, tickets, commentary, or diagrams.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone, timedelta
import hashlib
import json
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Tuple

from build_and_verify_shared_m0_input import compute_canonical_payload_sha256

JST = timezone(timedelta(hours=9))


def _safe_float(v: Any) -> Optional[float]:
    if v is None or isinstance(v, bool):
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _resolve_assumed_entry(race: Dict[str, Any]) -> Tuple[List[int], Dict[str, int], List[str]]:
    """Resolve assumed course entry (1C..6C) from shared_table_entry_order and Hiyori 6m course start distributions.

    Implements Phase 1 Item 1 (想定進入コースのデータを使う) and Phase 2 Item 11 (前付け移動の分離).
    """
    boats = race.get("boats") or {}
    base_order = list(race.get("shared_table_entry_order") or [1, 2, 3, 4, 5, 6])
    notes: List[str] = []

    if base_order != [1, 2, 3, 4, 5, 6]:
        order_str = "-".join(str(x) for x in base_order[:3]) + "/" + "-".join(str(x) for x in base_order[3:])
        notes.append(f"事前想定進入（{order_str}）")
        course_map = {str(bno): idx + 1 for idx, bno in enumerate(base_order)}
        return base_order, course_map, notes

    # Check if an outer boat (4..6) is a clear front-mover (イン屋/前付け常連) in Hiyori 6m data
    movers: List[Tuple[int, int, int, int, str]] = []
    for bno_int in (4, 5, 6):
        b = boats.get(str(bno_int)) or {}
        h6 = b.get("hiyori_6m") or {}
        if h6.get("status") != "present":
            continue
        ac = h6.get("all_courses") or {}
        tot = sum((ac.get(str(k), {}).get("starts") or 0) for k in range(1, 7))
        own = ac.get(str(bno_int), {}).get("starts") or 0
        inner = sum((ac.get(str(k), {}).get("starts") or 0) for k in range(1, bno_int))
        if tot >= 30 and own <= 2 and inner >= 25:
            modal_c = max(range(1, bno_int), key=lambda k: ac.get(str(k), {}).get("starts") or 0)
            modal_starts = ac.get(str(modal_c), {}).get("starts") or 0
            movers.append((bno_int, modal_c, own, modal_starts, b.get("name", f"{bno_int}号艇")))

    if movers:
        # Apply single clearest mover into assumed order while noting M0 uncertainty
        mover_bno, modal_c, own_s, modal_s, m_name = movers[0]
        target_idx = max(1, min(modal_c - 1, 3))  # typically 2C or 3C
        new_order = [x for x in base_order if x != mover_bno]
        new_order.insert(target_idx, mover_bno)
        order_str = "-".join(str(x) for x in new_order[:3]) + "/" + "-".join(str(x) for x in new_order[3:])
        notes.append(
            f"{mover_bno}号艇{m_name}の前付け警戒（{mover_bno}C{own_s}走・{modal_c}C{modal_s}走のため想定進入{order_str}と枠なりを併記比較）"
        )
        course_map = {str(bno): idx + 1 for idx, bno in enumerate(new_order)}
        return new_order, course_map, notes

    course_map = {str(i): i for i in range(1, 7)}
    return base_order, course_map, notes


def _extract_boat_profile(
    b: Dict[str, Any],
    assumed_course: int,
    venue_all_motor_zero: bool,
) -> Dict[str, Any]:
    """Extract normalized qualitative & quantitative profile for a single boat under v3/v4 rules."""
    bno = str(b.get("boat_number"))
    name = str(b.get("name") or f"{bno}号艇")
    cls = str(b.get("class") or "B1")
    f_count = b.get("f_count")  # None stays None (Phase 2 Item 8)
    l_count = b.get("l_count")

    # Phase 2 Item 6: Average ST 0.00 or null is "平均ST不明", NEVER fastest 0.00
    raw_ost = _safe_float(b.get("official_average_st"))
    official_st_unknown = raw_ost is None or raw_ost <= 0.0
    official_st: Optional[float] = None if official_st_unknown else raw_ost

    nat = b.get("national") or {}
    nat_win = _safe_float(nat.get("win_rate")) or 4.50
    nat_2r = _safe_float(nat.get("top2_rate")) or 25.0
    nat_3r = _safe_float(nat.get("top3_rate"))

    loc = b.get("local") or {}
    loc_win = _safe_float(loc.get("win_rate"))
    loc_2r = _safe_float(loc.get("top2_rate"))

    # Phase 2 Item 7: Motor 0% separated by venue-all-zero, 2r=0 with 3r>0, or both 0
    mot = b.get("motor") or {}
    mot_2r = _safe_float(mot.get("top2_rate"))
    mot_3r = _safe_float(mot.get("top3_rate"))
    if venue_all_motor_zero or mot_2r is None:
        motor_label = "機力未集計・標準扱い"
        motor_tier = 0.0
    elif mot_2r == 0.0:
        if mot_3r is not None and mot_3r > 0.0:
            motor_label = f"機2連0.0%(3連{mot_3r:.1f}%・少標本注意)"
            motor_tier = -0.15
        else:
            motor_label = "機2連0.0%・3連0.0%(母数・初下ろし注意)"
            motor_tier = -0.20
    elif mot_2r >= 42.0 or (mot_2r >= 38.0 and (mot_3r or 0.0) >= 58.0):
        motor_label = f"好機力(機2連{mot_2r:.1f}%)"
        motor_tier = min(1.2, (mot_2r - 33.0) / 12.0)
    elif mot_2r <= 26.0:
        motor_label = f"機力劣勢(機2連{mot_2r:.1f}%)"
        motor_tier = max(-1.0, (mot_2r - 33.0) / 12.0)
    else:
        motor_label = f"機力中位(機2連{mot_2r:.1f}%)"
        motor_tier = (mot_2r - 33.0) / 15.0

    # Hiyori 6m assumed course stats (Phase 1 Item 1 & Item 2)
    h6 = b.get("hiyori_6m") or {}
    h6_present = h6.get("status") == "present"
    ac = (h6.get("all_courses") or {}) if h6_present else {}
    c_stats = ac.get(str(assumed_course)) or {}
    frame_stats = ac.get(bno) or {}

    starts = c_stats.get("starts") if h6_present else None
    zero_starts = bool(c_stats.get("zero_starts")) or (h6_present and (starts == 0 or starts is None))

    c_1r = _safe_float(c_stats.get("first_rate")) if (h6_present and not zero_starts) else None
    c_2r = _safe_float(c_stats.get("second_rate")) if (h6_present and not zero_starts) else None
    c_3r = _safe_float(c_stats.get("third_rate")) if (h6_present and not zero_starts) else None
    c_top2 = _safe_float(c_stats.get("top2_rate")) if (h6_present and not zero_starts) else None
    c_top3 = _safe_float(c_stats.get("top3_rate")) if (h6_present and not zero_starts) else None

    raw_cst = _safe_float(c_stats.get("average_st")) if (h6_present and not zero_starts) else None
    course_st: Optional[float] = None if (raw_cst is None or raw_cst <= 0.0) else raw_cst

    win_m = (c_stats.get("win_methods_pct") or {}) if (h6_present and not zero_starts) else {}
    loss_m = (c_stats.get("loss_methods_pct") or {}) if (h6_present and not zero_starts) else {}
    nigashi_pct = _safe_float(c_stats.get("nigashi_rate_pct")) if (h6_present and not zero_starts) else None

    # Effective ST for comparison (Phase 2 Item 6)
    if course_st is not None and official_st is not None:
        eff_st = round(0.65 * course_st + 0.35 * official_st, 2)
        st_source_note = f"{assumed_course}CST{course_st:.2f}/期ST{official_st:.2f}"
    elif course_st is not None:
        eff_st = round(course_st, 2)
        st_source_note = f"{assumed_course}CST{course_st:.2f}(出走表平均ST不明)"
    elif official_st is not None:
        eff_st = round(official_st, 2)
        st_source_note = f"期ST{official_st:.2f}(日和{assumed_course}CST未収録)"
    else:
        eff_st = None
        st_source_note = "平均ST不明"

    # F penalty note (qualitative caution, not mechanical probability)
    if f_count is None:
        f_label = "F不明"
    elif int(f_count) > 0:
        f_label = f"F{int(f_count)}"
    else:
        f_label = "F0"

    return {
        "boat": bno,
        "boat_int": int(bno),
        "assumed_course": assumed_course,
        "registration_number": str(b.get("registration_number") or ""),
        "name": name,
        "class": cls,
        "f_count": f_count,
        "f_label": f_label,
        "l_count": l_count,
        "official_st": official_st,
        "official_st_unknown": official_st_unknown,
        "course_st": course_st,
        "eff_st": eff_st,
        "st_source_note": st_source_note,
        "nat_win": nat_win,
        "nat_2r": nat_2r,
        "nat_3r": nat_3r,
        "loc_win": loc_win,
        "loc_2r": loc_2r,
        "mot_2r": mot_2r,
        "mot_3r": mot_3r,
        "motor_label": motor_label,
        "motor_tier": motor_tier,
        "hiyori_present": h6_present,
        "starts": starts if h6_present else None,
        "zero_starts": zero_starts,
        "c_1r": c_1r,
        "c_2r": c_2r,
        "c_3r": c_3r,
        "c_top2": c_top2,
        "c_top3": c_top3,
        "win_methods": {
            "nige": _safe_float(win_m.get("nige")),
            "sashi": _safe_float(win_m.get("sashi")),
            "makuri": _safe_float(win_m.get("makuri")),
            "makurisashi": _safe_float(win_m.get("makurisashi")),
            "nuki": _safe_float(win_m.get("nuki")),
        },
        "loss_methods": {
            "sasare": _safe_float(loss_m.get("sasare")),
            "makurare": _safe_float(loss_m.get("makurare")),
            "makuraresashi": _safe_float(loss_m.get("makuraresashi")),
        },
        "nigashi_pct": nigashi_pct,
        "frame_stats": frame_stats,
    }


def _format_rate(val: Optional[float], starts: Optional[int], zero_starts: bool, hiyori_present: bool) -> str:
    """Format rate distinguishing missing, 0 starts, and observed 0.0% (Phase 1 Item 2)."""
    if not hiyori_present:
        return "欠測"
    if zero_starts or starts == 0:
        return "0走"
    if val is None:
        return "欠測"
    if val == 0.0 and starts is not None and starts < 10:
        return f"0.0%({starts}走少標本)"
    return f"{val:.1f}%"


def _choose_attack_methods(p: Dict[str, Any]) -> Tuple[str, Optional[str], str]:
    """Choose primary and secondary winning methods for a non-1C boat (Phase 1 Item 3)."""
    c = p["assumed_course"]
    wm = p["win_methods"]
    sashi = wm.get("sashi") or 0.0
    makuri = wm.get("makuri") or 0.0
    ms = wm.get("makurisashi") or 0.0
    nuki = wm.get("nuki") or 0.0

    candidates: List[Tuple[str, float]] = []
    if c == 2:
        candidates = [("差し", sashi + 2.5), ("まくり", makuri + 1.0), ("まくり差し", ms)]
    elif c == 3:
        candidates = [("まくり差し", ms + 2.0), ("まくり", makuri + 1.8), ("差し", sashi + 0.5)]
    elif c == 4:
        candidates = [("まくり", makuri + 2.2), ("まくり差し", ms + 1.8), ("差し", sashi + 0.8)]
    elif c == 5:
        candidates = [("まくり差し", ms + 2.2), ("まくり", makuri + 1.2), ("抜き", nuki + 0.5)]
    else:
        candidates = [("まくり差し", ms + 1.8), ("抜き", nuki + 1.2), ("まくり", makuri + 0.8)]

    # Adjust by ST advantage
    if (p["eff_st"] or 0.17) <= 0.14 and (p["f_count"] or 0) == 0:
        candidates = [(m, v + (2.5 if m == "まくり" else 0.0)) for m, v in candidates]

    candidates.sort(key=lambda x: x[1], reverse=True)
    primary = candidates[0][0]
    secondary = candidates[1][0] if len(candidates) > 1 and abs(candidates[0][1] - candidates[1][1]) <= 4.0 else None

    if p["hiyori_present"] and not p["zero_starts"]:
        raw_map = {"差し": sashi, "まくり": makuri, "まくり差し": ms, "抜き": nuki}
        p_val = raw_map.get(primary, 0.0)
        if secondary:
            s_val = raw_map.get(secondary, 0.0)
            note = f"{primary}({p_val:.1f}%)・第2手{secondary}({s_val:.1f}%)"
        else:
            note = f"{primary}({p_val:.1f}%)"
    else:
        note = f"{primary}" + (f"・{secondary}両睨み" if secondary else "")

    return primary, secondary, note


def evaluate_single_race(
    race_id: str,
    race: Dict[str, Any],
    input_sha256: str,
    freeze_at_jst: str,
    source_ref: str,
) -> Dict[str, Any]:
    """Independently evaluate a single race under OchaP Active Prediction Instructions v3 + v4."""
    boats_raw = race.get("boats") or {}
    entry_order, course_map, entry_notes = _resolve_assumed_entry(race)

    # Check if all 6 motors are 0% or null (Phase 2 Item 7)
    all_mot_vals = [_safe_float((boats_raw.get(str(i), {}).get("motor") or {}).get("top2_rate")) for i in range(1, 7)]
    venue_all_motor_zero = all((v is None or v == 0.0) for v in all_mot_vals)

    profiles: Dict[str, Dict[str, Any]] = {}
    course_to_boat: Dict[int, str] = {}
    for i in range(1, 7):
        bno = str(i)
        c_assumed = course_map[bno]
        profiles[bno] = _extract_boat_profile(boats_raw[bno], c_assumed, venue_all_motor_zero)
        course_to_boat[c_assumed] = bno

    p1 = profiles[course_to_boat.get(1, "1")]
    p2 = profiles[course_to_boat.get(2, "2")]
    p3 = profiles[course_to_boat.get(3, "3")]
    p4 = profiles[course_to_boat.get(4, "4")]
    p5 = profiles[course_to_boat.get(5, "5")]
    p6 = profiles[course_to_boat.get(6, "6")]

    # 1. Evaluate ① Escape strength vs vulnerability
    p1_escape_pct = p1["win_methods"].get("nige") if p1["win_methods"].get("nige") is not None else p1["c_1r"]
    p1_base = p1_escape_pct if p1_escape_pct is not None else (p1["nat_win"] * 8.5)
    # Sample size caution
    if p1["starts"] is not None and 0 < p1["starts"] < 10:
        p1_base = 0.6 * p1_base + 0.4 * (p1["nat_win"] * 8.5)

    p1_st_adj = 0.0
    if p1["eff_st"] is not None:
        p1_st_adj = (0.17 - p1["eff_st"]) * 65.0
    if (p1["f_count"] or 0) > 0:
        p1_st_adj -= 4.5 * int(p1["f_count"])

    # 2C wall quality (Phase 1 Item 5)
    p2_nigashi = p2["nigashi_pct"]
    p2_wall_score = 0.0
    if p2_nigashi is not None and (p2["starts"] or 0) >= 8:
        p2_wall_score += (p2_nigashi - 50.0) * 0.18
    if p2["eff_st"] is not None and p2["eff_st"] >= 0.19:
        p2_wall_score -= 4.0
        p2_wall_desc = f"2C壁に凹み・甘さ懸念(ST{p2['eff_st']:.2f}・{p2['f_label']})"
    elif (p2["f_count"] or 0) > 0:
        p2_wall_score -= 3.0
        p2_wall_desc = f"2C壁が{p2['f_label']}持ちでスリット慎重懸念"
    elif p2_nigashi is not None and p2_nigashi >= 55.0:
        p2_wall_score += 2.5
        p2_wall_desc = f"2C壁が堅実(逃し率{p2_nigashi:.1f}%・2連{_format_rate(p2['c_top2'], p2['starts'], p2['zero_starts'], p2['hiyori_present'])})"
    else:
        p2_wall_desc = f"2C壁は標準圏(2連{_format_rate(p2['c_top2'], p2['starts'], p2['zero_starts'], p2['hiyori_present'])})"

    escape_index = p1_base + p1_st_adj + p1["motor_tier"] * 5.5 + p2_wall_score

    # 2. Evaluate Attackers (2C..6C) under Phase 1 Items 2, 3, 5 & Phase 2 Items 10, 11
    attacker_evals: List[Dict[str, Any]] = []
    for bno, p in profiles.items():
        if bno == p1["boat"]:
            continue
        c = p["assumed_course"]
        primary_m, secondary_m, method_note = _choose_attack_methods(p)

        # Course win ability without treating observed 0.0% as impossible (Phase 1 Item 2)
        if p["c_1r"] is not None:
            if p["c_1r"] == 0.0 and (p["starts"] or 0) < 12:
                c_win_component = max(4.0, (p["nat_win"] - 4.0) * 3.8)
            else:
                c_win_component = p["c_1r"] * 0.72 + max(0.0, (p["nat_win"] - 4.2) * 3.2)
        else:
            c_win_component = max(3.5, (p["nat_win"] - 3.8) * 4.5)

        st_edge = 0.0
        if p["eff_st"] is not None and p1["eff_st"] is not None:
            st_edge = (p1["eff_st"] - p["eff_st"]) * 55.0
        elif p["eff_st"] is not None:
            st_edge = (0.17 - p["eff_st"]) * 40.0
        if (p["f_count"] or 0) > 0:
            st_edge -= 3.5 * int(p["f_count"])

        # Phase 1 Item 5: 2C sashi vs 3C/4C attack interaction with ① loss pattern
        loss_bonus = 0.0
        if c == 2 and primary_m == "差し":
            sasare = p1["loss_methods"].get("sasare") or 12.0
            loss_bonus = (sasare - 12.0) * 0.22
        elif c in (3, 4):
            makurare = (p1["loss_methods"].get("makurare") or 10.0) + (p1["loss_methods"].get("makuraresashi") or 10.0) * 0.6
            loss_bonus = (makurare - 15.0) * 0.20 - p2_wall_score * 0.35
        elif c == 5:
            # Phase 2 Item 10: Separate 5C self-attack (ST/motor edge over 4C) vs beneficiary of 3C/4C attack
            p4_st = p4["eff_st"] or 0.17
            p5_st = p["eff_st"] or 0.17
            if p5_st < p4_st - 0.01 and p["nat_win"] >= p4["nat_win"]:
                role_5c = "5C自力攻め(内④に対しST・機力優位)"
                loss_bonus = 2.0
            else:
                role_5c = "センター③④攻め連動のまくり差し展開受益"
                loss_bonus = 0.5
            method_note = f"{method_note}［{role_5c}］"
        elif c == 6:
            # Phase 2 Item 11: Separate outer 6C win vs inner front-move
            if int(bno) != c:
                method_note = f"{method_note}［前付け{c}C進入想定］"
            else:
                method_note = f"{method_note}［大外6C展開突き・道中抜き］"
                loss_bonus -= 2.5

        atk_score = c_win_component + st_edge + p["motor_tier"] * 5.0 + loss_bonus
        attacker_evals.append({
            "boat": bno,
            "profile": p,
            "primary_method": primary_m,
            "secondary_method": secondary_m,
            "method_note": method_note,
            "atk_score": atk_score,
        })

    attacker_evals.sort(key=lambda x: x["atk_score"], reverse=True)
    top_attacker = attacker_evals[0]
    second_attacker = attacker_evals[1]

    # 3. Decide whether ① Escape or Collapse (Upset) is Main (◎)
    # Gemi兄 never forces ① head; compares escape_index against top_attacker
    upset_margin = top_attacker["atk_score"] - (escape_index * 0.46)
    is_escape_main = upset_margin < 2.2

    # 4. Rank 2nd and 3rd place candidates independently for Escape branch (Phase 2 Item 9)
    escape_2nd_scores: List[Tuple[str, float, str]] = []
    for bno, p in profiles.items():
        if bno == p1["boat"]:
            continue
        c = p["assumed_course"]
        c2 = p["c_2r"] if p["c_2r"] is not None else (p["nat_2r"] * 0.55)
        c3 = p["c_3r"] if p["c_3r"] is not None else 15.0
        course_pos_bonus = {2: 4.5, 3: 4.8, 4: 4.0, 5: 2.2, 6: 0.8}.get(c, 2.0)
        s2 = c2 * 0.65 + (p["nat_win"] - 4.0) * 3.2 + p["motor_tier"] * 4.5 + course_pos_bonus
        if p["eff_st"] is not None:
            s2 += (0.17 - p["eff_st"]) * 25.0
        s3 = c3 * 0.55 + c2 * 0.30 + (p["nat_win"] - 4.0) * 2.5 + p["motor_tier"] * 4.0 + {2: 3.0, 3: 3.5, 4: 3.8, 5: 3.6, 6: 2.4}.get(c, 2.0)
        escape_2nd_scores.append((bno, s2, s3))

    escape_2nd_ranked = sorted(escape_2nd_scores, key=lambda x: x[1], reverse=True)
    esc_b2 = escape_2nd_ranked[0][0]
    esc_b3 = escape_2nd_ranked[1][0]
    # Re-evaluate 3rd place candidates excluding esc_b2 (Phase 2 Item 9: do not blindly copy 2nd order)
    esc_3rd_pool = sorted([x for x in escape_2nd_scores if x[0] not in (esc_b2,)], key=lambda x: x[2], reverse=True)
    esc_third_1 = esc_b3
    esc_third_2 = next((x[0] for x in esc_3rd_pool if x[0] != esc_b3), escape_2nd_ranked[2][0])

    # 5. Rank 2nd and 3rd place candidates independently for Collapse branch (Phase 1 Item 4 & Phase 2 Item 9, 10)
    atk_bno = top_attacker["boat"]
    atk_p = top_attacker["profile"]
    atk_method = top_attacker["primary_method"]
    atk_course = atk_p["assumed_course"]

    # Phase 1 Item 4: Evaluate whether ① survives in 2nd place (X-1) vs sinks to 3rd/out
    p1_makurare = p1["loss_methods"].get("makurare") or 12.0
    p1_sasare_ms = (p1["loss_methods"].get("sasare") or 12.0) + (p1["loss_methods"].get("makuraresashi") or 12.0)
    p1_survive_score = (p1["nat_win"] - 4.0) * 3.8 + p1["motor_tier"] * 4.8 + 14.0
    if atk_method in ("差し", "まくり差し"):
        p1_survive_score += 6.5
        p1_survive_reason = f"{atk_method}被弾時も①{p1['name']}は1M先マイから引き波を最小限に凌ぎ2・3着残存有力"
    else:
        # Full makuri: check if ① resists or sinks
        if p1["motor_tier"] >= 0.15 and (p1["eff_st"] or 0.17) <= 0.16 and p1_makurare <= p1_sasare_ms:
            p1_survive_score += 2.5
            p1_survive_reason = f"まくり被弾でも①{p1['name']}は機力・地力で内小回り粘り込み2・3着残存圏"
        else:
            p1_survive_score -= 5.5
            p1_survive_reason = f"まくり被弾時は①{p1['name']}が引き波に沈むリスクがあり外隣・連動艇の2着浮上を優先"

    collapse_2nd_scores: List[Tuple[str, float, float]] = []
    for bno, p in profiles.items():
        if bno == atk_bno:
            continue
        if bno == p1["boat"]:
            s2 = p1_survive_score
            s3 = p1_survive_score + 3.0
        else:
            c = p["assumed_course"]
            c2 = p["c_2r"] if p["c_2r"] is not None else (p["nat_2r"] * 0.55)
            c3 = p["c_3r"] if p["c_3r"] is not None else 15.0
            # Outer neighbor of attacker gets linkage bonus (外隣追走・展開受益)
            linkage = 0.0
            if atk_method == "まくり" and c == atk_course + 1:
                linkage = 6.5
            elif atk_method == "まくり差し" and c in (2, 3, 4) and c < atk_course:
                linkage = 3.5
            elif c == atk_course + 1:
                linkage = 3.5
            s2 = c2 * 0.60 + (p["nat_win"] - 4.0) * 3.2 + p["motor_tier"] * 4.5 + linkage
            s3 = c3 * 0.55 + c2 * 0.30 + (p["nat_win"] - 4.0) * 2.5 + p["motor_tier"] * 4.0 + linkage * 0.8
        collapse_2nd_scores.append((bno, s2, s3))

    collapse_2nd_ranked = sorted(collapse_2nd_scores, key=lambda x: x[1], reverse=True)
    col_b2 = collapse_2nd_ranked[0][0]
    col_b3 = collapse_2nd_ranked[1][0]
    col_3rd_pool = sorted([x for x in collapse_2nd_scores if x[0] != col_b2], key=lambda x: x[2], reverse=True)
    col_third_2 = next((x[0] for x in col_3rd_pool if x[0] != col_b3), collapse_2nd_ranked[2][0])

    # 6. Build marks (◎○▲△) and Bets (main 3 tickets, reverse 4 tickets with 0 overlap, navi 4 tickets or [])
    if is_escape_main:
        m_main = p1["boat"]
        m_second = esc_b2
        m_third = esc_b3
        m_fourth = esc_third_2 if esc_third_2 != atk_bno else (atk_bno if atk_bno not in (m_main, m_second, m_third) else esc_third_2)
        if m_fourth in (m_main, m_second, m_third):
            m_fourth = next(b for b in ["1", "2", "3", "4", "5", "6"] if b not in (m_main, m_second, m_third))
        predicted_method = "逃げ"
        bets_main = [
            f"{m_main}-{m_second}-{m_third}",
            f"{m_main}-{m_third}-{m_second}",
            f"{m_main}-{m_second}-{m_fourth}",
        ]
        # Reverse is the collapse scenario: atk_bno -> col_b2 -> remaining 4 boats (guaranteed 0 overlap since head != m_main)
        rev_head = atk_bno
        rev_second = col_b2
        rev_thirds = [b for b in [col_b3, col_third_2, "1", "2", "3", "4", "5", "6"] if b not in (rev_head, rev_second)]
        rev_thirds_dedup = list(dict.fromkeys(rev_thirds))[:4]
        bets_reverse = [f"{rev_head}-{rev_second}-{t}" for t in rev_thirds_dedup]
        reverse_axis_str = f"{rev_head}-{rev_second}-流"
    else:
        m_main = atk_bno
        m_second = col_b2
        m_third = col_b3
        m_fourth = col_third_2
        if m_fourth in (m_main, m_second, m_third):
            m_fourth = next(b for b in ["1", "2", "3", "4", "5", "6"] if b not in (m_main, m_second, m_third))
        predicted_method = atk_method
        bets_main = [
            f"{m_main}-{m_second}-{m_third}",
            f"{m_main}-{m_second}-{m_fourth}",
            f"{m_main}-{m_third}-{m_second}",
        ]
        # Reverse is the ① escape scenario: p1 -> esc_b2 -> remaining 4 boats (guaranteed 0 overlap since head is p1 != atk_bno)
        rev_head = p1["boat"]
        rev_second = esc_b2
        rev_thirds = [b for b in [esc_b3, esc_third_2, "1", "2", "3", "4", "5", "6"] if b not in (rev_head, rev_second)]
        rev_thirds_dedup = list(dict.fromkeys(rev_thirds))[:4]
        bets_reverse = [f"{rev_head}-{rev_second}-{t}" for t in rev_thirds_dedup]
        reverse_axis_str = f"{rev_head}-{rev_second}-流"

    # 7. Evaluate Funaken Navi under ochap.navi.sense.v1 + ochap.navi.complement.v1
    # Check if there is enough data/support for Navi recommendation
    missing_hiyori_boats = [b for b, p in profiles.items() if not p["hiyori_present"]]
    main_p = profiles[m_main]
    sec_p = profiles[m_second]
    thd_p = profiles[m_third]
    fth_p = profiles[m_fourth]

    # Recommend not_recommended only when >=4 boats lack Hiyori 6m AND motor/win-rate spread is ultra-flat
    if len(missing_hiyori_boats) >= 5 or (len(missing_hiyori_boats) >= 4 and not sec_p["hiyori_present"]):
        navi_status = "not_recommended"
        bets_navi: List[str] = []
        navi_axis_str = None
        navi_aim = "推奨不成立（日和6か月未収録多数・軸支持根拠不足）"
        navi_complement_target = "対象外（資料不足・支持不足により推奨見送り）"
        navi_missed_outcome = "日和コース別6か月未収録が5艇以上に及び、1・2着軸を1組に絞る定性根拠が不足するため架空券を埋めず見送り"
        navi_axis_reason = "無理な穴指定や機械的補完を行わない規約（ochap.navi.complement.v1 第6項）に基づき推奨不成立"
        navi_third_reason = "推奨不成立のため3着流しなし"
        navi_invalid_cond = "該当なし（推奨不成立）"
        navi_reason_short = f"日和6か月未収録艇（{','.join(missing_hiyori_boats)}号艇）が多く1・2着軸の絞り込み根拠が不足するため推奨不成立。"
        overlap_tickets: List[str] = []
        new_tickets: List[str] = []
    else:
        navi_status = "recommended"
        # Decide sense pattern:
        # Pattern A: Same head + 2nd place flip (m_main - m_third - 流) when 2nd & 3rd scores are very close
        # Pattern B: Same head + main 2nd (m_main - m_second - 流) to capture 5th/6th boat 3rd-place hole (紐穴補完)
        # Pattern C: Secondary attacker or 2C sashi / 3C makurisashi sense axis when escape_index is shaky
        top2_gap = abs(
            (escape_2nd_ranked[0][1] - escape_2nd_ranked[1][1])
            if is_escape_main
            else (collapse_2nd_ranked[0][1] - collapse_2nd_ranked[1][1])
        )
        outer_hole_boats = [b for b in ("5", "6") if b not in (m_main, m_second, m_third, m_fourth)]
        outer_hole_b = outer_hole_boats[0] if outer_hole_boats else m_fourth
        outer_hole_p = profiles[outer_hole_b]

        if is_escape_main and top2_gap <= 2.2:
            # Pattern A: 1 - m_third - 流 (2nd/3rd swap + 3rd spread)
            nav_1, nav_2 = m_main, m_third
            navi_aim = f"狙い：2着入替＆紐穴補完（{nav_1}-{nav_2}-流）"
            navi_complement_target = f"本線（{m_main}逃げ）の2着候補▲{nav_2}号艇{thd_p['name']}先着枝と3着外枠浮上の取りこぼし補完"
            navi_missed_outcome = f"本線3点は{m_main}-{m_second}軸中心（{m_main}-{m_third}-{m_second}のみ押さえ）のため、▲{nav_2}号艇が2着へ抜け出し△{m_fourth}号艇や{outer_hole_b}号艇が3着へ食い込む着順（{nav_1}-{nav_2}-{m_fourth}/{outer_hole_b}）を取りこぼす"
            navi_axis_reason = (
                f"◎{nav_1}号艇{main_p['name']}のイン先マイに対し、▲{nav_2}号艇{thd_p['name']}（{thd_p['assumed_course']}C2連{_format_rate(thd_p['c_top2'], thd_p['starts'], thd_p['zero_starts'], thd_p['hiyori_present'])}・{thd_p['motor_label']}）が1M差し・外マイで○{m_second}号艇に競り勝つ枝を採用"
            )
        else:
            # Pattern B: m_main - m_second - 流 (capturing 3rd place longshots / 紐穴)
            nav_1, nav_2 = m_main, m_second
            navi_aim = f"狙い：紐穴・{outer_hole_b}号艇等の3着浮上補完（{nav_1}-{nav_2}-流）"
            navi_complement_target = f"本線（{nav_1}-{nav_2}軸・{predicted_method}）における3着3・4番手（{outer_hole_b}号艇{outer_hole_p['name']}等）の取りこぼし補完"
            navi_missed_outcome = f"本線3点（{bets_main[0]}/{bets_main[1]}/{bets_main[2]}）では拾えない、1M展開の隙間を突く{outer_hole_b}号艇{outer_hole_p['name']}（{outer_hole_p['assumed_course']}C3連{_format_rate(outer_hole_p['c_top3'], outer_hole_p['starts'], outer_hole_p['zero_starts'], outer_hole_p['hiyori_present'])}）らの3着連絡みを補完"
            navi_axis_reason = (
                f"◎{nav_1}号艇{main_p['name']}の「{predicted_method}」から○{nav_2}号艇{sec_p['name']}（{sec_p['assumed_course']}C2連{_format_rate(sec_p['c_top2'], sec_p['starts'], sec_p['zero_starts'], sec_p['hiyori_present'])}・{sec_p['motor_label']}）が2着追走する軸の信頼度が最も高く、他軸より優先"
            )

        navi_axis_str = f"{nav_1}-{nav_2}-流"
        rem_thirds = [str(i) for i in range(1, 7) if str(i) not in (nav_1, nav_2)]
        bets_navi = [f"{nav_1}-{nav_2}-{t}" for t in rem_thirds]
        existing_set = set(bets_main) | set(bets_reverse)
        overlap_tickets = [t for t in bets_navi if t in existing_set]
        new_tickets = [t for t in bets_navi if t not in existing_set]
        rem_desc = "・".join(
            f"{t}号艇{profiles[t]['name']}(3着率{_format_rate(profiles[t]['c_3r'], profiles[t]['starts'], profiles[t]['zero_starts'], profiles[t]['hiyori_present'])})"
            for t in rem_thirds
        )
        navi_third_reason = f"2Mまでの道中競り合いで{rem_desc}のいずれも3着到達経路があるため1軸4点流しで網羅（重複{len(overlap_tickets)}点・新規追加{len(new_tickets)}点：{','.join(new_tickets)}）"
        navi_invalid_cond = (
            f"①{p1['name']}がスリット立ち遅れて{atk_bno}号艇{atk_p['name']}が頭まで突き抜ける展開（逆張り{reverse_axis_str}筋）"
            if is_escape_main
            else f"①{p1['name']}がスリット踏み込み1M先マイで逃げ切る展開（逆張り{reverse_axis_str}筋）"
        )
        navi_reason_short = f"{navi_aim}。{navi_axis_reason}。新規追加券：{','.join(new_tickets) if new_tickets else 'なし'}。"

    # 8. Build ST Predictions + Motivation Labels + ST Comment (Phase 2 Item 6 & 8)
    st_predictions: List[Dict[str, Any]] = []
    st_known_boats = [p for p in profiles.values() if p["eff_st"] is not None]
    st_Known_sorted = sorted(st_known_boats, key=lambda x: (x["eff_st"], x["assumed_course"]))
    fastest_boats = [x["boat"] for x in st_Known_sorted[:2]]

    for i in range(1, 7):
        bno = str(i)
        p = profiles[bno]
        c = p["assumed_course"]
        if p["official_st_unknown"] and p["course_st"] is None:
            mot_label = "平均ST不明・慎重比較"
            st_disp = "不明(出走表0.00/欠測)"
        elif (p["f_count"] or 0) > 0:
            mot_label = f"{p['f_label']}持ち・スリット慎重"
            st_disp = f"{p['eff_st']:.2f}" + ("(出走表0.00→日和補完)" if p["official_st_unknown"] else "")
        elif bno in fastest_boats:
            mot_label = "イン先制踏込" if c == 1 else ("カド攻め気配" if c == 4 else "スリット先行気配")
            st_disp = f"{p['eff_st']:.2f}" + ("(出走表0.00→日和補完)" if p["official_st_unknown"] else "")
        elif c == 2:
            mot_label = "2C壁役・五分踏込" if (p["eff_st"] or 0.18) <= 0.17 else "2C壁凹み注意"
            st_disp = f"{p['eff_st']:.2f}"
        else:
            mot_label = "標準S・展開待ち"
            st_disp = f"{p['eff_st']:.2f}"
        st_predictions.append({
            "boat": bno,
            "assumed_course": c,
            "predicted_st": p["eff_st"],
            "st_display": st_disp,
            "motivation_label": mot_label,
            "f_label": p["f_label"],
        })

    f_holders = [f"{p['boat']}号艇({p['f_label']})" for p in profiles.values() if (p["f_count"] or 0) > 0]
    st_unknown_holders = [
        f"{p['boat']}号艇{p['name']}(出走表平均ST0.00→"
        + (f"日和{p['assumed_course']}CST{p['course_st']:.2f}で別項目比較)" if p["course_st"] is not None else "平均ST不明として分離)")
        for p in profiles.values()
        if p["official_st_unknown"]
    ]
    motor_zero_holders = [
        f"{p['boat']}号艇({p['motor_label']})"
        for p in profiles.values()
        if p["mot_2r"] == 0.0
    ]

    entry_summary_str = (
        f"進入は{' / '.join(entry_notes)}（想定並び：{'-'.join(str(x) for x in entry_order[:3])}/{'-'.join(str(x) for x in entry_order[3:])}）。"
        if entry_notes
        else "進入は枠なり3対3（1-2-3/4-5-6）を基本想定。"
    )
    fast_str = "・".join(f"{x['boat']}号艇({x['eff_st']:.2f})" for x in st_Known_sorted[:2]) if st_Known_sorted else "全艇横一線"
    f_str = f"F持ちは{'・'.join(f_holders)}でスリット慎重。" if f_holders else "F持ち艇はなく全艇標準以上の踏み込み想定。"
    extra_notes: List[str] = []
    if st_unknown_holders:
        extra_notes.append("平均ST0.00分離：" + "、".join(st_unknown_holders))
    if motor_zero_holders and not venue_all_motor_zero:
        extra_notes.append("モーター0%注意：" + "、".join(motor_zero_holders))
    if missing_hiyori_boats:
        extra_notes.append(f"日和6か月未収録：{','.join(b + '号艇' for b in missing_hiyori_boats)}は公式勝率・機力・平均STで補完評価")
    extra_str = f"（{' ／ '.join(extra_notes)}）" if extra_notes else ""

    st_comment = (
        f"当日直近ST詳細は未取得のため日和コース別平均STと出走表平均STを分離して相対評価。"
        f"{entry_summary_str}スリット先行候補は{fast_str}。{f_str}{extra_str}"
    )

    # 9. Build Escape & Collapse Scenario Texts & 1R Commentary
    p1_1r_str = _format_rate(p1["c_1r"], p1["starts"], p1["zero_starts"], p1["hiyori_present"])
    p1_nige_str = _format_rate(p1_escape_pct, p1["starts"], p1["zero_starts"], p1["hiyori_present"])
    esc_b2_p = profiles[esc_b2]
    esc_b3_p = profiles[esc_b3]
    esc_t2_p = profiles[esc_third_2]

    escape_text = (
        f"【成立条件】{p1['boat']}号艇{p1['name']}({p1['class']}・1C1着率{p1_1r_str}・逃げ率{p1_nige_str}・{p1['motor_label']})が"
        f"スリット五分({p1['st_source_note']})に踏み込み、"
        f"{p2['boat']}号艇{p2['name']}の{p2_wall_desc}を踏まえて1M先マイ押し切り。"
        f"【2・3着順位】2着筆頭は{esc_b2}号艇{esc_b2_p['name']}({esc_b2_p['assumed_course']}C2連率{_format_rate(esc_b2_p['c_top2'], esc_b2_p['starts'], esc_b2_p['zero_starts'], esc_b2_p['hiyori_present'])})、"
        f"次位に{esc_b3}号艇{esc_b3_p['name']}、3着候補に{esc_third_2}号艇{esc_t2_p['name']}。"
        f"【不成立条件】①がスリット立ち遅れまたは1Mターン流れて{atk_bno}号艇{atk_p['name']}の{top_attacker['method_note']}を許す形。"
    )

    col_b2_p = profiles[col_b2]
    col_b3_p = profiles[col_b3]
    second_atk_p = second_attacker["profile"]
    collapse_text = (
        f"【攻撃役と成立条件】逆転筆頭は{atk_bno}号艇{atk_p['name']}({atk_p['class']}・{atk_p['assumed_course']}C1着率{_format_rate(atk_p['c_1r'], atk_p['starts'], atk_p['zero_starts'], atk_p['hiyori_present'])}・{atk_p['motor_label']})の{top_attacker['method_note']}。"
        f"第2攻め筋として{second_attacker['boat']}号艇{second_atk_p['name']}の{second_attacker['primary_method']}も比較。"
        f"スリットで{atk_bno}号艇({atk_p['st_source_note']})が内へ圧力をかけ1M{atk_method}で突破する展開。"
        f"【①残存と連動】{p1_survive_reason}。相手2着筆頭は{col_b2}号艇{col_b2_p['name']}、次位に{col_b3}号艇{col_b3_p['name']}。"
        f"【不成立条件】{p2['boat']}号艇{p2['name']}が2C壁として先制ブロックし、①{p1['name']}が先に回ってバック伸び返す場合。"
    )

    if is_escape_main:
        reason_text = (
            f"◎{m_main}号艇{main_p['name']}({main_p['class']}・全国勝率{main_p['nat_win']:.2f}・{main_p['motor_label']})のイン逃げが中心。"
            f"1C1着率{p1_1r_str}(逃げ率{p1_nige_str})と{p2['boat']}号艇{p2['name']}の{p2_wall_desc}を比較し先マイ押し切りを支持。"
            f"対抗○は{m_second}号艇{sec_p['name']}({sec_p['assumed_course']}C2連率{_format_rate(sec_p['c_top2'], sec_p['starts'], sec_p['zero_starts'], sec_p['hiyori_present'])}・{sec_p['motor_label']})、"
            f"単穴▲に{m_third}号艇{thd_p['name']}、連下△に{m_fourth}号艇{fth_p['name']}。"
            f"別展開の逆張りは{atk_bno}号艇{atk_p['name']}の{atk_method}突破から{reverse_axis_str}を押さえる。"
        )
    else:
        reason_text = (
            f"1号艇{p1['name']}のイン戦(1C1着率{p1_1r_str}・{p1['motor_label']}・{p2_wall_desc})に対し、"
            f"◎{m_main}号艇{main_p['name']}({main_p['class']}・全国勝率{main_p['nat_win']:.2f}・{main_p['assumed_course']}C1着率{_format_rate(main_p['c_1r'], main_p['starts'], main_p['zero_starts'], main_p['hiyori_present'])}・{main_p['motor_label']})の「{predicted_method}」逆転を本命視。"
            f"対抗○{m_second}号艇{sec_p['name']}、単穴▲{m_third}号艇{thd_p['name']}、連下△{m_fourth}号艇{fth_p['name']}へ連動。"
            f"①{p1['name']}が1M先マイで残す別展開の逆張りは{reverse_axis_str}。"
        )

    first_mark_text = (
        f"1Mは◎{m_main}号艇{main_p['name']}の「{predicted_method}」を主軸に、○{m_second}号艇{sec_p['name']}・▲{m_third}号艇{thd_p['name']}が2着争い、"
        f"△{m_fourth}号艇{fth_p['name']}が3着連絡み。"
        f"舟券ナビ（ochap.navi.sense.v1）は{navi_axis_str or '推奨不成立'}（{navi_reason_short}）"
    )

    # 10. Build Gemi兄's Independent Diagram Spec (slit + 1M turn coordinates/vectors for SVG rendering)
    diagram_boats: List[Dict[str, Any]] = []
    for idx, bno_int in enumerate(entry_order):
        bno = str(bno_int)
        p = profiles[bno]
        c = idx + 1
        st_val = p["eff_st"] if p["eff_st"] is not None else 0.18
        # Slit offset in meters relative to 0.16 baseline (+ means ahead toward slit line)
        slit_offset_m = round(max(-8.0, min(8.0, (0.165 - st_val) * 80.0)), 1)
        role = (
            "head"
            if bno == m_main
            else ("second" if bno == m_second else ("third" if bno == m_third else ("fourth" if bno == m_fourth else "other")))
        )
        diagram_boats.append({
            "boat": bno,
            "course": c,
            "name": p["name"],
            "st_display": next(x["st_display"] for x in st_predictions if x["boat"] == bno),
            "motivation_label": next(x["motivation_label"] for x in st_predictions if x["boat"] == bno),
            "slit_offset_m": slit_offset_m,
            "role": role,
        })

    return {
        "status": "published",
        "freeze_at": freeze_at_jst,
        "source_ref": source_ref,
        "input_sha256": input_sha256,
        "marks": {
            "main": m_main,
            "second": m_second,
            "third": m_third,
            "fourth": m_fourth,
        },
        "predicted_method": predicted_method,
        "bets": {
            "main": bets_main,
            "reverse": bets_reverse,
            "navi": bets_navi,
        },
        "reason": reason_text,
        "scenarios": {
            "escape": escape_text,
            "collapse": collapse_text,
        },
        "st_comment": st_comment,
        "first_mark": first_mark_text,
        "navi_details": {
            "navi_policy_version": "ochap.navi.sense.v1",
            "compat_policy_version": "ochap.navi.complement.v1",
            "stabilizer_applied": False,
            "status": navi_status,
            "aim_label": navi_aim,
            "axis": navi_axis_str,
            "complement_target": navi_complement_target,
            "missed_outcome": navi_missed_outcome,
            "axis_reason": navi_axis_reason,
            "third_spread_reason": navi_third_reason,
            "invalid_conditions": navi_invalid_cond,
            "overlap_tickets": overlap_tickets,
            "new_tickets": new_tickets,
            "reason": navi_reason_short,
        },
        "st_predictions": st_predictions,
        "diagram_spec": {
            "generator": "gemi-independent-svg-v1.1",
            "chatgpt_diagram_reused": False,
            "entry_order": entry_order,
            "main_boat": m_main,
            "second_boat": m_second,
            "third_boat": m_third,
            "predicted_method": predicted_method,
            "boats": diagram_boats,
        },
        "applied_instructions": {
            "version": "ochap.prediction.approved.v4 (Phase1_1to5 + Phase2_6to11 + ochap.navi.sense.v1; stabilizer_paused)",
            "assumed_entry_order": entry_order,
            "st_zero_separated_boats": [p["boat"] for p in profiles.values() if p["official_st_unknown"]],
            "motor_zero_boats": [p["boat"] for p in profiles.values() if p["mot_2r"] == 0.0],
            "hiyori_missing_boats": missing_hiyori_boats,
        },
    }


def generate_issue_forecast(
    shared_input_path: Path,
    output_path: Path,
    execution_mode: str,
    freeze_at_jst: str,
) -> Dict[str, Any]:
    """Generate a full daily Gemi兄 forecast JSON from a verified shared M0 input snapshot."""
    raw_bytes = shared_input_path.read_bytes()
    file_byte_sha256 = hashlib.sha256(raw_bytes).hexdigest()
    shared_data = json.loads(raw_bytes.decode("utf-8"))

    # Verify M0 integrity & canonical SHA-256 before generating a single pick
    m0_int = shared_data.get("m0_integrity") or {}
    if not (
        m0_int.get("chatgpt_picks_excluded") is True
        and m0_int.get("m1_exhibition_excluded") is True
        and m0_int.get("odds_excluded") is True
        and m0_int.get("results_excluded") is True
    ):
        raise ValueError(f"M0 integrity flags failed in {shared_input_path}")

    recorded_sha256 = shared_data.get("sha256")
    computed_sha256 = compute_canonical_payload_sha256(shared_data)
    if recorded_sha256 != computed_sha256:
        raise ValueError(f"Shared input SHA-256 mismatch: {recorded_sha256} != {computed_sha256}")

    issue_date = str(shared_data.get("date"))
    ymd = issue_date.replace("-", "")
    snapshot_id = str(shared_data.get("snapshot_id"))
    as_of_jst = str(shared_data.get("as_of_jst"))
    source_ref = f"OCHAP_GEMI_M0_{ymd}_v1.1 (shared_input={snapshot_id}, as_of={as_of_jst})"

    article_ids_order = list(shared_data.get("article_ids_order") or [])
    races_in = shared_data.get("races") or {}

    races_out: Dict[str, Any] = {}
    escape_count = 0
    upset_count = 0
    navi_rec_count = 0
    navi_not_rec_count = 0

    for rkey in article_ids_order:
        rec = evaluate_single_race(
            race_id=rkey,
            race=races_in[rkey],
            input_sha256=recorded_sha256,
            freeze_at_jst=freeze_at_jst,
            source_ref=source_ref,
        )
        races_out[rkey] = rec
        if rec["marks"]["main"] == "1":
            escape_count += 1
        else:
            upset_count += 1
        if rec["navi_details"]["status"] == "recommended":
            navi_rec_count += 1
        else:
            navi_not_rec_count += 1

    out_doc = {
        "schema_version": "1.1",
        "reporter": "gemi",
        "model_id": "gemini-independent-reporter-v1.1",
        "date": issue_date,
        "execution_mode": execution_mode,
        "m0_pre_deadline_input_only": True,
        "freeze_at": freeze_at_jst,
        "source_ref": source_ref,
        "shared_input": {
            "snapshot_id": snapshot_id,
            "sha256": recorded_sha256,
            "file_byte_sha256": file_byte_sha256,
            "as_of_jst": as_of_jst,
            "readback_verified": True,
        },
        "summary": {
            "total_races": len(races_out),
            "published_races": len(races_out),
            "escape_main_races": escape_count,
            "upset_main_races": upset_count,
            "navi_recommended_races": navi_rec_count,
            "navi_not_recommended_races": navi_not_rec_count,
            "active_instructions": [
                "OchaP_ACTIVE_PREDICTION_INSTRUCTIONS_v3 (Phase1_5items + Phase2_6items + ochap.navi.complement.v1)",
                "OchaP_ACTIVE_PREDICTION_INSTRUCTIONS_v4 (ochap.navi.sense.v1; stabilizer_adjustment_paused)",
            ],
        },
        "races": races_out,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(out_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return out_doc


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Gemi兄 Independent M0 Forecasts.")
    parser.add_argument("--shared-input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--execution-mode", type=str, default="retrospective_m0_shared_input_verification")
    parser.add_argument("--freeze-at", type=str, default=None)
    args = parser.parse_args()

    freeze_at = args.freeze_at or datetime.now(JST).isoformat(timespec="seconds")
    out_doc = generate_issue_forecast(
        shared_input_path=args.shared_input,
        output_path=args.output,
        execution_mode=args.execution_mode,
        freeze_at_jst=freeze_at,
    )
    print(json.dumps({
        "date": out_doc["date"],
        "output": str(args.output),
        "shared_input": out_doc["shared_input"],
        "summary": out_doc["summary"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
