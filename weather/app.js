/* This page stores only weather preferences and forecast responses. */
(() => {
  'use strict';
  const E = window.HaruWeather, byId = id => document.getElementById(id);
  const KEY = 'haru-detail:mountain-weather-v1', PREF = 'haru-detail:mountain-weather-preferences-v1';
  const MODE_LABELS = {balanced:'バランス',snow:'新雪重視',sun:'晴れ重視'};
  let resorts = [], records = new Map(), failed = new Set(), busy = false, finished = 0, total = 0, storageFailed = false, offline = !navigator.onLine;
  let days = E.dateList(), prefs = {date:days[1],region:'all',mode:'balanced',favoritesOnly:false,favorites:[]};
  const el = (tag, cls, text) => { const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n; };
  const nowText = time => new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(time));
  const dateText = date => { const d=new Date(date+'T00:00:00Z');return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+'（'+'日月火水木金土'[d.getUTCDay()]+'）'; };
  function read(key) { try { const raw=localStorage.getItem(key);return raw && raw.length<2500000 ? JSON.parse(raw) : null; } catch { return null; } }
  function write(key,value) { try { localStorage.setItem(key,JSON.stringify(value));return true; } catch { storageFailed=true;return false; } }
  function savePrefs() { write(PREF,prefs); }
  function restore() {
    const p=read(PREF), ids=new Set(resorts.map(r=>r.id));
    if(p && typeof p==='object') {
      if(days.includes(p.date))prefs.date=p.date;
      if(p.region==='all'||resorts.some(r=>r.region===p.region))prefs.region=p.region;
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
  function saveCache() { write(KEY,{version:1,records:[...records.values()]}); }
  function drawDates() {
    days=E.dateList();if(!days.includes(prefs.date))prefs.date=days[1];
    const strip=byId('dates'),left=strip.scrollLeft;strip.replaceChildren();
    days.forEach((date,i)=>{const b=el('button');b.type='button';b.dataset.date=date;b.setAttribute('aria-pressed',String(prefs.date===date));b.setAttribute('aria-label',dateText(date));b.append(el('strong','',i===0?'今日':i===1?'明日':date.slice(5).replace('-','/')),el('small','',i<2?dateText(date):'日月火水木金土'[new Date(date+'T00:00:00Z').getUTCDay()]+'曜日'));strip.append(b);});
    strip.scrollLeft=left;
  }
  function viewRecords() {
    return resorts.filter(r=>(prefs.region==='all'||r.region===prefs.region)&&(!prefs.favoritesOnly||prefs.favorites.includes(r.id))).map(resort=>{
      const saved=records.get(resort.id);let forecast=[];
      if(saved)try{forecast=days.map(date=>E.summarize(saved.raw,date));}catch{}
      return {resort,days:forecast,fetchedAt:saved?.fetchedAt??'',failed:failed.has(resort.id)};
    });
  }
  const rankable = record => record.recommendation.eligible && ['fresh','cached'].includes(E.cacheState(record.fetchedAt));
  function metric(label,value,unit='') {
    const box=el('div');box.append(el('dt','',label));const dd=el('dd','',value);if(unit)dd.append(el('small','',unit));box.append(dd);return box;
  }
  function linkOfficial(resort) {
    const a=el('a','official','営業・運行を公式サイトで確認');a.href=resort.official;a.target='_blank';a.rel='noopener noreferrer';return a;
  }
  function reasonList(reasons) {const ul=el('ul','reasons');for(const reason of reasons)ul.append(el('li','',reason));return ul;}
  function empty(title,text,reset=false) {
    const box=el('div','empty');box.append(el('h3','',title),el('p','',text));
    if(reset){const button=el('button','','すべての場所を見る');button.type='button';button.addEventListener('click',()=>{prefs.region='all';prefs.favoritesOnly=false;savePrefs();render();});box.append(button);}
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
    target.append(el('p','pick-heading',dateText(prefs.date)+' · '+MODE_LABELS[prefs.mode]+'で選ぶ候補'));
    const r=picks[0],pick=el('article','pick'),body=el('div');
    body.append(el('p','pick-place',r.resort.region+' · 標高'+r.resort.elevation+'m付近'),el('h3','',r.resort.name),reasonList(r.recommendation.reasons));
    const snow=el('div','pick-snow'),strong=el('strong','',E.format(r.day.snow,1));strong.append(el('small','','cm'));snow.append(strong,el('small','','朝までの新雪予想'));
    const link=el('a','open-pick','予報を詳しく見る');link.href='#resort-'+r.resort.id;pick.append(body,snow,link);target.append(pick);
    if(picks.length>1){const runners=el('div','runner-ups');picks.slice(1).forEach((r,i)=>{const a=el('a','',(i+2)+'. '+r.resort.name);a.href='#resort-'+r.resort.id;a.append(el('small','',r.recommendation.reasons[0]));runners.append(a);});target.append(runners);}
    target.append(el('p','guide-line','営業状況・リフト運行は未確認です。各スキー場の公式情報へ。'));
  }
  function weekly(rows) {
    const details=el('details','forecast-more');details.append(el('summary','','7日間の予報を見る'));
    const table=el('table'),head=el('thead'),tr=el('tr');['日付','朝の新雪','日中の気温','最大風速'].forEach(label=>{const th=el('th','',label);th.scope='col';tr.append(th);});head.append(tr);table.append(head);
    const body=el('tbody');for(const d of rows){const tr=el('tr',d.date===prefs.date?'selected':'');[dateText(d.date),E.format(d.snow,1)+' cm',E.finite(d.tmin)&&E.finite(d.tmax)?E.format(d.tmin)+'〜'+E.format(d.tmax)+'°':'—',E.format(d.wind,1)+' m/s'].forEach(value=>tr.append(el('td','',value)));body.append(tr);}table.append(body,el('caption','','新雪は朝9時まで24時間、気温・風は9〜15時。すべて予想値。'));details.append(table);return details;
  }
  function card(record) {
    const {resort,day:d}=record,box=el('article','resort');box.id='resort-'+resort.id;
    const head=el('div','resort-head'),title=el('div');title.append(el('p','place',resort.region+' · 標高'+resort.elevation+'m付近'),el('h3','',resort.name));
    const favorite=prefs.favorites.includes(resort.id),star=el('button','favorite',favorite?'★':'☆');star.type='button';star.dataset.favorite=resort.id;star.setAttribute('aria-pressed',String(favorite));star.setAttribute('aria-label',resort.name+(favorite?'をお気に入りから外す':'をお気に入りにする'));head.append(title,star);box.append(head);
    if(!d){box.append(el('p','guide-line',busy?'予報を取得しています…':'予報を取得できていません。'));box.append(linkOfficial(resort));return box;}
    const wx=E.weather(d.code),line=el('p','weather-line');line.append(el('span','weather-symbol',wx.icon),el('span','',wx.label),el('span','place','日中の予報'));box.append(line);
    const metrics=el('dl','metrics');metrics.append(metric('朝までの新雪',E.format(d.snow,1),'cm'),metric('日中気温 °C',E.finite(d.tmin)&&E.finite(d.tmax)?E.format(d.tmin)+'〜'+E.format(d.tmax):'—'),metric('最大風速',E.format(d.wind,1),'m/s'));box.append(metrics);
    const extra=el('div','extra-metrics');extra.append(el('span','','瞬間風速 '+E.format(d.gust,1)+'m/s'),el('span','','日中の雨 '+E.format(d.rain,1)+'mm'));box.append(extra);
    if(d.flags.length){const flags=el('div','flags');d.flags.forEach(f=>flags.append(el('span','flag',f)));box.append(flags);}
    if(!d.valid)box.append(el('p','guide-line','一部の予報が欠けています。— の項目は未取得です。'));
    else if(rankable(record))box.append(reasonList(record.recommendation.reasons));
    const state=E.cacheState(record.fetchedAt),saved=records.get(resort.id),age=el('small','age'+(state==='old'?' old':''),(record.failed||offline?'前回の予報 · ':'取得 ')+nowText(record.fetchedAt)+(saved?.source==='gfs'?' · GFS予報':'')+(state==='old'?' · 古い予報のため候補対象外':''));box.append(age,weekly(record.days),linkOfficial(resort));return box;
  }
  function render() {
    const focusedDate=document.activeElement?.dataset.date;
    drawDates();byId('region').value=prefs.region;
    byId('favoritesOnly').setAttribute('aria-pressed',String(prefs.favoritesOnly));
    byId('priorities').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===prefs.mode)));
    const list=E.ranked(viewRecords(),prefs.date,prefs.mode);drawRecommendation(list);
    const openIds=new Set([...byId('resorts').querySelectorAll('details[open]')].map(d=>d.closest('article').id));
    const target=byId('resorts');target.replaceChildren();
    byId('resultCount').textContent=list.length+'地点';
    if(!list.length)target.append(empty(prefs.favoritesOnly?'お気に入りの場所を選ぼう':'表示する場所がありません','各スキー場の☆で登録すると、ここだけに絞り込めます。',true));
    else list.forEach(r=>{const n=card(r);if(openIds.has(n.id))n.querySelector('details')?.setAttribute('open','');target.append(n);});
    const status=byId('status'),good=list.filter(r=>r.day?.valid),old=good.filter(r=>E.cacheState(r.fetchedAt)==='old'),missing=list.filter(r=>!r.day?.valid);
    if(busy)status.textContent='予報を確認中… '+finished+' / '+total+'地点';
    else if(!records.size)status.textContent='予報を取得できませんでした。通信状態を確認して更新を試してください。';
    else {
      const timestamps=list.map(r=>Date.parse(r.fetchedAt)).filter(Number.isFinite);
      status.textContent=(offline?'オフライン · 前回の予報':failed.size?'一部は前回の予報':'予報の取得時刻')+(timestamps.length?' '+nowText(Math.min(...timestamps))+' JST':'')+(old.length?' · 古い予報 '+old.length+'地点':'')+(missing.length?' · データ不足 '+missing.length+'地点':'');
    }
    if(storageFailed)status.textContent+=' · この端末には一時保存できません';
    status.dataset.error=String(!busy&&(!records.size||offline||failed.size>0||old.length>0));
    byId('refresh').disabled=busy;byId('refresh').setAttribute('aria-busy',String(busy));
    if(focusedDate)byId('dates').querySelector('[data-date="'+focusedDate+'"]')?.focus({preventScroll:true});
  }
  async function refresh(force=false) {
    if(busy)return;offline=navigator.onLine===false;
    const targets=resorts.filter(r=>force||!records.has(r.id)||E.cacheState(records.get(r.id).fetchedAt)!=='fresh');
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
        items.forEach((input,i)=>{try{const raw=E.compact(input),complete=days.some(date=>E.summarize(raw,date).valid);if(complete||!records.has(batch[i].id))records.set(batch[i].id,{id:batch[i].id,raw,source:sources[i],fetchedAt:new Date().toISOString()});if(!complete)failed.add(batch[i].id);}catch{failed.add(batch[i].id);}});
      } catch {batch.forEach(r=>failed.add(r.id));}
      finally {finished+=batch.length;render();}
    }}
    await Promise.all([worker(),worker()]);busy=false;offline=navigator.onLine===false;saveCache();render();
  }
  byId('refresh').addEventListener('click',()=>refresh(true));
  byId('dates').addEventListener('click',event=>{const date=event.target.closest('button')?.dataset.date;if(!days.includes(date))return;prefs.date=date;savePrefs();render();});
  byId('region').addEventListener('change',event=>{prefs.region=event.target.value;savePrefs();render();});
  byId('priorities').addEventListener('click',event=>{const mode=event.target.closest('button')?.dataset.mode;if(!Object.hasOwn(MODE_LABELS,mode))return;prefs.mode=mode;savePrefs();render();});
  byId('favoritesOnly').addEventListener('click',()=>{prefs.favoritesOnly=!prefs.favoritesOnly;savePrefs();render();});
  byId('resorts').addEventListener('click',event=>{const id=event.target.closest('button')?.dataset.favorite;if(!resorts.some(r=>r.id===id))return;prefs.favorites=prefs.favorites.includes(id)?prefs.favorites.filter(v=>v!==id):[...prefs.favorites,id];savePrefs();render();(byId('resorts').querySelector('[data-favorite="'+id+'"]')||byId('favoritesOnly')).focus({preventScroll:true});});
  window.addEventListener('offline',()=>{offline=true;render();});
  window.addEventListener('online',()=>{offline=false;refresh();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){days=E.dateList();refresh();}});
  (async()=>{
    try {
      const response=await fetch('resorts.json',{credentials:'omit'});if(!response.ok)throw Error('場所一覧の取得失敗');
      const config=await response.json();if(!Array.isArray(config)||!config.length||config.some(r=>!r.id||!r.name||!r.region||!E.finite(r.lat)||!E.finite(r.lon)||!E.finite(r.elevation)||!/^https:\/\//.test(r.official)))throw Error('場所一覧の形式不正');
      resorts=config;[...new Set(resorts.map(r=>r.region))].forEach(region=>{const o=el('option','',region);o.value=region;byId('region').append(o);});restore();render();await refresh();
    } catch {byId('status').textContent='場所の一覧を読み込めませんでした。通信できる状態で開き直してください。';byId('status').dataset.error='true';}
  })();
})();
