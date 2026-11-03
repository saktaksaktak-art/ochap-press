# お茶P Gate 1–3 接続契約 v1.0（1場1Rシャドー実証）
作成: おちゃっぴー / 2026-11-03 JST / 状態: **シャドー用インターフェース確定案・実行未実証**
参照: Gate 0 仕様書 [Gemi兄版](https://docs.google.com/document/d/1MknwYpcbFJ1K94R1M67lIpnxEn3jkpnF2Hm5MJTXs1Q/edit)、採用済み予想指示 ochap.prediction.approved.v3、共通マスター台帳。
対象: **未来の指定1場1R**の縦通し試験のみ。全場公開、通常M0自動発行、既存BC計数の変更を承認しない。

## 0. Gate 0を受ける前の契約修正
- 入力 schema_version は ochap.shared_input.gate0.single_race.v1、race_id は v{venue_code}-r{race_no}、6艇は boats["1"]..boats["6"]、closed_at_jst は開催場現地JSTの正式締切時刻。
- Gate 0の「SHA-256が48文字」は誤り。16進文字列は **64文字の小文字hex**。`canonical_sha256`自身をハッシュ計算から除く。ハッシュ対象はトップレベル `canonical_sha256`を取り除いた入力オブジェクトを、**RFC 8785 JCS**で正規化しUTF-8バイト化したものとする。別ファイル .sha256 にも実ファイルのSHA-256を記録し、正本を読み戻して照合する。変更が必要ならGate 0は新バージョンを別ファイルとして作成し、既存スナップショットは上書きしない。
- プログラムの取得元は可能な限りBOATRACE公式PC/PDFを正本とし、OpenAPIは参考と明示。実出走表6艇・登録番号・対象年月日・締切・参照先・取得時刻を照合。コースは推定進入と艇番を区別し、凍結後の展示/結果/オッズ/他AI予想は除外。
- 値0、null、missingはそれぞれ別物。hiyori_6mが部分欠測でも一律に0補完しない。出走表の必須キー欠損時はINVALIDでGate1に渡さない。日和欠測は明示して、その艇で判断可能かAI/検収で判定。
- 06:00 JSTは今回のGate0シャドー候補時刻。実測 closed_at_jst との**分差 >= 120分**を要求（守れない場合は「2時間前凍結を満たさない」と記録）。既存の「朝05:00までに新聞発行可能」という要望と整合しないため、**本番時刻としては未承認**。初回成功後に別途スケジュールを検討。
- Gate 0文書は第4章が見出しのみ。下記状態遷移と異常系を1Rシャドー手順の正本とする（Gate0文書の既存記述は消さない）。

## 1. Gate 1: 二記者・独立M0予想 → 書込後凍結
### 入力・隔離
1. 予想開始前にGate0 JSON実体をDriveまたは正本リポジトリから読戻し、canonical_sha256の再計算一致と6艇・締切の検証を行う。
2. ChatGPT（ocha）とGemini（gemi）は**同じGate0ハッシュ**を各自の隔離実行領域へ渡す。対戦相手の予想・結果・オッズ・M1展示をプロンプトと実行時の閲覧経路の両方から除外する。どちらが先に完成しても他方へ予想を公開しない。
3. モデル設定は記録（provider/model/実行環境/run_id）。Solが選択できない時は代替モデルを明記し、自動的にSol実行成功としない。独立性の主張を検査可能なアクセス記録と分ける。

### 凍結成果物の形式
- スキーマ: `ochap.gate1.forecast.single_race.v1`（別添 JSON Schema）。
- 主キー: date + race_id + reporter_id（ocha/gemi）+ version。`mode:M0`、`run_class:SHADOW`、`freeze_status:FROZEN_PRE_DEADLINE`、`shared_input_sha256`、`closed_at_jst`、`freeze_at_jst`、`prediction_spec_version:ochap.prediction.approved.v3`、gate0_snapshot_ref、model_idを必須にする。Gate1予想原本自身のforecast_source_ref（保存後に確定するDriveファイルIDなど）は必須にせず、別ファイルの凍結レシートへ記録して自己参照を防ぐ。
- 予想本文: ◎○▲△の号艇と6艇比較、進入予想/STスリット体型・理由、①逃げ成立・崩壊を各1枝ずつ、想定決まり手、1M展開、2着順位・3着比較・不成立条件を必須にする。未取得を「数値0」としない。
- 舟券は既存契約を維持: 本線3点、逆張り（本線と重複禁止）、舟券ナビ（推奨時は1-2着固定＋他4艇3着、4点。既存券重複は許容して重複種別を記録）。1枚100円単位。ナビ不成立は status:not_recommended + 理由 + tickets=[]。従来の「2連単抑え」を新規必須券種として追加しない。
- predicted_win_method、各枝の成立理由・反証、想定ST、券の号艇3つが全て1〜6で重複なし、点数・金額が合法であることを検証。
- 凍結前に原稿JSONを完全に生成し、**write-onceファイル**に保存。後から修正しない。保存後にSHA256を計算し読戻して原本一致を確認し、`integrity_receipt`（payload_sha256、raw_file_sha256、saved_at、forecast_source_ref、Gate0 ref、freeze_at）を別ファイルで作成。予想原本自身のハッシュに保存先やハッシュを自己参照させない。
- 判定: gate0 hash一致 && freeze_at < closed_at_jst && 実ファイル読戻しSHA一致 && 必須フィールド・券ルール検査PASSで `GATE1_SHADOW_VALID`。一つでもNGなら `INVALID` または `LATE_REFERENCE_ONLY`。締切後生成物を正式M0や同条件比較へ混入しない。
- 保存先: 公開サイトではなく**アクセス制限のあるDriveフォルダ**。相手の凍結完了までは両AIの原稿を相互に見せない。具体的folder IDは実際の共有権限を確認してGate1実行時にレシートへ記入。公開GitHub mainに予想原稿を締切前commitしない。

## 2. Gate 2: 非公開の新聞試験版
- スキーマ: `ochap.gate2.shadow_edition.single_race.v1`。Gate0のsnapshot/ref/hash、両者の凍結予想 ref/sha、日付・場・R・締切、版、生成時刻を取り込む。
- 双方のGate1が有効で、入力sha・date・race_id・mode=M0が完全一致した時だけ `ready_for_dual_render:true`。1記者が欠けたら `BLOCKED_MISSING_REPORTER` とし、ダミーの予想・匿名補完はしない。
- 予想JSONは読取専用で、既存新聞テンプレへ変換する。◎○▲△、6艇、両分岐、決まり手、スリット、1M展開、本線3点/逆張り/ナビと根拠・不成立条件を1Rだけ描画する。
- 発行物は `run_class:SHADOW`、`publish_status:PRIVATE_PREVIEW`、`not_formal_m0:true`、`not_formal_bc:true`。まず非公開HTML/JSONを作成し、実際のレンダリング証跡（PC/390px）、両記者本文・原本sha・レース対応を確認。
- **GitHub main、既存 issue-index、archives、public-scorecard、18指標、速報JSON、正式M0を変更しない**。シャドー段階の自動公開は不可。将来の本番移行は別途承認。

## 3. Gate 3: 公式結果によるBCシャドー照合
- スキーマ: `ochap.gate3.shadow_bc.single_race.v1`。レース終了後、**BOATRACE公式結果**でdate/race_id、着順3艇、決まり手、配当、取得時刻・公式結果URLを照合。公式実進入・ST・気象等は取得できた項目だけ出典付きで持つ。
- `API_REPORTED`など第三者速報だけでは official_verified をtrueにしない。公式情報未取得なら `PENDING_OFFICIAL` として採点/確定を延期し、欠測理由を記録する。
- 採点は凍結済みGate1の**読取専用**原本2件と公式結果のみに依拠。◎1着、◎○の2連単一致、◎○▲の3連単一致、3連複一致、本線/逆張り/ナビ各券の3連単一致を、形式に合う場合だけ計算。100円券ごとの投資・払戻・回収率を区分別に算出し、未推奨/未購入は投資0。重複券は二重購入なら区分別に記録（件数を水増しせず実枚数に基づく）。2連単払戻は正式に買った場合だけ投資に入れる。
- 両記者間の比較は同一Gate0 sha、締切前凍結、同一公式結果、独立性証跡がすべて揃った時のみ `paired_verified:true`。不足があれば比較は `INELIGIBLE`。
- 本試験のBCは `run_class:SHADOW`、`count_toward_formal_bc:false`、`not_formal_bc:true`。既存の正式BC 144/856、研究約1,000R周期、既存判定定義は変更しない。正式カウンタへ入れるには将来、承認済みM0と独立の正式検収が必要。

## 4. 状態遷移・再実行と検収
- Gate0: WAIT_INPUT → INPUT_VALIDATED → INPUT_FROZEN (失敗: INPUT_INVALID, HASH_MISMATCH, INSUFFICIENT_TIME)
- Gate1: WAIT_GATE0 → OCHA_FROZEN and GEMI_FROZEN (片方欠けたら WAIT_REPORTER、締切越えたら LATE_REFERENCE_ONLY)。凍結後はwrite-once・上書き禁止。
- Gate2: BOTH_VALID → PRIVATE_PREVIEW_RENDERED → RENDER_VERIFIED。曖昧な表示やmissingは BLOCKED。
- Gate3: WAIT_OFFICIAL → OFFICIAL_VERIFIED → SHADOW_BC_SCORED → RECEIPT_VERIFIED。不正/未取得は保留とし予想を改変しない。
- 各Gateのレシート: input_ref、input_sha256、output_ref、output_sha256、observed_at_jst、validation_pass、reason_code、run_id、作業者/使用モデルを必須で記録。
- 1R実証の受入条件: 実未来レースで①Gate0原本SHA再計算一致、②両記者同一SHAかつ締切前保存・凍結原本2件の読戻し一致、③非公開新聞描画と見出し/買い目の原本一致、④公式結果参照と実BC計算、⑤正式カウンタ無変更、⑥意図的な欠損/締切超過/ハッシュ改ざんを全て安全に拒否。
- 日付、場、race_idは**架空の値を埋めて成功レシートとしない**。試験対象と結果は実証時に決定し、台帳へ証跡を残す。

## 5. Gate0側への確認依頼（互換性を崩さない）
1. SHA256 hex長誤記（48→64）、自己ハッシュ除外とJCS採否、raw-file SHA別記を確認。
2. 凍結時刻06:00を**本番固定にしない**。実締切との120分条件、05:00新聞要望との調整。
3. is_prediction_ready:trueは検証結果から導出。サンプル値で本番ready扱いしない。
4. 実データのprovenance（公式/参考、取得時刻、原本ID）、hiyori欠損状態、出走表改訂時の新snapshot規則を確認。
5. 「第4章 1Rシャドー実証の実施ステップ」に具体手順が記載されていないため、本契約の状態遷移と結合させて埋める。

本ドキュメントは予想結果ではなく**接口仕様**。正式M0の生成・公開・BC追加、Sol実行、本番GASスケジュール更新はいずれも**未実施**。