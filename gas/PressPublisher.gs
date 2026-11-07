/**
 * OchaP Press: Google Drive -> GitHub Pages (`saktaksaktak-art/ochap-press`) Auto-Publisher (v1.1 safe merge)
 *
 * Purpose:
 *   Automatically publishes daily OchaP Press HTML issues (`ochap_press_YYYY-MM-DD.html`),
 *   Gemi兄 M0 JSONs (`data/gemi/YYYY-MM-DD.json.gz.b64.txt` & `data/gemi/YYYY-MM-DD.json`),
 *   and Consensus JSONs (`data/consensus/YYYY-MM-DD.json`) from Google Drive
 *   (`1RXzB7HRUvsRfKQIQAgPkk7WNjDeQ5Ndb`) directly to `saktaksaktak-art/ochap-press` (`main`),
 *   updating `data/issue-index.json` non-destructively and recording a verified Drive receipt.
 *
 * How to Deploy ( inside existing GAS project `1vCaZXPcP8UON0iDKTzRDaykU_KqagLcOGjR90ro20cFrIbXvXXFR-VoY` ):
 *   1. Open https://script.google.com/d/1vCaZXPcP8UON0iDKTzRDaykU_KqagLcOGjR90ro20cFrIbXvXXFR-VoY/edit
 *   2. Add a new script file `PressPublisher.gs` and paste this entire file.
 *   3. In Project Settings -> Script Properties, either:
 *      - Add `OCHAP_PRESS_GITHUB_TOKEN` (a Fine-grained PAT with `Contents: Read and write` on `saktaksaktak-art/ochap-press`), OR
 *      - Grant `Contents: Read and write` on `saktaksaktak-art/ochap-press` to the existing `OCHAP_GITHUB_READ_TOKEN`.
 *   4. Run `OCHAP_PRESS_PUBLISH_20261106_AND_20261107_NOW()` once to immediately publish 2026-11-06 & 2026-11-07.
 *   5. Run `OCHAP_PRESS_INSTALL_AUTO_TRIGGER()` once to enable automatic Drive -> GitHub Pages sync every 15 minutes.
 */

var OCHAP_PRESS_PUBLISHER_CFG = Object.freeze({
  owner: 'saktaksaktak-art',
  repo: 'ochap-press',
  branch: 'main',
  pressDriveFolderId: '1RXzB7HRUvsRfKQIQAgPkk7WNjDeQ5Ndb',
  receiptPrefix: 'ochap_github_pages_publish_receipt_',
  receiptSchema: 'ochap.press.github_pages_publish_receipt.v1',
  knownIssues: Object.freeze({
    '2026-11-06': Object.freeze({
      date: '2026-11-06',
      label: '2026-11-06（金）全国13場・156R【両記者M0予想・予想一致レース・艇番カラー】',
      htmlFileId: '1z7q-YV3iCgC-C7MFnvZHEOhrAUGaMTqn',
      htmlGzB64FileId: '11swgw1YKOYzsAIi4M7AGcKCRrlQ9yOZN',
      gemiGzB64FileId: '1iez0JYmNG36k54ldf2__1W5z8Alz_UeZ',
      gemiPublicJsonFileId: '1sDuvqPB8Sbil3eRew6Hg20GfTLXld8gL',
      consensusJsonFileId: '1nSUprK2VwEw8utFzv_Lt6dC8M2_hrl-2',
      ochapStatus: 'live_m0_pre_deadline',
      gemiStatus: 'live_m0_pre_deadline'
    }),
    '2026-11-07': Object.freeze({
      date: '2026-11-07',
      label: '2026-11-07（土）全国11場・132R【Gemi兄M0予想・全国/当地/G1コース成績・艇番カラー】',
      htmlFileId: '1WaIpTVcREJCYWO4siSOFh_FOng2vROY-',
      htmlGzB64FileId: '1W1zxfk5S87H6VBHAKhzA0AOcLYMcsIpy',
      gemiGzB64FileId: '1U5h9FUg8PQnMDRoMKUxqdgfftRjvUoR1',
      gemiPublicJsonFileId: '1kD0hNaWF-jbJmjVoRZKLRbBYZ9UOAyqd',
      consensusJsonFileId: null,
      ochapStatus: 'missing_official_m0',
      gemiStatus: 'live_m0_pre_deadline'
    })
  })
});

