/** Results bulletin dispatcher, #058 acceptance revision 2.1.
 * Only dispatches existing Actions. HTTP 204 means accepted, not publication success.
 * Daily ledger holds 80 short flags (<2KB), never 80 full execution reports.
 * Installer must run only after a real Actions + HTTP readback succeeds.
 */
var OCHAP_RESULTS_FLASH_CFG = Object.freeze({
  version: '2.1.0', owner: 'saktaksaktak-art', repo: 'ochap-press',
  branch: 'main', workflowFile: 'publish_official_public_results.yml',
  handlerName: 'OCHAP_RESULTS_FLASH_TICK'
});
function OCHAP_RESULTS_FLASH_BUILD_80_SLOTS_() {
  var slots = [];
  for (var h = 9; h <= 20; h++) {
    var hh = ('0' + h).slice(-2);
    for (var m = 0; m < 60; m += 10) {
      slots.push(hh + ':' + ('0' + m).slice(-2));
    }
  }
  var nightHours = [21, 22];
  for (var i = 0; i < nightHours.length; i++) {
    var nh = ('0' + nightHours[i]).slice(-2);
    slots.push(nh + ':00', nh + ':20', nh + ':40');
  }
  slots.push('23:00', '23:20');
  return slots;
}

/**
 * Resolves a Date object in Asia/Tokyo against the 80-slot daily schedule.
 * Prevents duplicate firing within the same `(date_jst, slot_hhmm)` and ensures
 * `23:20` is the final slot of the day (processed at most once).
 */
function OCHAP_RESULTS_FLASH_RESOLVE_SLOT_JST_(nowDate, firedSlotsMap, allowDelayedCatchup) {
  var d = nowDate || new Date();
  var dayJst = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
  var hour = Number(Utilities.formatDate(d, 'Asia/Tokyo', 'H'));
  var minute = Number(Utilities.formatDate(d, 'Asia/Tokyo', 'm'));
  var totalMin = hour * 60 + minute;
  var fired = firedSlotsMap || {};
  var slots80 = OCHAP_RESULTS_FLASH_BUILD_80_SLOTS_();

  // Before 09:00 JST (00:00..08:59)
  if (totalMin < 540) {
    return {
      shouldRun: false,
      reason: 'OUT_OF_WINDOW_BEFORE_0900',
      dateJst: dayJst,
      slotHhmm: null,
      scheduledSlotJst: null,
      slotOrdinal: null,
      totalDailySlots: 80
    };
  }

  // After 23:29 JST (23:30..23:59)
  if (totalMin > 1409) {
    if (allowDelayedCatchup && totalMin <= 1439 && !fired['23:20']) {
      return {
        shouldRun: true,
        reason: 'DELAYED_FINAL_SLOT_2320_CATCHUP',
        dateJst: dayJst,
        slotHhmm: '23:20',
        scheduledSlotJst: dayJst + 'T23:20:00+09:00',
        slotOrdinal: 80,
        totalDailySlots: 80
      };
    }
    return {
      shouldRun: false,
      reason: 'OUT_OF_WINDOW_AFTER_2320',
      dateJst: dayJst,
      slotHhmm: null,
      scheduledSlotJst: null,
      slotOrdinal: null,
      totalDailySlots: 80
    };
  }

  var tenMinSlot = Math.floor(totalMin / 10) * 10;

  // Window 1: 09:00–20:50 JST (every 10 minutes, 72 runs)
  if (tenMinSlot >= 540 && tenMinSlot <= 1250) {
    var sh = ('0' + Math.floor(tenMinSlot / 60)).slice(-2);
    var sm = ('0' + (tenMinSlot % 60)).slice(-2);
    var slotHhmm = sh + ':' + sm;
    var ord = slots80.indexOf(slotHhmm) + 1;
    if (fired[slotHhmm]) {
      return {
        shouldRun: false,
        reason: 'IDEMPOTENT_SAME_SLOT_SKIP',
        dateJst: dayJst,
        slotHhmm: slotHhmm,
        scheduledSlotJst: dayJst + 'T' + slotHhmm + ':00+09:00',
        slotOrdinal: ord,
        totalDailySlots: 80
      };
    }
    return {
      shouldRun: true,
      reason: 'SCHEDULED_10MIN_SLOT',
      dateJst: dayJst,
      slotHhmm: slotHhmm,
      scheduledSlotJst: dayJst + 'T' + slotHhmm + ':00+09:00',
      slotOrdinal: ord,
      totalDailySlots: 80
    };
  }

  // Window 2: 21:00–23:20 JST (every 20 minutes: :00, :20, :40 up to 23:20, 8 runs)
  var isEven20 = ((tenMinSlot - 1260) % 20 === 0);
  if (isEven20) {
    var nh = ('0' + Math.floor(tenMinSlot / 60)).slice(-2);
    var nm = ('0' + (tenMinSlot % 60)).slice(-2);
    var nightSlot = nh + ':' + nm;
    var nightOrd = slots80.indexOf(nightSlot) + 1;
    if (fired[nightSlot]) {
      return {
        shouldRun: false,
        reason: 'IDEMPOTENT_SAME_SLOT_SKIP',
        dateJst: dayJst,
        slotHhmm: nightSlot,
        scheduledSlotJst: dayJst + 'T' + nightSlot + ':00+09:00',
        slotOrdinal: nightOrd,
        totalDailySlots: 80
      };
    }
    return {
      shouldRun: true,
      reason: 'SCHEDULED_20MIN_SLOT',
      dateJst: dayJst,
      slotHhmm: nightSlot,
      scheduledSlotJst: dayJst + 'T' + nightSlot + ':00+09:00',
      slotOrdinal: nightOrd,
      totalDailySlots: 80
    };
  }

  // Odd 10-minute tick in 21:00–23:19 (:10, :30, :50)
  var prevEven = tenMinSlot - 10;
  var ph = ('0' + Math.floor(prevEven / 60)).slice(-2);
  var pm = ('0' + (prevEven % 60)).slice(-2);
  var prevSlot = ph + ':' + pm;
  if (allowDelayedCatchup && !fired[prevSlot]) {
    var prevOrd = slots80.indexOf(prevSlot) + 1;
    return {
      shouldRun: true,
      reason: 'DELAYED_20MIN_SLOT_CATCHUP',
      dateJst: dayJst,
      slotHhmm: prevSlot,
      scheduledSlotJst: dayJst + 'T' + prevSlot + ':00+09:00',
      slotOrdinal: prevOrd,
      totalDailySlots: 80
    };
  }

  return {
    shouldRun: false,
    reason: 'SKIP_20MIN_CADENCE_ODD_TICK',
    dateJst: dayJst,
    slotHhmm: null,
    scheduledSlotJst: null,
    slotOrdinal: null,
    totalDailySlots: 80
  };
}


