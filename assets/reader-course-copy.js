/* Reader-only copy. Archived forecasts, source cells and editorial payloads stay immutable. */
(() => {
  'use strict';
  const archive=document.getElementById('cards')||document.querySelector('main');
  if(!archive)return;
  const oldCourseNote='※2着率・3着率は保存元の連対率差分による参考値。2連対率＝1着＋2着、3連対率＝1〜3着で、2着率・3着率とは別の指標。母数0走・欠測を観測0%と区別しています。';
  const oldEditorialNote='朝刊の凍結原本と保存入力にある役割・候補順・数値を展開した詳報です。更新時点の結果・オッズ・直前情報による再予想や順位変更は行っていません。';
  const copy=node=>node.textContent.trim();

  function formatCourseRates(table){
    const headers=table.tHead?.rows[0]?.cells;
    if(!headers)return;
    const rateColumns=[...headers].flatMap((header,index)=>
      /^(?:[123]着|[23]連対)[%％]※?$/.test(copy(header))?[index]:[]);
    if(!rateColumns.length)return;
    for(const body of table.tBodies){
      for(const row of body.rows){
        if(row.cells.length!==headers.length)continue;
        for(const index of rateColumns){
          for(const node of row.cells[index].childNodes){
            if(node.nodeType!==Node.TEXT_NODE)continue;
            const match=node.nodeValue.match(/^(\s*)(\d+(?:\.\d+)?)([%％]?)(\s*)$/);
            if(!match || Number(match[2])>100)continue;
            const formatted=match[1]+Number(match[2]).toFixed(1)+match[3]+match[4];
            if(node.nodeValue!==formatted)node.nodeValue=formatted;
          }
        }
      }
    }
  }

  const isCourseSection=section=>{
    const heading=section?.querySelector(':scope > summary');
    return heading&&/^02\s.*コース.*決まり手$/.test(copy(heading));
  };
  function cleanCourse(section){
    for(const note of section.querySelectorAll(':scope > p.small')){
      if(copy(note)!==oldCourseNote)continue;
      for(const header of section.querySelectorAll('table.rich-course thead th')){
        if(['2着%※','3着%※'].includes(copy(header)))header.textContent=copy(header).slice(0,-1);
      }
      note.remove();
    }
    for(const table of section.querySelectorAll('table')){
      formatCourseRates(table);
      const labels=[...table.querySelectorAll('thead th')].map(copy);
      if(!labels.includes('差し/差され')||!labels.includes('2C逃し'))continue;
      for(const cell of table.querySelectorAll('tbody td')){
        if(copy(cell)==='対象外')cell.textContent='-';
      }
    }
    for(const heading of section.querySelectorAll(':scope > h3')){
      if(copy(heading)!=='当地コース成績')continue;
      const wrapper=heading.nextElementSibling;
      if(!wrapper?.matches('.table-scroll'))continue;
      const table=wrapper.querySelector(':scope > table');
      if(!table)continue;
      const rows=[...table.querySelectorAll('tbody tr')];
      // 0走、0%、未表示、部分取得は維持。6艇の値がすべて未取得の表だけ省略する。
      if(rows.length!==6||!rows.every(row=>row.cells.length===6&&
        [...row.cells].slice(1).every(cell=>copy(cell)==='未取得')))continue;
      const empty=document.createElement('p');
      empty.className='small';
      empty.textContent='データなし';
      wrapper.replaceWith(empty);
    }
  }
  function cleanEditorial(fragment){
    for(const note of fragment.querySelectorAll(':scope > p')){
      if(copy(note)===oldEditorialNote)note.remove();
    }
  }
  for(const section of archive.querySelectorAll('article details')){
    if(isCourseSection(section))cleanCourse(section);
  }
  const noteSelector='details[data-rich-key$=":notes"] > .rich-fragment';
  archive.querySelectorAll(noteSelector).forEach(cleanEditorial);
  new MutationObserver(records=>{
    for(const {target,addedNodes} of records){
      if(target.matches?.(noteSelector))cleanEditorial(target);
      // SG/G1 tables can be inserted after the archived article was formatted.
      for(const node of addedNodes){
        if(node.nodeType!==Node.ELEMENT_NODE)continue;
        const tables=node.matches('table')?[node]:node.querySelectorAll('table');
        for(const table of tables){
          if(isCourseSection(table.closest('details')))formatCourseRates(table);
        }
      }
    }
  }).observe(archive,{childList:true,subtree:true});
})();