/**
 * 1-Click Manual Entrypoint:
 * Immediately publishes both 2026-11-06 and 2026-11-07 from verified Drive File IDs to GitHub Pages.
 */
function OCHAP_PRESS_PUBLISH_20261106_AND_20261107_NOW() {
  return OCHAP_PRESS_GITHUB_PUBLISH_TICK(['2026-11-06', '2026-11-07'], true);
}

/**
 * Automated / Scheduled Entrypoint:
 * Scans `1RXzB7HRUvsRfKQIQAgPkk7WNjDeQ5Ndb` for any unpublished or updated `ochap_press_YYYY-MM-DD.html`
 * and pushes to `saktaksaktak-art/ochap-press` (`main`) idempotently.
 */
function OCHAP_PRESS_GITHUB_PUBLISH_TICK(explicitDates, forcePublish) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) {
    console.log('OCHAP_PRESS_GITHUB_PUBLISH_TICK: another publish run is in progress; skipping.');
    return { status: 'LOCKED_SKIP' };
  }
  try {
    var cfg = OCHAP_PRESS_PUBLISHER_CFG;
    var token = OCHAP_PRESS_GET_TOKEN_();
    var folder = DriveApp.getFolderById(cfg.pressDriveFolderId);

    var candidateDates = Array.isArray(explicitDates) && explicitDates.length
      ? explicitDates.slice().sort()
      : OCHAP_PRESS_DISCOVER_DATES_IN_FOLDER_(folder, cfg);

    if (!candidateDates.length) {
      return { status: 'NO_CANDIDATE_DATES', checkedAtJst: OCHAP_PRESS_NOW_JST_() };
    }

    var toPublish = [];
    for (var i = 0; i < candidateDates.length; i++) {
      var dateStr = candidateDates[i];
      var bundle = OCHAP_PRESS_LOAD_DRIVE_ISSUE_BUNDLE_(folder, dateStr, cfg);
      if (!bundle) continue;
      var existingReceipt = OCHAP_PRESS_READ_RECEIPT_(folder, dateStr, cfg);
      if (!forcePublish && existingReceipt &&
          existingReceipt.drive_input_fingerprint === bundle.driveInputFingerprint &&
          existingReceipt.status === 'PUBLISHED_AND_GIT_COMMIT_VERIFIED') {
        console.log('IDEMPOTENT_SKIP for ' + dateStr + ' (commit ' + existingReceipt.git_commit_sha + ')');
        continue;
      }
      toPublish.push(bundle);
    }

    if (!toPublish.length) {
      return {
        status: 'IDEMPOTENT_SKIP_ALL_UP_TO_DATE',
        checkedDates: candidateDates,
        checkedAtJst: OCHAP_PRESS_NOW_JST_()
      };
    }

    var publishResult = OCHAP_PRESS_COMMIT_BUNDLES_TO_GITHUB_(toPublish, token, cfg);

    for (var j = 0; j < toPublish.length; j++) {
      var b = toPublish[j];
      var receipt = {
        schema: cfg.receiptSchema,
        drive_input_fingerprint: b.driveInputFingerprint,
        date: b.date,
        published_at_jst: OCHAP_PRESS_NOW_JST_(),
        repository: cfg.owner + '/' + cfg.repo,
        branch: cfg.branch,
        git_commit_sha: publishResult.commitSha,
        previous_head_sha: publishResult.previousHeadSha,
        html_drive_file_id: b.htmlFileId,
        html_policy: 'existing_complete_archive_preserved',
        pages_deployment_verified: false,
        html_gz_b64_drive_file_id: b.htmlGzB64FileId,
        html_gz_b64_sha256: b.htmlGzB64Sha256,
        gemi_gz_b64_drive_file_id: b.gemiGzB64FileId,
        gemi_gz_b64_sha256: b.gemiGzB64Sha256,
        gemi_public_json_drive_file_id: b.gemiPublicJsonFileId,
        consensus_json_drive_file_id: b.consensusJsonFileId,
        public_url: 'https://saktaksaktak-art.github.io/ochap-press/?date=' + b.date,
        direct_html_url: 'https://saktaksaktak-art.github.io/ochap-press/ochap_press_' + b.date + '.html',
        status: 'PUBLISHED_AND_GIT_COMMIT_VERIFIED'
      };
      OCHAP_PRESS_WRITE_RECEIPT_(folder, b.date, receipt, cfg);
    }

    PropertiesService.getScriptProperties().setProperty('OCHAP_PRESS_WRITE_VERIFIED', 'true');
    console.log(JSON.stringify(publishResult));
    return publishResult;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Installs an idempotent 15-minute trigger so newly created Drive issues auto-publish to GitHub Pages.
 */
function OCHAP_PRESS_INSTALL_AUTO_TRIGGER() {
  if (PropertiesService.getScriptProperties().getProperty('OCHAP_PRESS_WRITE_VERIFIED') !== 'true') throw new Error('Run and verify one successful publish before installing the auto trigger');
  var handler = 'OCHAP_PRESS_GITHUB_PUBLISH_TICK';
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === handler) {
      return { status: 'TRIGGER_ALREADY_EXISTS', triggerId: triggers[i].getUniqueId() };
    }
  }
  var t = ScriptApp.newTrigger(handler).timeBased().everyMinutes(15).create();
  return { status: 'TRIGGER_INSTALLED', triggerId: t.getUniqueId(), handler: handler };
}

