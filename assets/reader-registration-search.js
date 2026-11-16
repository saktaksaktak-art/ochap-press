/* Match registration numbers only against the published entry list, not odds or prose. */
(() => {
  'use strict';
  const cache=new WeakMap();
  const normalized=value=>String(value??'').normalize('NFKC').trim();
  const idQuery=value=>normalized(value).match(/^(?:登録番号|登番)?\s*[:#]?\s*([0-9]{4})$/)?.[1];
  function registrationNumbers(article){
    if(!article)return new Set();
    if(cache.has(article))return cache.get(article);
    const numbers=new Set();
    for(const table of article.querySelectorAll('table')){
      const headers=[...table.querySelectorAll('thead th')].map(cell=>normalized(cell.textContent));
      const col=headers.findIndex(label=>/^選手/.test(label)&&/(?:印|登録|登番)/.test(label));
      if(col<0)continue;
      for(const row of table.querySelectorAll('tbody tr')){
        const cell=row.cells[col];
        if(!cell)continue;
        const small=normalized(cell.querySelector('small')?.textContent);
        const code=small.match(/^([0-9]{4})(?=\s*(?:[・/]|$))/)?.[1]
          ||normalized(cell.textContent).match(/(?:\/\s*([0-9]{4})\s*$|\(([0-9]{4})\s*\/)/)?.slice(1).find(Boolean);
        if(code)numbers.add(code);
      }
    }
    if(numbers.size)cache.set(article,numbers);
    return numbers;
  }
  window.OchaPRegistrationSearch=Object.freeze({
    match(article,query,legacy){
      const number=idQuery(query);
      return number?registrationNumbers(article).has(number):legacy();
    }
  });
  document.addEventListener('DOMContentLoaded',()=>{
    const box=['query','searchInput','search','searchBox'].map(id=>document.getElementById(id)).find(node=>node?.tagName==='INPUT');
    if(box)box.placeholder='場・選手名・登録番号';
  },{once:true});
})();
