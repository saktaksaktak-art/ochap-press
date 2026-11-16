/* Reader-only copy. Archived forecasts, source cells and editorial payloads stay immutable. */
(() => {
  'use strict';
  const archive=document.getElementById('cards')||document.querySelector('main');
  if(!archive)return;
  const oldCourseNote='※2着率・3着率は保存元の連対率差分による参考値。2連対率＝1着＋2着、3連対率＝1〜3着で、2着率・3着率とは別の指標。母数0走・欠測を観測0%と区別しています。';
  const oldEditorialNote='朝刊の凍結原本と保存入力にある役割・候補順・数値を展開した詳報です。更新時点の結果・オッズ・直前情報による再予想や順位変更は行っていません。';
  const copy=node=>node.textContent.trim();

  function cleanCourse(section){
    for(const note of section.querySelectorAll(':scope > p.small')){
      if(copy(note)!==oldCourseNote)continue;
      for(const header of section.querySelectorAll('table.rich-course thead th')){
        if(['2着%※','3着%※'].includes(copy(header)))header.textContent=copy(header).slice(0,-1);
      }
      note.remove();
    }
    for(const table of section.querySelectorAll('table')){
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
    const heading=section.querySelector(':scope > summary');
    if(heading&&/^02\s.*コース.*決まり手$/.test(copy(heading)))cleanCourse(section);
  }
  const noteSelector='details[data-rich-key$=":notes"] > .rich-fragment';
  archive.querySelectorAll(noteSelector).forEach(cleanEditorial);
  new MutationObserver(records=>{
    for(const {target} of records)if(target.matches?.(noteSelector))cleanEditorial(target);
  }).observe(archive,{childList:true,subtree:true});
})();