function OCHAP_PRESS_GET_TOKEN_() {
  var props = PropertiesService.getScriptProperties();
  var tok = props.getProperty('OCHAP_PRESS_GITHUB_TOKEN') || props.getProperty('OCHAP_GITHUB_READ_TOKEN');
  if (!tok) {
    throw new Error('Missing GitHub token in Script Properties (set OCHAP_PRESS_GITHUB_TOKEN with Contents:write on saktaksaktak-art/ochap-press)');
  }
  return tok.trim();
}

function OCHAP_PRESS_DISCOVER_DATES_IN_FOLDER_(folder, cfg) {
  var dateSet = {};
  Object.keys(cfg.knownIssues).forEach(function(d) { dateSet[d] = true; });
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var m = /^ochap_press_(\d{4}-\d{2}-\d{2})\.html$/.exec(f.getName());
    if (m && m[1] >= '2026-11-06') {
      dateSet[m[1]] = true;
    }
  }
  return Object.keys(dateSet).sort();
}

function OCHAP_PRESS_LOAD_DRIVE_ISSUE_BUNDLE_(folder, dateStr, cfg) {
  var known = cfg.knownIssues[dateStr] || null;
  var htmlFile = known && known.htmlFileId
    ? DriveApp.getFileById(known.htmlFileId)
    : OCHAP_PRESS_FIND_LATEST_FILE_BY_NAME_(folder, 'ochap_press_' + dateStr + '.html');
  if (!htmlFile) return null;

  var rawHtml = htmlFile.getBlob().getDataAsString('UTF-8');
  rawHtml = OCHAP_PRESS_INJECT_COMPAT_GUARD_(rawHtml, dateStr);
  var htmlBytes = Utilities.newBlob(rawHtml, 'text/html', 'ochap_press_' + dateStr + '.html').getBytes();

  // Load or build archives/YYYY-MM-DD.html.gz.b64.txt
  var htmlGzB64File = known && known.htmlGzB64FileId
    ? DriveApp.getFileById(known.htmlGzB64FileId)
    : OCHAP_PRESS_FIND_LATEST_FILE_BY_NAME_(folder, dateStr + '.html.gz.b64.txt');
  var htmlGzB64Text;
  var htmlGzB64FileId = null;
  if (htmlGzB64File) {
    htmlGzB64Text = htmlGzB64File.getBlob().getDataAsString('UTF-8').replace(/\s+/g, '');
    htmlGzB64FileId = htmlGzB64File.getId();
  } else {
    var gzBlob = Utilities.gzip(Utilities.newBlob(htmlBytes, 'text/html', dateStr + '.html'));
    htmlGzB64Text = Utilities.base64Encode(gzBlob.getBytes());
  }
  var htmlGzB64Bytes = Utilities.newBlob(htmlGzB64Text, 'text/plain').getBytes();
  var htmlGzB64Sha256 = OCHAP_PRESS_SHA256_HEX_(htmlGzB64Bytes);

  // Load data/gemi/YYYY-MM-DD.json.gz.b64.txt
  var gemiGzB64File = known && known.gemiGzB64FileId
    ? DriveApp.getFileById(known.gemiGzB64FileId)
    : OCHAP_PRESS_FIND_LATEST_FILE_BY_NAME_(folder, dateStr + '.json.gz.b64.txt');
  var gemiGzB64Text = gemiGzB64File ? gemiGzB64File.getBlob().getDataAsString('UTF-8').replace(/\s+/g, '') : null;
  var gemiGzB64Sha256 = gemiGzB64Text ? OCHAP_PRESS_SHA256_HEX_(Utilities.newBlob(gemiGzB64Text).getBytes()) : null;

  // Load compact public JSON for data/gemi/YYYY-MM-DD.json
  var gemiPublicFile = known && known.gemiPublicJsonFileId
    ? DriveApp.getFileById(known.gemiPublicJsonFileId)
    : OCHAP_PRESS_FIND_LATEST_FILE_BY_NAME_(folder, 'gemi_public_' + dateStr + '.json');
  var gemiPublicText = gemiPublicFile ? gemiPublicFile.getBlob().getDataAsString('UTF-8') : null;

  // Load optional data/consensus/YYYY-MM-DD.json
  var consFile = known && known.consensusJsonFileId
    ? DriveApp.getFileById(known.consensusJsonFileId)
    : OCHAP_PRESS_FIND_LATEST_FILE_BY_NAME_(folder, 'consensus_' + dateStr + '.json');
  var consText = consFile ? consFile.getBlob().getDataAsString('UTF-8') : null;

  var titleMatch = /<title>([^<]+)<\/title>/i.exec(rawHtml);
  var label = (known && known.label) ? known.label : (titleMatch ? titleMatch[1].replace(/^お茶P新聞｜/, '') : dateStr + ' 全国版');

  return {
    date: dateStr,
    label: label,
    htmlFileId: htmlFile.getId(),
    driveInputFingerprint: OCHAP_PRESS_SHA256_HEX_(Utilities.newBlob(JSON.stringify([rawHtml, htmlGzB64Text, gemiGzB64Text, gemiPublicText, consText])).getBytes()),
    rawHtml: rawHtml,
    htmlGzB64FileId: htmlGzB64FileId,
    htmlGzB64Text: htmlGzB64Text,
    htmlGzB64Sha256: htmlGzB64Sha256,
    gemiGzB64FileId: gemiGzB64File ? gemiGzB64File.getId() : null,
    gemiGzB64Text: gemiGzB64Text,
    gemiGzB64Sha256: gemiGzB64Sha256,
    gemiPublicJsonFileId: gemiPublicFile ? gemiPublicFile.getId() : null,
    gemiPublicText: gemiPublicText,
    consensusJsonFileId: consFile ? consFile.getId() : null,
    consensusText: consText,
    ochapStatus: known ? known.ochapStatus : 'missing_official_m0',
    gemiStatus: known ? known.gemiStatus : 'live_m0_pre_deadline'
  };
}

