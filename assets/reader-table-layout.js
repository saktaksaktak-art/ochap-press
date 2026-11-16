/* Only the rendering of reader tables changes, including tables inserted later. */
(() => {
  'use strict';
  const visited = new WeakSet();
  function adapt(table) {
    const headers = table.tHead?.rows[0]?.cells;
    // Course stats are a six-boat comparison, even when they have many metrics.
    if (visited.has(table) || table.matches('.rich-course,.ochap-grade-course') ||
        !headers || headers.length < 7 ||
        [...headers].some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1)) return;
    const rows = [...table.tBodies, ...(table.tFoot ? [table.tFoot] : [])].flatMap(group => [...group.rows]);
    if (!rows.length || rows.some(row => row.cells.length !== headers.length ||
        [...row.cells].some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1))) return;
    visited.add(table);
    table.dataset.ochapWide = '';
    table.setAttribute('role', 'table');
    table.tHead.setAttribute('role', 'rowgroup');
    table.tHead.rows[0].setAttribute('role', 'row');
    for (const header of headers) header.setAttribute('role', 'columnheader');
    for (const row of rows) {
      row.parentElement.setAttribute('role', 'rowgroup');
      row.setAttribute('role', 'row');
      [...row.cells].forEach((cell, index) => {
        cell.dataset.ochapField = headers[index].textContent.trim();
        cell.setAttribute('role', cell.tagName === 'TH' ? 'rowheader' : 'cell');
      });
    }
  }
  const scan = node => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const parent = node.closest('table');
    if (parent) adapt(parent);
    node.querySelectorAll('table').forEach(adapt);
  };
  scan(document.body);
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) scan(node);
  }).observe(document.body, {childList:true,subtree:true});
  document.addEventListener('change', event => {
    const picker = event.target;
    if (!picker.matches?.('[data-ochap-baseline-picker]')) return;
    const section = picker.closest('.ochap-method-section');
    for (const row of section.querySelectorAll('tfoot [data-ochap-baseline-course]')) {
      row.hidden = row.dataset.ochapBaselineCourse !== picker.value;
    }
  });
})();
