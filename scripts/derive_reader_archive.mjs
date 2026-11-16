// One-way projection of an already published v1 newspaper. The frozen archive is never written.
import fs from 'node:fs';
import zlib from 'node:zlib';
import {pathToFileURL} from 'node:url';

const payload=/<script id="ochap-rich-payload"[^>]*>([A-Za-z0-9+/=\s]+)<\/script>/;
const headerAudit=/<p>締切前参考M0・対象[^<]*<\/p>/g;
const courseNote=/<p class="small">※2着率・3着率は保存元の連対率差分による参考値。[^<]*<\/p>/g;
const editorialNote=/<p class="small">朝刊の凍結原本と保存入力にある役割・候補順・数値を展開した詳報です。[^<]*<\/p>/g;
export function projectReader(html,date){
  const packed=html.match(payload);
  if(!packed)throw Error('Missing archived editorial payload');
  const data=JSON.parse(zlib.gunzipSync(Buffer.from(packed[1],'base64')));
  if(data.schema!=='ochap.editorial-fragments.v1'||data.date!==date)throw Error('Archived editorial payload schema/date mismatch');
  const fragments=Object.fromEntries(Object.entries(data.fragments).filter(([key])=>!key.endsWith(':sources')).map(([key,body])=>[key,body
    .replace(editorialNote,'').replaceAll('実際の踏込みを確定する値ではありません。','')
    .replace(/原本の(?=受益候補|2着候補順|役割|固定1・2着)/g,'')]));
  const clean=zlib.gzipSync(JSON.stringify({schema:'ochap.editorial-fragments.v2',date,fragments})).toString('base64');
  const projected=html.replace(payload,`<script id="ochap-rich-payload" type="application/octet-stream">${clean}</script>`)
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/,(node)=>node.replace(headerAudit,''))
    .replace(/<footer><details><summary>PDFを保存・印刷する<\/summary>PDF準備中<\/details><\/footer>/,'')
    .replace(/<details\b[^>]*data-rich-key="v\d+-r\d+:sources"[^>]*>[\s\S]*?<\/details>/g,'')
    .replace(courseNote,'').replaceAll('2着%※','2着%').replaceAll('3着%※','3着%')
    .replace(/<table><thead><tr><th>艇\/C<\/th><th>母数<\/th><th>逃げ<\/th>[\s\S]*?<\/table>/g,node=>node.replaceAll('<td>対象外</td>','<td>-</td>'))
    .replace(/(<h3>当地コース成績<\/h3>)<div class="table-scroll"><table>[\s\S]*?<\/table><\/div>/g,(node,head)=>{
      const rows=[...node.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)][0]?.[1].match(/<tr>[\s\S]*?<\/tr>/g);
      const missing=rows?.length===6&&rows.every(row=>{
        const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(m=>m[1]);
        return cells.length===6&&cells.slice(1).every(cell=>cell==='未取得');
      });
      return missing?head+'<p class="small">データなし</p>':node;
    });
  const oldLoader="if(d.date!=='"+date+"'||d.forecast_sha256!=='"+data.forecast_sha256+"')throw Error('日付・原本不一致');el.querySelector('.rich-fragment').innerHTML=d.fragments[el.dataset.richKey];";
  if(!projected.includes(oldLoader))throw Error('Archived editorial loader changed');
  return projected.replace(oldLoader,`const fragment=d.fragments?.[el.dataset.richKey];if(d.schema!=='ochap.editorial-fragments.v2'||d.date!=='${date}'||typeof fragment!=='string')throw Error('詳報が不正です');el.querySelector('.rich-fragment').innerHTML=fragment;`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [date,input,output]=process.argv.slice(2);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date??'')||!input||!output||input===output)throw Error('Usage: derive_reader_archive.mjs DATE INPUT OUTPUT');
  const raw=zlib.gunzipSync(Buffer.from(fs.readFileSync(input,'utf8'),'base64')).toString('utf8');
  fs.writeFileSync(output,zlib.gzipSync(projectReader(raw,date)).toString('base64'),{flag:'wx'});
}