function OCHAP_PRESS_INJECT_COMPAT_GUARD_(htmlStr, dateStr) {
  var guard = '<script>window.__OCHAP_GEMI_REPORTER_INITIALIZED__=true;' +
    'window.__OCHAP_GEMI_REPORTER_SCRIPT_LOADED__=true;' +
    'document.documentElement.dataset.ochapGemiDocInit="1";' +
    'window.__OCHAP_SELECTED_DATE__=window.__OCHAP_SELECTED_DATE__||"' + dateStr + '";</script>\n';
  if (htmlStr.indexOf('window.__OCHAP_GEMI_REPORTER_INITIALIZED__') === -1) {
    htmlStr = htmlStr.replace('</head>', guard + '</head>');
  }
  if (htmlStr.indexOf('id="ochap-issue-datebar"') === -1) {
    htmlStr = htmlStr.replace('</header>', '</header>\n<div id="ochap-issue-datebar"></div>');
  }
  return htmlStr;
}

function OCHAP_PRESS_COMMIT_BUNDLES_TO_GITHUB_(bundles, token, cfg) {
  var apiBase = 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo;

  // 1. Get current branch HEAD commit & base tree
  var refObj = OCHAP_PRESS_GH_REQ_(apiBase + '/git/ref/heads/' + cfg.branch, 'get', null, token);
  var headSha = refObj.object.sha;
  var headCommit = OCHAP_PRESS_GH_REQ_(apiBase + '/git/commits/' + headSha, 'get', null, token);
  var baseTreeSha = headCommit.tree.sha;

  // 2. Read current data/issue-index.json from main
  var idxFileMeta = OCHAP_PRESS_GH_REQ_(apiBase + '/contents/data/issue-index.json?ref=' + headSha, 'get', null, token);
  var idxBlob = OCHAP_PRESS_GH_REQ_(apiBase + '/git/blobs/' + idxFileMeta.sha, 'get', null, token);
  var idxJsonStr = Utilities.newBlob(Utilities.base64Decode(idxBlob.content.replace(/\s+/g, ''))).getDataAsString('UTF-8');
  var manifest = JSON.parse(idxJsonStr);
  if (!Array.isArray(manifest.issues)) manifest.issues = [];

  var treeEntries = [];
  // Pin all reads to the parent commit; a concurrent writer must not be lost.
  var publishedIssueEntries = manifest.issues;
  var publishedDates = [];

  for (var i = 0; i < bundles.length; i++) {
    var b = bundles[i];
    publishedDates.push(b.date);

    // Preserve the current complete newspaper. A reporter-only Drive draft must
    // never replace an already published OchaP/dual-reporter archive.
    var preserved = publishedIssueEntries.filter(function(x) { return x.date === b.date; })[0];
    if (preserved && preserved.path) {
      var oldMeta = OCHAP_PRESS_GH_REQ_(apiBase + '/contents/' + preserved.path + '?ref=' + headSha, 'get', null, token);
      var oldBlob = OCHAP_PRESS_GH_REQ_(apiBase + '/git/blobs/' + oldMeta.sha, 'get', null, token);
      var oldText = Utilities.newBlob(Utilities.base64Decode(oldBlob.content.replace(/\s+/g, ''))).getDataAsString('UTF-8');
      if (preserved.compression !== 'base64gzip') throw new Error('Existing newspaper format needs explicit review: ' + b.date);
      b.htmlGzB64Text = oldText.replace(/\s+/g, '');
      b.htmlGzB64Sha256 = OCHAP_PRESS_SHA256_HEX_(Utilities.newBlob(b.htmlGzB64Text).getBytes());
      b.rawHtml = Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(b.htmlGzB64Text), 'application/gzip')).getDataAsString('UTF-8');
    }

    // Stage archives/YYYY-MM-DD.html.gz.b64.txt
    var archPath = 'archives/' + b.date + '.html.gz.b64.txt';
    var archBlobSha = OCHAP_PRESS_CREATE_BLOB_(apiBase, b.htmlGzB64Text, token);
    treeEntries.push({ path: archPath, mode: '100644', type: 'blob', sha: archBlobSha });

    // Stage direct standalone HTML ochap_press_YYYY-MM-DD.html
    var directHtmlPath = 'ochap_press_' + b.date + '.html';
    var directHtmlSha = OCHAP_PRESS_CREATE_BLOB_(apiBase, '<!doctype html><html lang="ja"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./?date=' + b.date + '"><title>お茶P新聞</title><a href="./?date=' + b.date + '">新聞を開く</a></html>', token);
    treeEntries.push({ path: directHtmlPath, mode: '100644', type: 'blob', sha: directHtmlSha });

    // Stage data/gemi/YYYY-MM-DD.json.gz.b64.txt
    if (b.gemiGzB64Text) {
      var gemiB64Path = 'data/gemi/' + b.date + '.json.gz.b64.txt';
      var gemiB64Sha = OCHAP_PRESS_CREATE_BLOB_(apiBase, b.gemiGzB64Text, token);
      treeEntries.push({ path: gemiB64Path, mode: '100644', type: 'blob', sha: gemiB64Sha });
    }

    // Stage data/gemi/YYYY-MM-DD.json
    if (b.gemiPublicText) {
      var gemiJsonPath = 'data/gemi/' + b.date + '.json';
      var gemiJsonSha = OCHAP_PRESS_CREATE_BLOB_(apiBase, b.gemiPublicText, token);
      treeEntries.push({ path: gemiJsonPath, mode: '100644', type: 'blob', sha: gemiJsonSha });
    }

    // Stage data/consensus/YYYY-MM-DD.json if available
    if (b.consensusText && OCHAP_PRESS_VALID_CONSENSUS_(b.consensusText, b.date)) {
      var consPath = 'data/consensus/' + b.date + '.json';
      var consSha = OCHAP_PRESS_CREATE_BLOB_(apiBase, b.consensusText, token);
      treeEntries.push({ path: consPath, mode: '100644', type: 'blob', sha: consSha });
    }

    // Upsert entry in manifest.issues while preserving all existing fields
    var existingIdx = -1;
    for (var k = 0; k < manifest.issues.length; k++) {
      if (manifest.issues[k] && manifest.issues[k].date === b.date) {
        existingIdx = k;
        break;
      }
    }
    var issueEntry = existingIdx >= 0 ? Object.assign({}, manifest.issues[existingIdx]) : {};
    issueEntry.date = b.date;
    issueEntry.label = b.label;
    issueEntry.path = archPath;
    issueEntry.compression = 'base64gzip';
    issueEntry.gemi_tabs = Boolean(b.gemiGzB64Text) || issueEntry.gemi_tabs === true;
    if (b.date === '2026-11-07') issueEntry.gemi_script = 'assets/20261107/gemi-reporter.js';
    if (b.gemiGzB64Text) {
      issueEntry.gemi_json = 'data/gemi/' + b.date + '.json.gz.b64.txt';
      issueEntry.gemi_data = './data/gemi/' + b.date + '.json';
    }
    if (b.consensusText && OCHAP_PRESS_VALID_CONSENSUS_(b.consensusText, b.date)) {
      issueEntry.consensus_json = 'data/consensus/' + b.date + '.json';
    }
    issueEntry.ochap_status = issueEntry.ochap_status || (issueEntry.forecast_sha256 ? 'published_original_preserved' : b.ochapStatus);
    issueEntry.gemi_status = b.gemiStatus;
    if (b.gemiGzB64Text && !issueEntry.gemi_first_publication_confirmed_at_jst) issueEntry.gemi_first_publication_confirmed_at_jst = OCHAP_PRESS_NOW_JST_();

    if (existingIdx >= 0) {
      manifest.issues[existingIdx] = issueEntry;
    } else {
      manifest.issues.unshift(issueEntry);
    }
  }

  // Sort manifest.issues descending by date
  manifest.issues.sort(function(a, b) {
    return String(b.date || '').localeCompare(String(a.date || ''));
  });
  var newestDate = manifest.issues[0].date;
  manifest.default_date = newestDate;
  manifest.latest = newestDate;

  var updatedIdxStr = JSON.stringify(manifest, null, 2) + '\n';
  var updatedIdxSha = OCHAP_PRESS_CREATE_BLOB_(apiBase, updatedIdxStr, token);
  treeEntries.push({ path: 'data/issue-index.json', mode: '100644', type: 'blob', sha: updatedIdxSha });

  // Create new Git tree
  var newTree = OCHAP_PRESS_GH_REQ_(apiBase + '/git/trees', 'post', {
    base_tree: baseTreeSha,
    tree: treeEntries
  }, token);

  // Create atomic commit
  var commitMsg = 'publish(press): auto-sync ' + publishedDates.join(', ') + ' from Google Drive via GAS';
  var newCommit = OCHAP_PRESS_GH_REQ_(apiBase + '/git/commits', 'post', {
    message: commitMsg,
    tree: newTree.sha,
    parents: [headSha]
  }, token);

  // Update branch reference
  OCHAP_PRESS_GH_REQ_(apiBase + '/git/refs/heads/' + cfg.branch, 'patch', {
    sha: newCommit.sha,
    force: false
  }, token);

  var verifiedRef = OCHAP_PRESS_GH_REQ_(apiBase + '/git/ref/heads/' + cfg.branch, 'get', null, token);
  if (verifiedRef.object.sha !== newCommit.sha) throw new Error('Branch advanced during verification; check commit before retry');
  return {
    status: 'PUBLISHED_SUCCESS',
    publishedDates: publishedDates,
    previousHeadSha: headSha,
    commitSha: newCommit.sha,
    treeSha: newTree.sha,
    defaultDate: newestDate,
    publishedAtJst: OCHAP_PRESS_NOW_JST_()
  };
}

