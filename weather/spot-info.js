/* Official operations and optional local maps are separate from forecast dates and memo data. */
(() => {
  'use strict';
  const KEY='haru-detail:resort-operations-v1',S=window.HaruMapStore;
  const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const button=(text,fn,cls='')=>{const b=node('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;};
  const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
  const link=(text,url)=>{const a=node('a','info-link',text);a.href=safeUrl(url)||'#';a.target='_blank';a.rel='noopener noreferrer';return a;};
  const stamp=value=>{const t=Date.parse(value);return Number.isFinite(t)?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(t)+' JST':'未確認';};
  let catalog=null,operations=null,pending=null,current=null,mapDialog=null,lastAttempt=0,loadFailed=false,picker=null;
  try{const raw=localStorage.getItem(KEY);if(raw&&raw.length<500000)operations=validate(JSON.parse(raw));}catch{}
  function validate(data){
    if(data?.version!==1||!data.resorts||!Number.isFinite(Date.parse(data.generatedAt)))throw Error('形式不正');
    const result={version:1,generatedAt:data.generatedAt,resorts:{}};
    for(const [id,entry]of Object.entries(data.resorts).slice(0,40)){
      if(!/^[a-z][a-z0-9-]{0,39}$/.test(id)||!entry)continue;result.resorts[id]={};
      for(const kind of ['lifts','courses']){const value=entry[kind];if(!value||!safeUrl(value.sourceUrl))continue;
        result.resorts[id][kind]={state:value.state==='ok'?'ok':'unavailable',sourceUrl:value.sourceUrl,checkedAt:value.checkedAt,sourceUpdatedAt:value.sourceUpdatedAt,
          items:Array.isArray(value.items)?value.items.slice(0,120).filter(x=>x&&typeof x.name==='string'&&typeof x.label==='string').map(x=>({name:x.name.slice(0,100),label:x.label.slice(0,40),status:['open','closed','limited','outside'].includes(x.status)?x.status:'unknown'})):[]};
      }
    }return result;
  }
  async function getJson(url){const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),12000);try{const r=await fetch(url,{cache:'no-store',credentials:'omit',signal:abort.signal});if(!r.ok)throw Error('取得失敗');return await r.json();}finally{clearTimeout(timeout);}}
  async function load(force=false){
    if(pending)return pending;
    if(!force&&Date.now()-lastAttempt<60000)return;
    lastAttempt=Date.now();
    pending=(async()=>{
      try{if(!catalog){const r=await fetch('spot-catalog.json',{credentials:'omit'});if(!r.ok)throw Error();const c=await r.json();if(c.version!==1||!Array.isArray(c.resorts))throw Error();catalog=new Map(c.resorts.filter(x=>/^[a-z][a-z0-9-]{0,39}$/.test(x.id)).map(x=>[x.id,x]));}
        if(navigator.onLine!==false&&(force||!operations||Date.now()-Date.parse(operations.generatedAt)>600000)){
          operations=validate(await getJson('operations.json?t='+Math.floor(Date.now()/60000)));
          try{localStorage.setItem(KEY,JSON.stringify(operations));}catch{}
        }
        loadFailed=false;
      }catch{loadFailed=true;/* Never infer an operation state from forecasts. */}
    })().finally(()=>{pending=null;if(current?.root.isConnected)drawOperations(current);});return pending;
  }
  function sourceState(value){
    if(!value||value.state!=='ok'||!value.items?.length)return 'unavailable';
    const time=Date.parse(value.sourceUpdatedAt),checked=Date.parse(value.checkedAt),now=Date.now();
    if(!Number.isFinite(time))return 'undated';
    if(!Number.isFinite(checked)||time>now+300000||checked>now+300000||now-time>6*3600000||now-checked>2*3600000||navigator.onLine===false)return 'old';
    return 'recent';
  }
  function drawOperations(ctx){
    const {root,resort}=ctx,body=root.querySelector('.operations-body');if(!body)return;body.replaceChildren();
    const info=catalog?.get(resort.id),entry=operations?.resorts?.[resort.id];
    const grid=node('div','operations-grid');
    for(const [kind,label,key]of[['courses','コース','courseUrl'],['lifts','リフト','liftUrl']]){
      const value=entry?.[kind],state=sourceState(value),card=node('section','operation-card'),heading=node('h4','',label);card.append(heading);
      if(state==='unavailable')card.append(node('p','operation-summary','未取得'),node('p','info-small',info?.adapter?'掲載情報を取得できませんでした。公式で確認できます。':'アプリ内表示は準備中。公式で確認できます。'));
      else{
        const open=value.items.filter(x=>x.status==='open').length,unknown=value.items.filter(x=>x.status==='unknown').length;
        const headline=unknown?open+'件 '+(kind==='lifts'?'運行の掲載':'滑走可の掲載')+'・不明'+unknown+'件':open+' / '+value.items.length+' '+(kind==='lifts'?'運行の掲載':'滑走可の掲載');
        card.append(node('p','operation-summary',state==='recent'?headline:'掲載 '+value.items.length+'件'));
        card.append(node('p','operation-age',state==='old'?'古い掲載・現在の状況は未確認':state==='undated'?'公式の更新日時が不明':'公式の掲載内容'));
        const detail=node('details','operation-details'),summary=node('summary','','内訳を見る');detail.append(summary);const list=node('ul');
        for(const item of value.items){const li=node('li'),badge=node('span','operation-badge'+(state==='recent'?' '+item.status:''),item.label);li.append(node('span','',item.name),badge);list.append(li);}detail.append(list);card.append(detail);
        card.append(node('p','info-small','公式更新：'+stamp(value.sourceUpdatedAt)),node('p','info-small','取得：'+stamp(value.checkedAt)));
      }
      card.append(link('公式で'+label+'状況を確認',info?.[key]||resort.official));grid.append(card);
    }
    body.append(grid,node('p','info-small','指定日の予報ではなく、公式の直近掲載内容です。古い・日時不明の掲載から現在の営業状況は判断できません。'));
    if(loadFailed)body.append(node('p','operation-age','再取得できませんでした。保存済みの掲載と公式リンクを表示しています。'));
    const actions=node('div','info-actions');const refresh=button('掲載情報を再確認',async()=>{refresh.disabled=true;refresh.textContent='確認中…';await load(true);},'operation-refresh');refresh.disabled=navigator.onLine===false;actions.append(refresh);body.append(actions);
    const official=root.querySelector('.map-official');if(official&&info){official.href=safeUrl(info.mapFile)||safeUrl(info.mapPage)||resort.official;official.textContent=info.mapFile?'① 公式マップをダウンロード':info.mapIsPortal?'① 公式サイトでマップを探す':'① 公式マップを開く';}
  }
  async function imagePage(blob){
    return new Promise((resolve,reject)=>{const image=new Image(),url=URL.createObjectURL(blob);image.onload=()=>{URL.revokeObjectURL(url);if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>30000000){reject(Error('画像が大きすぎます。3000万画素以下で保存してください。'));return;}resolve([{blob,width:image.naturalWidth,height:image.naturalHeight}]);};image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('画像を読み込めません。別の画像を選んでください。'));};image.src=url;});
  }
  function status(ctx,text){if(ctx.message.isConnected)ctx.message.textContent=text;}
  function settlePicker(ctx){
    if(!ctx.picking)return;ctx.picking=false;clearTimeout(ctx.returnTimer);
    if(picker===ctx)picker=null;
    window.dispatchEvent(new window.Event('haru-map-picker-settled'));
  }
  function beginPicker(ctx){
    if(ctx.saving||ctx.picking)return;ctx.picking=true;picker=ctx;
  }
  function chosenFile(ctx){
    const file=ctx.input.files?.[0];
    if(file&&!ctx.saving)void importFile(ctx,file);
    settlePicker(ctx);
  }
  function pickerReturned(){
    const ctx=picker;if(!ctx?.picking)return;clearTimeout(ctx.returnTimer);
    // Native change/cancel normally fires first. Older pickers may only restore focus.
    ctx.returnTimer=setTimeout(()=>{if(ctx.picking)chosenFile(ctx);},1500);
  }
  async function importFile(ctx,file){
    if(!file||ctx.saving)return;ctx.saving=true;ctx.input.disabled=true;const {resort}=ctx;
    try{
      const type=await S.fileType(file),old=await S.get(resort.id);
      if(old&&!window.confirm(resort.name+'の保存済みマップを置き換えますか？'))return;
      status(ctx,type==='application/pdf'?'PDFを準備中… 初回は表示機能も取得します。':'マップを保存中…');
      const original=file.slice(0,file.size,type),pages=type==='application/pdf'?await window.HaruMapPDF.convert(original,(page,total)=>status(ctx,'マップを画像化中… '+page+' / '+total+'ページ')):await imagePage(original);
      await S.put({id:resort.id,name:String(file.name||'ゲレンデマップ').slice(0,180),savedAt:new Date().toISOString(),type,original,pages});
      status(ctx,resort.name+'のマップをこの端末に保存しました。オフラインでも開けます。');
      if(current?.resort.id===resort.id){current.previewSavedAt=null;await drawMap(current);}
    }catch(e){status(ctx,(e?.message||'保存できませんでした。')+' 元の保存済みマップは変更していません。');}
    finally{ctx.saving=false;ctx.input.disabled=false;ctx.input.value='';}
  }
  function showMap(record,resort,trigger){
    if(mapDialog)mapDialog.close();const dialog=node('dialog','map-dialog'),head=node('header','map-view-head'),title=node('h3','',resort.name+'のマップ');title.id='local-map-title';dialog.setAttribute('aria-labelledby',title.id);
    const close=button('閉じる',()=>dialog.close(),'map-close');head.append(title,close);dialog.append(head);
    const toolbar=node('div','map-toolbar'),pages=node('select');pages.setAttribute('aria-label','マップのページ');record.pages.forEach((_,i)=>{const o=node('option','',(i+1)+' / '+record.pages.length+'ページ');o.value=i;pages.append(o);});
    const zoom=node('select');zoom.setAttribute('aria-label','マップの拡大率');[100,150,200,300].forEach(value=>{const o=node('option','',value===100?'全体':value+'%');o.value=value;zoom.append(o);});toolbar.append(pages,zoom);dialog.append(toolbar);
    const viewport=node('div','map-viewport');viewport.tabIndex=0;viewport.setAttribute('aria-label','保存したマップ。拡大すると上下左右に動かせます。');const image=node('img','local-map-image');image.alt=resort.name+' ゲレンデマップ';viewport.append(image);dialog.append(viewport);
    const note=node('p','info-small','保存：'+stamp(record.savedAt)+' · '+record.name+'。この地図は運行状況を示しません。');dialog.append(note);
    let objectUrl;const display=()=>{if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(record.pages[Number(pages.value)||0].blob);image.src=objectUrl;viewport.scrollTop=viewport.scrollLeft=0;};
    pages.addEventListener('change',display);zoom.addEventListener('change',()=>{image.style.width=zoom.value+'%';});display();
    const original=link('元ファイルを書き出す','#');const originalUrl=URL.createObjectURL(record.original);original.href=originalUrl;original.download=record.name;dialog.append(original);
    dialog.addEventListener('close',()=>{URL.revokeObjectURL(objectUrl);URL.revokeObjectURL(originalUrl);dialog.remove();if(mapDialog===dialog)mapDialog=null;if(trigger?.isConnected)trigger.focus({preventScroll:true});},{once:true});
    document.body.append(dialog);mapDialog=dialog;dialog.showModal();close.focus();
  }
  async function drawMap(ctx){
    const target=ctx.root.querySelector('.map-saved');if(!target)return;const token=++ctx.token;
    try{
      const value=await S.get(ctx.resort.id);if(!target.isConnected||token!==ctx.token)return;
      if(value&&ctx.previewSavedAt===value.savedAt&&target.querySelector('.map-preview'))return;
      releasePreview(ctx);target.replaceChildren();
      if(!value){target.append(node('p','info-small','まだ保存されていません。必要な場所の画像かPDFだけ追加できます。'));return;}
      const bytes=value.original.size+value.pages.reduce((n,p)=>n+p.blob.size,0);let preview;preview=button('',()=>showMap(value,ctx.resort,preview),'map-preview map-open');
      preview.setAttribute('aria-label',ctx.resort.name+'の保存したマップを全画面で表示');
      const image=node('img','map-preview-image');image.alt=ctx.resort.name+'の保存したゲレンデマップ';image.decoding='async';
      ctx.previewUrl=URL.createObjectURL(value.pages[0].blob);ctx.previewSavedAt=value.savedAt;image.src=ctx.previewUrl;
      preview.append(image,node('span','map-expand-label','⛶ 全画面'));target.append(preview,node('p','map-preview-hint','タップで全画面表示'+(value.pages.length>1?' · 全'+value.pages.length+'ページ':'')),node('p','saved-map-name',value.name),node('p','info-small',stamp(value.savedAt)+' 保存 · '+(bytes/1024/1024).toFixed(1)+' MB'));
      const actions=node('div','info-actions');
      const remove=button('端末から削除',async()=>{if(!window.confirm(ctx.resort.name+'の保存したマップだけを削除しますか？'))return;try{await S.remove(ctx.resort.id);status(ctx,'保存したマップを削除しました。');await drawMap(ctx);}catch(e){status(ctx,e.message);}},'map-remove');actions.append(remove);target.append(actions);
    }catch(e){if(target.isConnected){releasePreview(ctx);target.textContent=e.message;}}
  }
  function releasePreview(ctx){if(ctx?.previewUrl)URL.revokeObjectURL(ctx.previewUrl);if(ctx){ctx.previewUrl=null;ctx.previewSavedAt=null;}}
  function create(resort,date){
    // Keep the actual file input and progress/error feedback through forecast refreshes.
    if(current?.resort.id===resort.id){current.date=date;const ctx=current;queueMicrotask(()=>{drawMap(ctx);load();});return ctx.root;}
    releasePreview(current);
    const root=node('section','spot-information');root.dataset.resort=resort.id;
    const operationsBox=node('section','operations-section');operationsBox.append(node('h3','','コース・リフト状況'),node('div','operations-body'));root.append(operationsBox);
    const map=node('section','map-section');map.append(node('h3','','ゲレンデマップ'),node('p','info-small','必要な場所だけ端末に保存。画像・PDFに対応します。'));
    const actions=node('div','map-import-actions'),official=link('① 公式サイトでマップを探す',resort.official);official.classList.add('map-official');const label=node('label','map-file-label','② ファイルから保存'),input=node('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,application/pdf';input.setAttribute('aria-label',resort.name+'のマップをファイルから保存');label.append(input);actions.append(official,label);map.append(actions,node('div','map-saved'));
    const message=node('p','map-message');message.setAttribute('role','status');message.setAttribute('aria-live','polite');map.append(message);
    const help=node('details','map-help');help.append(node('summary','','保存について'));help.append(node('p','info-small','公式マップをダウンロードし、ファイルから取り込んでください。PDFの保存時は通信が必要です。初回は表示機能（約3.5MB）も取得します。ファイルは外部へ送信せず、この端末で画像化します。1ファイル25MB・PDF8ページまで。'));
    help.append(node('p','info-small','保存したマップは履歴のJSONバックアップには含まれません。元ファイルを残してください。ブラウザのデータ削除や空き容量不足で消えることがあります。'));
    help.append(link('PDF表示：Mozilla PDF.js 6.5.438（Apache 2.0）','https://github.com/mozilla/pdf.js/releases/tag/v6.5.438'));map.append(help);root.append(map);
    const ctx={root,resort,date,input,message,token:0,saving:false,picking:false,returnTimer:null};current=ctx;
    input.addEventListener('click',()=>beginPicker(ctx));input.addEventListener('change',()=>chosenFile(ctx));input.addEventListener('cancel',()=>settlePicker(ctx));
    drawOperations(ctx);queueMicrotask(()=>{drawMap(ctx);load();});return root;
  }
  window.addEventListener('online',()=>load(true));window.addEventListener('offline',()=>{if(current?.root.isConnected)drawOperations(current);});
  window.addEventListener('focus',pickerReturned);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pickerReturned();});
  window.HaruSpotInfo={create,sourceState,validate,isPicking:()=>Boolean(picker?.picking)};
})();
