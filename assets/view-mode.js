/* Opt-in viewport previews; the original newspaper and its breakpoints remain untouched. */
(() => {
  'use strict';
  if (window !== window.top) return;
  const STORAGE = 'ochap.reader.view-mode.v1';
  const FIT = 'ochap.reader.view-fit.v1';
  const labels = {auto:'自動',mobile:'スマホ版',tablet:'タブレット版',desktop:'PC版'};
  const sizes = {mobile:390,tablet:820,desktop:1280};
  const read = key => {try {return localStorage.getItem(key)} catch (_) {return null}};
  const save = (key,value) => {try {localStorage.setItem(key,value)} catch (_) {}};
  const base = new URL('./',location.href);
  const viewer = new URL('view-mode.html',base);
  const modeFromStorage = Object.hasOwn(labels,read(STORAGE)) ? read(STORAGE) : 'auto';
  const relative = url => url.pathname.slice(base.pathname.length)+url.search+url.hash;
  const validateTarget = input => {
    try {
      const url = new URL(input||'index.html',base);
      if(url.origin!==location.origin||!url.pathname.startsWith(base.pathname))throw Error('origin');
      const path=url.pathname.slice(base.pathname.length);
      if(!/^(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.html$/.test(path)||
          path==='view-mode.html')throw Error('path');
      return url;
    }catch(_){return new URL('index.html',base)}
  };
  const ensureStyle=()=>{
    if(document.querySelector('link[data-ochap-view-style]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='./assets/view-mode.css?v=20261121';
    link.dataset.ochapViewStyle='';
    document.head.append(link);
  };
  const makeSelect=()=>{
    const select=document.createElement('select');
    select.setAttribute('aria-label','表示モード');
    for(const [key,label] of Object.entries(labels)){
      const option=document.createElement('option');option.value=key;option.textContent=label;select.append(option);
    }
    return select;
  };
  const launch=(mode,target)=>{
    save(STORAGE,mode);
    const url=new URL(viewer);
    url.searchParams.set('mode',mode);
    url.searchParams.set('target',target);
    location.assign(url.href);
  };
  const viewFrame=document.getElementById('ochap-view-frame');
  if(viewFrame){
    ensureStyle();
    document.title='表示モード｜お茶P新聞';
    const params=new URL(location.href).searchParams;
    let mode=Object.hasOwn(sizes,params.get('mode'))?params.get('mode'):
      (Object.hasOwn(sizes,modeFromStorage)?modeFromStorage:'mobile');
    save(STORAGE,mode);
    const select=document.getElementById('ochap-view-select');
    for(const [key,label] of Object.entries(labels)){
      const option=document.createElement('option');option.value=key;option.textContent=label;select.append(option);
    }
    select.value=mode;
    const fitControl=document.getElementById('ochap-view-fit');
    let fit=read(FIT)!=='off';
    fitControl.checked=fit;
    const frameStage=document.getElementById('ochap-view-stage');
    const frameCanvas=document.getElementById('ochap-view-canvas');
    const toolbar=document.getElementById('ochap-view-toolbar');
    const currentTarget=()=> {
      try{
        const url=new URL(viewFrame.contentWindow.location.href);
        if(url.origin===location.origin&&url.pathname.startsWith(base.pathname)&&url.pathname!==viewer.pathname){
          return relative(url);
        }
      }catch(_){}
      return validateTarget(new URL(location.href).searchParams.get('target')).href.slice(base.href.length);
    };
    const rememberTarget=()=>{
      const url=new URL(location.href);
      url.searchParams.set('target',currentTarget());
      history.replaceState(null,'',url);
    };
    const resize=()=>{
      const width=sizes[mode], available=Math.max(240,document.documentElement.clientWidth-16);
      const scale=fit?Math.min(1,available/width):1;
      const height=Math.max(260,window.innerHeight-toolbar.getBoundingClientRect().height-14);
      frameStage.style.height=height+'px';
      frameCanvas.style.width=Math.round(width*scale)+'px';
      frameCanvas.style.height=height+'px';
      viewFrame.style.width=width+'px';
      viewFrame.style.height=Math.ceil(height/scale)+'px';
      viewFrame.style.transform='scale('+scale+')';
      document.getElementById('ochap-view-scale').textContent=
        '表示幅 '+width+'px'+(scale<1?'（'+Math.round(scale*100)+'%に縮小）':'');
    };
    select.addEventListener('change',()=>{
      const next=select.value;
      if(next==='auto'){
        save(STORAGE,'auto');
        location.assign(validateTarget(currentTarget()).href);
        return;
      }
      mode=next;save(STORAGE,mode);
      const url=new URL(location.href);url.searchParams.set('mode',mode);history.replaceState(null,'',url);
      resize();
    });
    fitControl.addEventListener('change',()=>{
      fit=fitControl.checked;save(FIT,fit?'on':'off');resize();
    });
    viewFrame.addEventListener('load',rememberTarget);
    window.addEventListener('resize',resize);
    viewFrame.src=validateTarget(params.get('target')).href;
    resize();
    return;
  }
  if(modeFromStorage!=='auto'){
    const target=relative(new URL(location.href));
    const url=new URL(viewer);url.searchParams.set('mode',modeFromStorage);
    url.searchParams.set('target',target);
    location.replace(url.href);
    return;
  }
  ensureStyle();
  const box=document.createElement('div');
  box.id='ochap-view-mode-entry';
  const label=document.createElement('label');
  label.textContent='表示';
  const select=makeSelect();
  select.value='auto';
  label.append(select);box.append(label);
  select.addEventListener('change',()=>{
    if(select.value!=='auto')launch(select.value,relative(new URL(location.href)));
  });
  document.body.append(box);
})();