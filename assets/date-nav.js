(() => {
  'use strict';
  const manifest = window.__OCHAP_ISSUE_INDEX__;
  const selected = window.__OCHAP_SELECTED_DATE__;
  if (!manifest || !Array.isArray(manifest.issues)) return;
  const toolbar = document.createElement('div');
  toolbar.id = 'ochap-issue-datebar';
  const label = document.createElement('label');
  label.htmlFor = 'ochap-issue-date';
  label.textContent = '新聞の発行日';
  const chooser = document.createElement('select');
  chooser.id = 'ochap-issue-date';
  chooser.setAttribute('aria-label','新聞の発行日を選ぶ');
  for (const issue of manifest.issues) {
    const option = document.createElement('option');
    option.value = issue.date;
    option.textContent = issue.date.replaceAll('-','/');
    chooser.add(option);
  }
  chooser.value = selected;
  chooser.addEventListener('change', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('date',chooser.value);
    url.hash = '';
    window.location.assign(url.href);
  });
  toolbar.append(label,chooser);
  (document.querySelector('header#top') || document.querySelector('header') || document.querySelector('main') || document.body.firstElementChild || document.body).before(toolbar);
})();