// Time-driven triggers pass an event object: do not treat it as a Date.
function OCHAP_RESULTS_FLASH_TICK() {
  return OCHAP_RESULTS_FLASH_RUN_(new Date());
}
function OCHAP_RESULTS_FLASH_RUN_(now) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {status: 'SKIPPED_LOCK_BUSY'};
  try {
    var props = PropertiesService.getScriptProperties();
    var day = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
    var oldDay = props.getProperty('OCHAP_RESULTS_FLASH_DATE');
    var fired = oldDay === day ? JSON.parse(props.getProperty('OCHAP_RESULTS_FLASH_FIRED_SLOTS_JSON') || '{}') : {};
    if (oldDay !== day) {
      props.setProperties({OCHAP_RESULTS_FLASH_DATE: day, OCHAP_RESULTS_FLASH_FIRED_SLOTS_JSON: '{}'});
    }
    var decision = OCHAP_RESULTS_FLASH_RESOLVE_SLOT_JST_(now, fired, true);
    if (!decision.shouldRun) return {status: decision.reason};
    var started = Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX");
    var token = props.getProperty('OCHAP_PRESS_GITHUB_TOKEN');
    if (!token || !token.trim()) throw new Error('OCHAP_PRESS_GITHUB_TOKEN not configured');
    var url = 'https://api.github.com/repos/saktaksaktak-art/ochap-press/actions/workflows/publish_official_public_results.yml/dispatches';
    var res = UrlFetchApp.fetch(url, {
      method: 'post', muteHttpExceptions: true, contentType: 'application/json',
      headers: {Authorization: 'Bearer ' + token.trim(), Accept: 'application/vnd.github+json'},
      payload: JSON.stringify({ref: 'main', inputs: {
        target_date: day, scheduled_slot_jst: decision.scheduledSlotJst,
        dispatched_at_jst: started, trigger_source: 'gas_80slot_scheduler'
      }})
    });
    var status = res.getResponseCode();
    var report = {version: '2.1.0', date_jst: day, scheduled_slot_jst: decision.scheduledSlotJst,
      actual_started_at_jst: started,
      actual_finished_at_jst: Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX"),
      dispatch_http_status: status, dispatch_accepted: status === 204,
      actions_completion_verified: false, exact_on_time_guaranteed: false};
    if (status === 204) {
      fired[decision.slotHhmm] = 1;
      props.setProperties({OCHAP_RESULTS_FLASH_FIRED_SLOTS_JSON: JSON.stringify(fired),
        OCHAP_RESULTS_FLASH_LAST_ERROR: ''});
      report.status = 'DISPATCH_ACCEPTED_NOT_COMPLETION';
    } else {
      report.status = 'DISPATCH_FAILED_RETRYABLE';
      // Never switch to a weaker parser/merge on 403 or 404.
      props.setProperty('OCHAP_RESULTS_FLASH_LAST_ERROR', 'workflow_dispatch HTTP ' + status + '; check existing token Actions:write and deployed workflow');
    }
    props.setProperty('OCHAP_RESULTS_FLASH_LAST_RUN_JSON', JSON.stringify(report));
    console.log(JSON.stringify(report));
    return report;
  } finally { lock.releaseLock(); }
}
function OCHAP_RESULTS_FLASH_PREFLIGHT() {
  var token = PropertiesService.getScriptProperties().getProperty('OCHAP_PRESS_GITHUB_TOKEN');
  if (!token || !token.trim()) throw new Error('Existing token is not configured');
  var res = UrlFetchApp.fetch('https://api.github.com/repos/saktaksaktak-art/ochap-press/actions/workflows/publish_official_public_results.yml', {
    muteHttpExceptions: true, headers: {Authorization: 'Bearer ' + token.trim(), Accept: 'application/vnd.github+json'}
  });
  if (res.getResponseCode() !== 200) throw new Error('Workflow lookup HTTP ' + res.getResponseCode());
  return {version:'2.1.0', workflow_readable: true, actions_write_verified: false,
    note:'A real manual dispatch and Actions/HTTP readback are required before handover.'};
}
function OCHAP_RESULTS_FLASH_INSTALL_TRIGGER() {
  OCHAP_RESULTS_FLASH_PREFLIGHT();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('INSTALL_LOCK_BUSY');
  try {
    var handler = OCHAP_RESULTS_FLASH_CFG.handlerName;
    var ts = ScriptApp.getProjectTriggers().filter(function(t) {return t.getHandlerFunction() === handler;});
    var chosen = ts[0] || ScriptApp.newTrigger(handler).timeBased().everyMinutes(10).create();
    ts.slice(1).forEach(function(t) {ScriptApp.deleteTrigger(t);});
    var report = {version:'2.1.0', handler:handler, trigger_id:chosen.getUniqueId(),
      created:ts.length === 0, removed_duplicate_count: Math.max(0,ts.length-1),
      schedule:'JST 09:00-20:50 /10m, 21:00-23:20 /20m; 80 target slots',
      real_daily_execution_verified:false};
    PropertiesService.getScriptProperties().setProperty('OCHAP_RESULTS_FLASH_INSTALL_SUMMARY',JSON.stringify(report));
    return report;
  } finally {lock.releaseLock();}
}
function OCHAP_RESULTS_FLASH_STATUS() {
  var p = PropertiesService.getScriptProperties();
  return {version:'2.1.0', trigger_count:ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === OCHAP_RESULTS_FLASH_CFG.handlerName;
  }).length, date_jst:p.getProperty('OCHAP_RESULTS_FLASH_DATE'),
    accepted_slots:Object.keys(JSON.parse(p.getProperty('OCHAP_RESULTS_FLASH_FIRED_SLOTS_JSON') || '{}')).length,
    last_run:JSON.parse(p.getProperty('OCHAP_RESULTS_FLASH_LAST_RUN_JSON') || 'null'),
    last_error:p.getProperty('OCHAP_RESULTS_FLASH_LAST_ERROR') || ''};
}