function OCHAP_PRESS_CREATE_BLOB_(apiBase, utf8Content, token) {
  var bytes = Utilities.newBlob(utf8Content, 'application/octet-stream').getBytes();
  var b64 = Utilities.base64Encode(bytes);
  var res = OCHAP_PRESS_GH_REQ_(apiBase + '/git/blobs', 'post', {
    content: b64,
    encoding: 'base64'
  }, token);
  var header = Utilities.newBlob('blob ' + bytes.length + '\u0000').getBytes();
  var expectedGitSha1 = OCHAP_PRESS_HEX_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, header.concat(bytes)));
  if (String(res.sha || '').toLowerCase() !== expectedGitSha1.toLowerCase()) {
    throw new Error('Git blob SHA-1 mismatch: expected ' + expectedGitSha1 + ' got ' + res.sha);
  }
  return res.sha;
}

function OCHAP_PRESS_GH_REQ_(url, method, payloadObj, token) {
  var params = {
    method: method.toUpperCase(),
    muteHttpExceptions: true,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'OchaP-Press-GAS-Publisher/1.0'
    }
  };
  if (payloadObj !== null && payloadObj !== undefined) {
    params.contentType = 'application/json';
    params.payload = JSON.stringify(payloadObj);
  }
  var resp = UrlFetchApp.fetch(url, params);
  var code = resp.getResponseCode();
  var text = resp.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('GitHub API HTTP ' + code + ' on ' + method.toUpperCase() + ' ' + url + ': ' + text.slice(0, 300));
  }
  return JSON.parse(text);
}

