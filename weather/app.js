/* This page stores only weather preferences and forecast responses. */
(() => {
  'use strict';
  const E = window.HaruWeather, byId = id => document.getElementById(id);
  const KEY = 'haru-detail:mountain-weather-v1', PREF = 'haru-detail:mountain-weather-preferences-v1';
  const VIEW_KEY='haru-detail:mountain-weather-views-v1', V=window.HaruWeatherViews;
  const N=window.HaruNationalCatalog,MAX_FORECAST=40;let rowLimit=40,query='',queryTimer=null,forecastQueue=new Set();
  const layouts=['list','map','compare','spot'], expanded=new Set();
  let mapRenderPending=false;
  let view={layout:'list',compared:Object.create(null),focused:Object.create(null)};
  const MODE_LABELS = {balanced:'バランス',snow:'新雪重視',sun:'晴れ重視'};
  let resorts = [], records = new Map(), failed = new Set(), busy = false, finished = 0, total = 0, storageFailed = false, offline = !navigator.onLine;
  let days = E.dateList(), prefs = {date:days[1],area:'all',prefecture:'all',detailArea:'all',region:'all',candidateMode:false,candidates:[],mode:'balanced',favoritesOnly:false,favorites:[]};
  const el = (tag, cls, text) => { const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n; };
  const nowText = time => new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(time));
  const dateText = date => { const d=new Date(date+'T00:00:00Z');return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+'（'+'日月火水木金土'[d.getUTCDay()]+'）'; };
  function read(key) { try { const raw=localStorage.getItem(key);return raw && raw.length<2500000 ? JSON.parse(raw) : null; } catch { return null; } }
  function write(key,value) { try { localStorage.setItem(key,JSON.stringify(value));return true; } catch { storageFailed=true;return false; } }
  function savePrefs() { write(PREF,{...prefs,query}); }
  function restore() {
    const p=read(PREF), ids=new Set(resorts.map(r=>r.id));
    if(p && typeof p==='object') {
      if(days.includes(p.date))prefs.date=p.date;
      if(typeof p.query==='string')query=p.query.slice(0,100);byId('resortSearch').value=query;
      Object.assign(prefs,N.normalizeScope(p,resorts));
      prefs.candidates=N.normalizeCandidates(p.candidates,resorts);prefs.candidateMode=p.candidateMode===true;
      if(Object.hasOwn(MODE_LABELS,p.mode))prefs.mode=p.mode;
      prefs.favoritesOnly=p.favoritesOnly===true;
      prefs.favorites=Array.isArray(p.favorites)?[...new Set(p.favorites.filter(id=>ids.has(id)))]:[];
    }
    const cache=read(KEY);
    if(cache?.version!==1||!Array.isArray(cache.records))return;
    for(const record of cache.records.slice(0,resorts.length)) {
      if(!ids.has(record?.id)||E.cacheState(record.fetchedAt)==='invalid')continue;
      try { const raw=E.compact(record.raw);records.set(record.id,{id:record.id,raw,fetchedAt:record.fetchedAt,source:record.source==='gfs'?'gfs':'auto'}); } catch { /* Skip only the corrupt location. */ }
    }
  }
  const bucket=()=>(prefs.candidateMode?N.candidateKey(prefs.candidates):prefs.region+(prefs.detailArea==='all'?'':'|'+prefs.detailArea))+(prefs.favoritesOnly?'|favorites':'|all');
  function saveViews(){write(VIEW_KEY,{layout:view.layout,compared:view.compared,focused:view.focused});}
  function restoreViews(){
    const saved=read(VIEW_KEY);if(saved&&typeof saved==='object'){
      if(layouts.includes(saved.layout))view.layout=saved.layout;
      const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
      const compared=object(saved.compared),focused=object(saved.focused);
      const scopes=new Set(['all',...Object.keys(N.AREAS),...new Set(resorts.map(r=>r.region)),...N.DETAIL_AREAS.map(g=>g.prefecture+'|'+g.id),...[...new Set(resorts.map(r=>r.region))].map(p=>p+'|other')]);
      for(const key of new Set([...Object.keys(compared),...Object.keys(focused)])){
        const match=key.match(/^(.*)\|(all|favorites)$/);if(!match)continue;
        const scope=match[1];let locations;
        if(scope.startsWith('candidates:')){
          const tokens=scope.slice('candidates:'.length).split('+').filter(Boolean);if(tokens.length>N.MAX_CANDIDATES)continue;
          const entries=tokens.map(token=>{const parts=token.split('~');return parts.length!==2?null:parts[0]==='area'?{area:parts[1],prefecture:'all',detailArea:'all'}:{prefecture:parts[0],detailArea:parts[1]};});
          const candidates=N.normalizeCandidates(entries,resorts);
          // Only accept canonical keys. Keep every valid saved combination, not just the active one.
          if(N.candidateKey(candidates)!==scope)continue;
          locations=N.candidateResorts(resorts,candidates);
        }else{
          if(!scopes.has(scope))continue;
          const [region,detail='all']=scope.split('|');locations=resorts.filter(r=>N.matchesRegion(r,region)&&N.matchesDetail(r,detail));
        }
        const ids=new Set(locations.map(r=>r.id)),chosen=compared[key];
        if(Array.isArray(chosen))view.compared[key]=[...new Set(chosen.filter(id=>ids.has(id)))].slice(0,3);
        if(ids.has(focused[key]))view.focused[key]=focused[key];
      }
    }
    const requested=new URLSearchParams(location.search).get('view');if(layouts.includes(requested))view.layout=requested;
  }
  function ensureViews(list){
    const key=bucket(),ids=new Set(list.map(r=>r.resort.id));
    let chosen=(view.compared[key]||[]).filter(id=>ids.has(id));if(!chosen.length)chosen=list.slice(0,2).map(r=>r.resort.id);
    view.compared[key]=chosen;if(!ids.has(view.focused[key]))view.focused[key]=list[0]?.resort.id??null;
    return {compared:chosen,focused:view.focused[key]};
  }
  function saveCache() {
    // Bound persistent storage without evicting forecasts used by this open page.
    const cached=[...records.values()].slice(-40);let payload={version:1,records:cached};
    while(JSON.stringify(payload).length>2200000&&cached.length>1)cached.shift();write(KEY,payload);
  }
  function desiredForecasts(){
    const list=viewRecords(),ids=view.layout==='spot'?[view.focused[bucket()]]:view.layout==='compare'?view.compared[bucket()]||[]:list.slice(0,view.layout==='list'?rowLimit:MAX_FORECAST).slice(-MAX_FORECAST).map(r=>r.resort.id);
    return [...new Set(ids.filter(Boolean))].slice(0,MAX_FORECAST);
  }
  const scopeTitle=()=>prefs.detailArea==='other'?prefs.prefecture+'・その他':N.DETAIL_AREAS.find(g=>g.id===prefs.detailArea)?.label||prefs.region;
  function drawScope(){
    const options=N.scopeOptions(resorts,prefs);
    function fill(id,entries,value){
      const select=byId(id),signature=JSON.stringify(entries);
      if(select.dataset.options!==signature){select.replaceChildren(...entries.map(([value,label])=>{const o=el('option','',label);o.value=value;return o;}));select.dataset.options=signature;}
      select.value=value;
    }
    fill('area',[['all','全国'],...options.areas.map(x=>[x,x])],prefs.area);
    fill('region',[['all',prefs.area==='all'?'すべての都道府県':prefs.area+'すべて'],...options.prefectures.map(x=>[x,x])],prefs.prefecture);
    const available=prefs.prefecture!=='all';
    fill('detailArea',[['all',available?'すべてのエリア':'都道府県を選択'],...options.details.map(g=>[g.id,g.label]),...(options.unclassified?[['other','その他・未分類']]:[])],prefs.detailArea);
    byId('detailArea').disabled=!available;
    byId('locationSummary').textContent=[prefs.area==='all'?'全国':prefs.area,prefs.prefecture==='all'?'':prefs.prefecture,prefs.detailArea==='all'?'':prefs.detailArea==='other'?'その他・未分類':scopeTitle()].filter(Boolean).join(' › ');
    byId('locationHelp').firstChild.textContent=available&&!options.details.length?'この都道府県の詳細エリアは未分類です。全域のスキー場を表示できます。 ':available?'未分類の場所も「すべて」か「その他・未分類」で表示できます。 ':'地方だけ、都道府県まででも探せます。 ';
  }
  function drawCandidates(){
    byId('singleAreaMode').setAttribute('aria-pressed',String(!prefs.candidateMode));
    byId('multipleAreaMode').setAttribute('aria-pressed',String(prefs.candidateMode));
    byId('areaCandidates').hidden=!prefs.candidateMode;
    if(!prefs.candidateMode)return;
    const current=prefs,plan=N.addCandidate(prefs.candidates,current,resorts),add=byId('addAreaCandidate');
    add.disabled=plan.status!=='added';
    add.textContent=plan.status==='covered'?'候補に追加済み':plan.status==='limit'?'候補は8エリアまで':plan.status==='invalid'?'地方・都道府県を選んで追加':prefs.prefecture==='all'?'この地方を候補に追加':prefs.detailArea==='all'?'この県を候補に追加':'このエリアを候補に追加';
    byId('candidateSelectionHint').textContent=plan.status==='invalid'?'地方か都道府県を選ぶと追加できます':N.candidateLabel(current);
    byId('candidateCount').textContent=prefs.candidates.length+' / '+N.MAX_CANDIDATES;
    byId('clearAreaCandidates').hidden=!prefs.candidates.length;
    const chips=byId('candidateChips');
    const signature=JSON.stringify(prefs.candidates);
    if(chips.dataset.items!==signature){
      chips.replaceChildren(...prefs.candidates.map(item=>{const chip=el('button','candidate-chip',N.candidateLabel(item)+' ×');chip.type='button';chip.dataset.removeCandidate=N.candidateToken(item);chip.setAttribute('aria-label',N.candidateLabel(item)+'を比較候補から外す');return chip;}));
      chips.dataset.items=signature;
    }
    const summary=byId('locationSummary');summary.textContent='追加するエリア：'+summary.textContent;
    byId('candidateHelp').textContent=prefs.candidates.length?'候補の範囲をまとめて表示中。地方全体・県全体・詳細エリアを混ぜられます。スキー場の横並び比較は3か所まで。':'地方をまたいで8エリアまで追加できます。候補に入れた範囲をまとめて表示します。';
  }
  function candidateFeedback(text){byId('candidateFeedback').textContent=text;}
  function chooseCandidateMode(multiple){
    feedback('');candidateFeedback('');prefs.candidateMode=multiple;rowLimit=40;
    if(multiple&&!prefs.candidates.length&&(prefs.area!=='all'||prefs.prefecture!=='all'))prefs.candidates=N.addCandidate([],prefs,resorts).items;
    savePrefs();render();void refresh();
  }
  function drawDates() {
    days=E.dateList();if(!days.includes(prefs.date))prefs.date=days[1];
    const strip=byId('dates'),left=strip.scrollLeft;strip.replaceChildren();
    days.forEach((date,i)=>{const b=el('button');b.type='button';b.dataset.date=date;b.setAttribute('aria-pressed',String(prefs.date===date));b.setAttribute('aria-label',dateText(date));b.append(el('strong','',i===0?'今日':i===1?'明日':date.slice(5).replace('-','/')),el('small','',i<2?dateText(date):'日月火水木金土'[new Date(date+'T00:00:00Z').getUTCDay()]+'曜日'));strip.append(b);});
    strip.scrollLeft=left;
  }
  function viewRecords() {
    const selected=prefs.candidateMode?N.candidateResorts(resorts,prefs.candidates):prefs.region==='all'?nationwideOrder():resorts.filter(r=>N.matchesRegion(r,prefs.region)&&N.matchesDetail(r,prefs.detailArea));
    return selected.filter(r=>N.matches(r,query)&&(!prefs.favoritesOnly||prefs.favorites.includes(r.id))).map(resort=>{
      const saved=records.get(resort.id);let forecast=[];
      if(saved)try{forecast=days.map(date=>E.summarize(saved.raw,date));}catch{}
      return {resort,days:forecast,fetchedAt:saved?.fetchedAt??'',source:saved?.source??'auto',failed:failed.has(resort.id)};
    });
  }
  function nationwideOrder(){
    const ordered=N.candidateResorts(resorts,Object.keys(N.AREAS).map(area=>({area,prefecture:'all',detailArea:'all'}))),ids=new Set(ordered.map(r=>r.id));
    // Older catalogs used broad region names for some resorts. Never drop unclassified entries.
    return [...ordered,...resorts.filter(r=>!ids.has(r.id))];
  }
  const rankable = record => record.recommendation.eligible && ['fresh','cached'].includes(E.cacheState(record.fetchedAt));
  function reasonList(reasons) {const ul=el('ul','reasons');for(const reason of reasons)ul.append(el('li','',reason));return ul;}
  function empty(title,text,reset=false) {
    const box=el('div','empty');box.append(el('h3','',title),el('p','',text));
    if(reset){const button=el('button','','すべての場所を見る');button.type='button';button.addEventListener('click',()=>{Object.assign(prefs,N.normalizeScope({},resorts));prefs.candidateMode=false;prefs.favoritesOnly=false;query='';byId('resortSearch').value='';rowLimit=40;savePrefs();render();void refresh();});box.append(button);}
    return box;
  }
  function drawRecommendation(list) {
    const target=byId('recommendation');target.replaceChildren();
    if(!list.length)return;
    const picks=list.filter(rankable).slice(0,3);
    if(!picks.length) {
      if(busy && !list.some(r=>r.day))return;
      const anyValid=list.some(r=>r.day?.valid), anyRecent=list.some(r=>r.day?.valid && ['fresh','cached'].includes(E.cacheState(r.fetchedAt)));
      target.append(empty(anyRecent?'今日は条件を見比べて選ぼう':anyValid?'前回の予報を表示中':'予報が揃うと候補が出ます',anyRecent?'風・雨・視界などに確認したい予報があるため、上位候補は出していません。下の一覧と公式情報を確認できます。':anyValid?'取得から6時間以上経っているため、おすすめは更新後に表示します。':'通信できる状態で右上の更新を試してください。取得できない値を0に置き換えることはありません。'));
      return;
    }
    const coverage=list.filter(r=>r.day?.valid&&['fresh','cached'].includes(E.cacheState(r.fetchedAt))).length;
    target.append(el('p','pick-heading',dateText(prefs.date)+' · '+(prefs.candidateMode?'選んだエリアの':'')+'取得済み'+coverage+' / '+list.length+'地点から · '+MODE_LABELS[prefs.mode]+'で選ぶ候補'));
    const r=picks[0],pick=el('article','pick'),body=el('div');
    body.append(el('p','pick-place',r.resort.region+' · '+N.elevation(r.resort)),el('h3','',r.resort.name),reasonList(r.recommendation.reasons));
    const snow=el('div','pick-snow'),strong=el('strong','',E.format(r.day.snow,1));strong.append(el('small','','cm'));snow.append(strong,el('small','','朝までの新雪予想'));
    const link=el('a','open-pick','予報を詳しく見る');link.href='#resort-'+r.resort.id;pick.append(body,snow,link);target.append(pick);
    if(picks.length>1){const runners=el('div','runner-ups');picks.slice(1).forEach((r,i)=>{const a=el('a','',(i+2)+'. '+r.resort.name);a.href='#resort-'+r.resort.id;a.append(el('small','',r.recommendation.reasons[0]));runners.append(a);});target.append(runners);}
    target.append(el('p','guide-line','営業状況・リフト運行は未確認です。各スキー場の公式情報へ。'));
  }
  function render() {
    // Android's native picker restores visibility before delivering its change event.
    // Replacing the input at that moment can discard the selection entirely.
    if(window.HaruSpotInfo?.isPicking?.()){mapRenderPending=true;return;}
    mapRenderPending=false;
    window.HaruMapViewport?.detach();
    const active=document.activeElement,focusedDate=active?.dataset.date,focusedAction=active?.dataset.action,focusedId=active?.dataset.id;
    drawDates();drawScope();drawCandidates();
    byId('favoritesOnly').setAttribute('aria-pressed',String(prefs.favoritesOnly));
    byId('layoutTabs').querySelectorAll('button').forEach(b=>{const selected=b.dataset.view===view.layout;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
    byId('priorities').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===prefs.mode)));
    const base=viewRecords(),ranked=E.ranked(base,prefs.date,prefs.mode),byResort=new Map(ranked.map(r=>[r.resort.id,r]));
    // Keep pagination and fetch selection in the same stable order; rank only the recommendation box.
    const list=base.map(r=>byResort.get(r.resort.id));
    const state=ensureViews(base);byId('catalogScope').textContent=base.length+' / '+resorts.length+'地点 · 名前やエリアで絞り込み。予報は最大40地点ずつ確認します。';const discovery=(prefs.candidateMode||prefs.region==='all')&&view.layout==='list';
    byId('recommendation').hidden=!discovery;byId('priorities').hidden=!discovery&&view.layout!=='map';byId('dateControls').hidden=view.layout==='spot';
    if(discovery)drawRecommendation(ranked);
    const target=byId('resorts');target.dataset.layout=view.layout;target.setAttribute('aria-labelledby','layout-'+view.layout);target.replaceChildren();
    byId('resultsTitle').textContent=view.layout==='map'?(prefs.candidateMode?'候補エリアのマップ':prefs.region==='all'?'全国マップ':scopeTitle()+'のマップ'):view.layout==='compare'?'候補を比較':view.layout==='spot'?'スキー場の詳細':prefs.candidateMode?'候補エリアの予報':prefs.region==='all'?'全国の予報':scopeTitle()+'の予報';
    byId('resultCount').textContent=view.layout==='compare'?state.compared.length+' / '+list.length+'地点':(view.layout==='list'?Math.min(rowLimit,list.length)+' / ':'')+list.length+'地点';
    if(!list.length)target.append(prefs.candidateMode&&!prefs.candidates.length?empty('比べたい地方・県・エリアを追加しよう','上の地方・都道府県・詳細エリアから選び、「候補に追加」を押すと、地方をまたいでまとめて探せます。'):empty(prefs.favoritesOnly?'お気に入りの場所を選ぼう':'表示する場所がありません','名前やお気に入りの条件を変えると、候補を探せます。',true));
    else target.append(V.render({layout:view.layout,entries:view.layout==='list'?list.slice(0,rowLimit):list,dates:days,date:prefs.date,mode:prefs.mode,totalLocations:resorts.length,...state,expanded,busy,offline,formatTime:nowText,isFavorite:id=>prefs.favorites.includes(id)}));
    if(view.layout==='list'&&list.length>rowLimit){const more=el('button','catalog-more','さらに40地点を見る（'+Math.min(rowLimit,list.length)+' / '+list.length+'地点表示）');more.type='button';more.addEventListener('click',()=>{rowLimit+=40;render();void refresh();});target.append(more);}
    const status=byId('status'),good=list.filter(r=>r.day?.valid),old=good.filter(r=>E.cacheState(r.fetchedAt)==='old'),missing=list.filter(r=>!r.day?.valid&&records.has(r.resort.id)),unrequested=list.filter(r=>!records.has(r.resort.id));
    if(prefs.candidateMode&&!prefs.candidates.length)status.textContent='比べたい地方・県・エリアを候補に追加してください。';
    else if(busy)status.textContent='予報を確認中… '+finished+' / '+total+'地点';
    else if(!records.size)status.textContent=offline?'オフラインです。予報はまだ取得できていません。':'予報を取得できませんでした。通信状態を確認して更新を試してください。';
    else {
      const timestamps=list.map(r=>Date.parse(r.fetchedAt)).filter(Number.isFinite);
      status.textContent=(offline?'オフライン · 前回の予報':failed.size?'一部は未取得・前回の予報':'予報の取得時刻')+(timestamps.length?' '+nowText(Math.min(...timestamps))+' JST':'')+(old.length?' · 古い予報 '+old.length+'地点':'')+(missing.length?' · データ不足 '+missing.length+'地点':'')+(unrequested.length?' · 未取得 '+unrequested.length+'地点（地域・名前を選んで確認）':'');
    }
    if(storageFailed)status.textContent+=' · この端末には設定や予報を一時保存できません';
    status.dataset.error=String(!(prefs.candidateMode&&!prefs.candidates.length)&&!busy&&(!records.size||offline||failed.size>0||old.length>0));
    byId('refresh').disabled=busy;byId('refresh').setAttribute('aria-busy',String(busy));
    if(focusedDate)(view.layout==='spot'?target:byId('dates')).querySelector('[data-date="'+focusedDate+'"]')?.focus({preventScroll:true});
    else if(focusedAction&&focusedId)(target.querySelector('[data-action="'+focusedAction+'"][data-id="'+focusedId+'"]')||target.querySelector('[data-action="spot"][data-id="'+focusedId+'"]')||byId('favoritesOnly')).focus({preventScroll:true});
  }
  async function refresh(force=false,requested=null) {
    if(busy){for(const id of requested||desiredForecasts())forecastQueue.add(id);forecastQueue=new Set([...forecastQueue].slice(-MAX_FORECAST));return;}offline=navigator.onLine===false;if(offline){render();return;}
    const wanted=new Set(requested||desiredForecasts()),targets=resorts.filter(r=>wanted.has(r.id)&&(force||!records.has(r.id)||E.cacheState(records.get(r.id).fetchedAt)!=='fresh')).slice(0,MAX_FORECAST);
    if(!targets.length){render();return;}
    busy=true;finished=0;total=targets.length;failed=new Set();render();
    const batches=[];for(let i=0;i<targets.length;i+=5)batches.push(targets.slice(i,i+5));let useBackup=false;
    async function get(url,limit) {
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),limit);
      try {const response=await fetch(url,{signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw Error('HTTP '+response.status);return await response.json();}
      finally {clearTimeout(timeout);}
    }
    async function worker(){while(batches.length){const batch=batches.shift();
      try {
        let payload,source='auto';
        if(!useBackup)try {payload=await get(E.requestUrl(batch),8000);}catch{useBackup=true;}
        if(payload===undefined){payload=await get(E.fallbackUrl(batch),20000);source='gfs';}
        const items=Array.isArray(payload)?payload:[payload],sources=batch.map(()=>source);
        if(items.length!==batch.length)throw Error('地点数が一致しません');
        const incomplete=items.map(input=>{try{const raw=E.compact(input);return !days.some(date=>E.summarize(raw,date).valid);}catch{return true;}});
        if(source==='auto'&&incomplete.some(Boolean)) {
          try {const backup=await get(E.fallbackUrl(batch),20000),backupItems=Array.isArray(backup)?backup:[backup];if(backupItems.length===batch.length)incomplete.forEach((missing,i)=>{if(missing){items[i]=backupItems[i];sources[i]='gfs';}});}catch{ /* Keep useful fields from the primary forecast. */ }
        }
        items.forEach((input,i)=>{try{const raw=E.compact(input),complete=days.some(date=>E.summarize(raw,date).valid);if(complete||!records.has(batch[i].id)){records.delete(batch[i].id);records.set(batch[i].id,{id:batch[i].id,raw,source:sources[i],fetchedAt:new Date().toISOString()});}if(!complete)failed.add(batch[i].id);}catch{failed.add(batch[i].id);}});
      } catch {batch.forEach(r=>failed.add(r.id));}
      finally {finished+=batch.length;render();}
    }}
    await Promise.all([worker(),worker()]);busy=false;offline=navigator.onLine===false;saveCache();render();if(forecastQueue.size){const queued=[...forecastQueue];forecastQueue.clear();void refresh(false,queued);}
  }
  const feedback=text=>{byId('viewStatus').textContent=text;};
  function setView(layout){if(!layouts.includes(layout))return;feedback('');view.layout=layout;saveViews();render();void refresh();}
  function toggleComparison(id){
    const base=viewRecords();ensureViews(base);const key=bucket(),chosen=view.compared[key];
    if(chosen.includes(id)){if(chosen.length===1){feedback('比較する場所を1か所以上選んでください。');return;}view.compared[key]=chosen.filter(x=>x!==id);}
    else{if(chosen.length>=3){feedback('比較は3か所まで。比較画面で1つ外してから追加できます。');return;}view.compared[key]=[...chosen,id];}
    saveViews();render();void refresh(false,view.compared[key]);
  }
  byId('singleAreaMode').addEventListener('click',()=>chooseCandidateMode(false));
  byId('multipleAreaMode').addEventListener('click',()=>chooseCandidateMode(true));
  byId('addAreaCandidate').addEventListener('click',()=>{
    if(!prefs.candidateMode)return;
    const plan=N.addCandidate(prefs.candidates,prefs,resorts);
    if(plan.status!=='added'){candidateFeedback(plan.status==='limit'?'比較候補は8エリアまでです。1つ外すと追加できます。':plan.status==='covered'?'この範囲は候補に入っています。':'地方か都道府県を選んでください。');return;}
    prefs.candidates=plan.items;rowLimit=40;savePrefs();render();candidateFeedback(N.candidateLabel(prefs)+'を候補に追加しました。');void refresh();
  });
  byId('candidateChips').addEventListener('click',event=>{
    const button=event.target.closest('button[data-remove-candidate]');if(!button)return;
    prefs.candidates=prefs.candidates.filter(item=>N.candidateToken(item)!==button.dataset.removeCandidate);rowLimit=40;savePrefs();render();candidateFeedback('候補から外しました。');byId('clearAreaCandidates').hidden?byId('multipleAreaMode').focus({preventScroll:true}):byId('clearAreaCandidates').focus({preventScroll:true});void refresh();
  });
  byId('clearAreaCandidates').addEventListener('click',()=>{prefs.candidates=[];rowLimit=40;savePrefs();render();candidateFeedback('候補をクリアしました。新しく選んで追加できます。');byId('multipleAreaMode').focus({preventScroll:true});});
  byId('resortSearch').addEventListener('input',event=>{query=event.target.value.slice(0,100);rowLimit=40;clearTimeout(queryTimer);queryTimer=setTimeout(()=>{savePrefs();render();void refresh();},180);});
  byId('resorts').addEventListener('change',event=>{if(event.target.dataset.action!=='spot-select')return;const id=event.target.value;if(!viewRecords().some(r=>r.resort.id===id))return;view.focused[bucket()]=id;saveViews();render();void refresh(false,[id]);});
  byId('refresh').addEventListener('click',()=>refresh(true));
  byId('layoutTabs').addEventListener('click',event=>setView(event.target.closest('button')?.dataset.view));
  byId('layoutTabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const i=layouts.indexOf(view.layout),next=event.key==='Home'?0:event.key==='End'?layouts.length-1:(i+(event.key==='ArrowRight'?1:layouts.length-1))%layouts.length;setView(layouts[next]);byId('layout-'+view.layout).focus();});
  byId('dates').addEventListener('click',event=>{const date=event.target.closest('button')?.dataset.date;if(!days.includes(date))return;prefs.date=date;savePrefs();render();});
  function chooseScope(value){feedback('');candidateFeedback('');Object.assign(prefs,N.normalizeScope(value,resorts));rowLimit=40;savePrefs();render();void refresh();}
  byId('area').addEventListener('change',event=>chooseScope({area:event.target.value,prefecture:'all',detailArea:'all'}));
  byId('region').addEventListener('change',event=>chooseScope({area:prefs.area,prefecture:event.target.value,detailArea:'all'}));
  byId('detailArea').addEventListener('change',event=>chooseScope({...prefs,detailArea:event.target.value}));
  byId('priorities').addEventListener('click',event=>{const mode=event.target.closest('button')?.dataset.mode;if(!Object.hasOwn(MODE_LABELS,mode))return;prefs.mode=mode;savePrefs();render();});
  byId('favoritesOnly').addEventListener('click',()=>{feedback('');prefs.favoritesOnly=!prefs.favoritesOnly;rowLimit=40;savePrefs();render();void refresh();});
  byId('resorts').addEventListener('click',event=>{
    const target=event.target.closest('button[data-action]');if(!target)return;const {action,id}=target.dataset;feedback('');
    if(action==='date'){if(!days.includes(id))return;prefs.date=id;savePrefs();render();return;}
    if(!viewRecords().some(r=>r.resort.id===id))return;
    if(action==='map-group'||action==='map-select'){view.focused[bucket()]=id;saveViews();render();void refresh(false,[id]);byId('resorts').querySelector('.map-selected-place')?.scrollIntoView?.({block:'nearest',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});}
    else if(action==='expand'){expanded.has(id)?expanded.delete(id):expanded.add(id);render();if(expanded.has(id))void refresh(false,[id]);}
    else if(action==='favorite'){prefs.favorites=prefs.favorites.includes(id)?prefs.favorites.filter(v=>v!==id):[...prefs.favorites,id];savePrefs();render();}
    else if(action==='compare')toggleComparison(id);
    else if(action==='detail'||action==='spot'){view.focused[bucket()]=id;if(action==='detail')view.layout='spot';saveViews();render();void refresh(false,[id]);if(action==='detail'||target.classList.contains('nearby-row'))byId('resorts').querySelector('.spot-card')?.scrollIntoView?.({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});}
  });
  window.addEventListener('offline',()=>{offline=true;render();});
  window.addEventListener('haru-map-picker-settled',()=>{if(mapRenderPending)render();});
  window.addEventListener('online',()=>{offline=false;refresh();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){days=E.dateList();refresh();}});
  (async()=>{
    try {
      const response=await fetch('resorts.json',{credentials:'omit'});if(!response.ok)throw Error('場所一覧の取得失敗');
      const config=await response.json();if(!Array.isArray(config)||!config.length||config.some(r=>!r.id||!r.name||!r.region||!E.finite(r.lat)||!E.finite(r.lon)||(r.elevation!==null&&!E.finite(r.elevation))||!N.url(r)))throw Error('場所一覧の形式不正');
      resorts=config;byId('results').after(N.credits());restore();restoreViews();render();await refresh();
    } catch {byId('status').textContent='場所の一覧を読み込めませんでした。通信できる状態で開き直してください。';byId('status').dataset.error='true';}
  })();
})();