function OCHAP_PRESS_FIND_LATEST_FILE_BY_NAME_(folder, name) {
  var it = folder.getFilesByName(name);
  var best = null;
  while (it.hasNext()) {
    var f = it.next();
    if (!best || f.getLastUpdated().getTime() > best.getLastUpdated().getTime()) {
      best = f;
    }
  }
  return best;
}

function OCHAP_PRESS_READ_RECEIPT_(folder, dateStr, cfg) {
  var f = OCHAP_PRESS_FIND_LATEST_FILE_BY_NAME_(folder, cfg.receiptPrefix + dateStr + '.json');
  if (!f) return null;
  try {
    return JSON.parse(f.getBlob().getDataAsString('UTF-8'));
  } catch (_) {
    return null;
  }
}

function OCHAP_PRESS_WRITE_RECEIPT_(folder, dateStr, receiptObj, cfg) {
  var name = cfg.receiptPrefix + dateStr + '.json';
  var body = JSON.stringify(receiptObj, null, 2);
  var existing = OCHAP_PRESS_FIND_LATEST_FILE_BY_NAME_(folder, name);
  if (existing) {
    existing.setContent(body);
    return existing.getId();
  }
  var created = folder.createFile(Utilities.newBlob(body, 'application/json', name));
  return created.getId();
}

function OCHAP_PRESS_SHA256_HEX_(bytes) {
  return OCHAP_PRESS_HEX_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));
}

function OCHAP_PRESS_HEX_(digestBytes) {
  return digestBytes.map(function(b) {
    var v = (b < 0) ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function OCHAP_PRESS_NOW_JST_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** Reports only configuration presence and this publisher's trigger count. */
function OCHAP_PRESS_PUBLISHER_STATUS() {
  var p = PropertiesService.getScriptProperties();
  var out = {schema:'ochap.press.publisher.status.v1',
    pressTokenConfigured:Boolean(p.getProperty('OCHAP_PRESS_GITHUB_TOKEN')),
    fallbackReadTokenConfigured:Boolean(p.getProperty('OCHAP_GITHUB_READ_TOKEN')),
    publisherTriggers:ScriptApp.getProjectTriggers().filter(function(t){return t.getHandlerFunction()==='OCHAP_PRESS_GITHUB_PUBLISH_TICK';}).length};
  console.log(JSON.stringify(out)); return out;
}

function OCHAP_PRESS_VALID_CONSENSUS_(text, date) {
  try { var x=JSON.parse(text); return x.schema_version==='ochap.public.consensus.v1' && x.date===date && Array.isArray(x.races) && x.races.every(function(r){return Array.isArray(r.exacta)&&Array.isArray(r.trifecta);}); }
  catch (_) { return false; }
}
