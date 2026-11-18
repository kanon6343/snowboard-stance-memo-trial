/* Three forecast views share the same real records. This module never reads storage or fetches data. */
(() => {
  'use strict';
  const E=window.HaruWeather;
  const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const dayLabel=date=>{const d=new Date(date+'T00:00:00Z');return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+'（'+'日月火水木金土'[d.getUTCDay()]+'）';};
  const unknown=date=>({date,snow:null,tmin:null,tmax:null,wind:null,gust:null,rain:null,code:null,valid:false,flags:[],hours:[9,12,15].map(hour=>({hour,temp:null,wind:null,code:null}))});
  const getDay=(record,date)=>record.days?.find(d=>d.date===date)||unknown(date);
  const temperature=d=>E.finite(d.tmin)&&E.finite(d.tmax)?E.format(d.tmin)+'〜'+E.format(d.tmax):'—';
  const button=(text,action,id,cls='')=>{const b=make('button',cls,text);b.type='button';b.dataset.action=action;if(id)b.dataset.id=id;return b;};
  function wx(code){const info=E.weather(code),n=make('span','wx',info.icon);n.setAttribute('aria-label',info.label);return n;}
  function favorite(record,ctx){const on=ctx.isFavorite(record.resort.id),b=button(on?'★':'☆','favorite',record.resort.id,'star');b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',record.resort.name+(on?'をお気に入りから外す':'をお気に入りにする'));return b;}
  function age(record,ctx){
    if(!E.finite(Date.parse(record.fetchedAt)))return '予報は未取得です';
    const state=E.cacheState(record.fetchedAt),prefix=state==='old'?'古い予報 · ':record.failed||ctx.offline?'前回の予報 · ':'取得 ';
    return prefix+ctx.formatTime(record.fetchedAt)+' JST'+(record.source==='gfs'?' · GFS予報':'');
  }
  function source(record,ctx){const n=make('p','view-source'+(E.cacheState(record.fetchedAt)==='old'?' is-old':''),age(record,ctx));return n;}
  function official(record){const a=make('a','official','営業・運行を公式サイトで確認');a.href=record.resort.official;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function flags(d){const n=make('div','flags');for(const text of d.flags||[])n.append(make('span','flag',text));return n;}
  function hours(d){const grid=make('div','hours');for(const h of d.hours||unknown(d.date).hours){const n=make('div','hour');n.append(make('h4','',h.hour+'時'),wx(h.code),make('strong','',E.format(h.temp,1)+'°C'),make('small','','風 '+E.format(h.wind,1)+'m/s'));grid.append(n);}return grid;}
  function metric(value,unit,cls=''){const n=make('span','row-metric'+(cls?' '+cls:''));n.append(make('strong','',value),make('small','',unit));return n;}
  function list(ctx){
    const root=document.createDocumentFragment(),key=make('div','list-key');['スキー場','新雪','気温','風速',''].forEach(t=>key.append(make('span','',t)));root.append(key);
    const items=make('div','area-list');for(const r of ctx.entries){const s=r.resort,d=getDay(r,ctx.date),open=ctx.expanded.has(s.id),article=make('article','spot-row');article.id='resort-'+s.id;
      const b=button('','expand',s.id,'row-toggle');b.setAttribute('aria-expanded',String(open));b.setAttribute('aria-controls','forecast-'+s.id);const identity=make('span','row-identity');identity.append(make('strong','',(ctx.isFavorite(s.id)?'★ ':'')+s.name));const weather=make('span','row-weather');weather.append(wx(d.code),make('span','',E.weather(d.code).label));identity.append(weather);
      if(E.cacheState(r.fetchedAt)==='old'&&r.fetchedAt)identity.append(make('span','row-alert','古い予報'));
      else if(d.flags?.length)identity.append(make('span','row-alert',d.flags[0]));
      else if(!d.valid)identity.append(make('span','row-pending',ctx.busy?'取得中・一部未取得':'一部未取得'));
      b.append(identity,metric(E.format(d.snow,1),'cm'),metric(temperature(d),'°C','row-temp'),metric(E.format(d.wind,1),'m/s'),make('span','row-chevron','⌄'));
      const detail=make('div','row-details');detail.id='forecast-'+s.id;detail.hidden=!open;const top=make('div','row-detail-top');top.append(make('p','',s.region+' · 標高'+s.elevation+'m付近'),favorite(r,ctx));detail.append(top,source(r,ctx),flags(d),hours(d));
      const extra=make('p','mini-note','瞬間風速 '+E.format(d.gust,1)+'m/s · 日中の雨 '+E.format(d.rain,1)+'mm');detail.append(extra);
      if(!d.valid)detail.append(make('p','mini-note','— は予報が取得できていない項目です。'));
      const actions=make('div','view-actions'),compared=ctx.compared.includes(s.id);actions.append(button(compared?'比較に選択中':'比較に追加','compare',s.id,compared?'selected':''),button('この場所の詳細','detail',s.id));detail.append(actions,official(r));article.append(b,detail);items.append(article);
    }root.append(items,make('p','mini-note','行を押すと時間帯の予報や、比較・詳細へのボタンが開きます。'));return root;
  }
  function compare(ctx){
    const root=document.createDocumentFragment(),selection=make('section','selection-card');selection.append(make('h3','','比較する場所 · 最大3か所'));const options=make('div','spot-options');
    for(const r of ctx.entries){const chosen=ctx.compared.includes(r.resort.id),b=button('','compare',r.resort.id);b.setAttribute('aria-pressed',String(chosen));b.append(make('span','choice-mark',chosen?'✓':''),make('span','',r.resort.name));options.append(b);}selection.append(options);root.append(selection);
    const entries=ctx.compared.map(id=>ctx.entries.find(r=>r.resort.id===id)).filter(Boolean),scroll=make('div','compare-scroll');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','選んだスキー場の比較。左右にスクロールできます。');
    const table=make('table','compare-table');table.style.minWidth=(72+entries.length*116)+'px';const cg=make('colgroup'),first=make('col');first.style.width='72px';cg.append(first);entries.forEach(()=>cg.append(make('col')));table.append(cg);
    const head=make('thead'),tr=make('tr'),label=make('th','','項目');label.scope='col';tr.append(label);for(const r of entries){const th=make('th','',r.resort.name);th.scope='col';th.append(make('small','',r.resort.region+' · '+r.resort.elevation+'m'),make('small','view-age',age(r,ctx)));tr.append(th);}head.append(tr);table.append(head);
    const body=make('tbody'),rows=[['天気',d=>E.weather(d.code).label,'weather'],['朝の新雪',d=>E.format(d.snow,1)+' cm','new-snow'],['日中気温',d=>temperature(d)+'°C',''],['最大風速',d=>E.format(d.wind,1)+' m/s',''],['瞬間風速',d=>E.format(d.gust,1)+' m/s',''],['雨',d=>E.format(d.rain,1)+' mm',''],['確認点',d=>!d.valid?'一部未取得':d.flags.length?d.flags.join('・'):'風・雨の確認点なし','note']];
    for(const [text,value,cls]of rows){const row=make('tr'),th=make('th','',text);th.scope='row';row.append(th);for(const r of entries){const d=getDay(r,ctx.date),td=make('td',cls);if(cls==='weather')td.append(wx(d.code),make('small','',value(d)));else{td.textContent=value(d);if(cls==='note')td.className=d.flags?.length||!d.valid?'has-flag':'calm-note';}row.append(td);}body.append(row);}const action=make('tr'),th=make('th','','詳しく');th.scope='row';action.append(th);entries.forEach(r=>{const td=make('td');td.append(button('詳細を見る','detail',r.resort.id,'table-detail'));action.append(td);});body.append(action);table.append(body);scroll.append(table);root.append(scroll,make('p','scroll-hint','3か所を並べた時は、表を左右に動かして比較できます。'));
    const week=make('section','compare-week');week.append(make('h3','','1週間の新雪を比べる'));const wt=make('table','week-table'),wh=make('thead'),whr=make('tr');whr.append(make('th','','日付'));entries.forEach(r=>whr.append(make('th','',r.resort.name)));wh.append(whr);wt.append(wh);const wb=make('tbody');
    for(const date of ctx.dates){const row=make('tr',date===ctx.date?'selected':'');row.append(make('td','',dayLabel(date)));for(const r of entries){const d=getDay(r,date),td=make('td');td.append(wx(d.code),document.createTextNode(E.format(d.snow,1)+'cm'));row.append(td);}wb.append(row);}wt.append(wb);week.append(wt,make('p','mini-note','新雪は朝9時まで24時間の予想です。— は未取得です。'));root.append(week);return root;
  }
  function spot(ctx){
    const root=document.createDocumentFragment(),record=ctx.entries.find(r=>r.resort.id===ctx.focused)||ctx.entries[0],s=record.resort,d=getDay(record,ctx.date),picker=make('div','spot-picker');picker.setAttribute('role','group');picker.setAttribute('aria-label','見るスキー場');
    for(const r of ctx.entries){const b=button(r.resort.name,'spot',r.resort.id);b.setAttribute('aria-pressed',String(r.resort.id===s.id));picker.append(b);}root.append(picker);
    const card=make('article','spot-card');card.id='resort-'+s.id;const title=make('div','spot-title'),name=make('div');name.append(make('small','',s.region+' · 標高'+s.elevation+'m付近'),make('h3','',s.name));title.append(name,favorite(record,ctx));card.append(title);const selected=make('p','selected-day');selected.append(wx(d.code),make('strong','',dayLabel(ctx.date)),make('span','',E.weather(d.code).label));card.append(selected);
    const metrics=make('dl','spot-metrics');for(const [label,value,unit,cls]of[['朝までの新雪',E.format(d.snow,1),'cm',''],['日中気温 °C',temperature(d),'','temperature'],['最大風速',E.format(d.wind,1),'m/s','']]){const n=make('div',cls),dd=make('dd','',value);if(unit)dd.append(make('small','',unit));n.append(make('dt','',label),dd);metrics.append(n);}card.append(metrics);const extra=make('div','spot-submetrics');extra.append(make('span','','瞬間風速 '+E.format(d.gust,1)+'m/s'),make('span','','日中の雨 '+E.format(d.rain,1)+'mm'));card.append(extra,source(record,ctx),flags(d));if(!d.valid)card.append(make('p','mini-note','一部の予報を取得できていません。— の項目は未取得です。'));card.append(official(record));root.append(card);if(window.HaruSpotInfo)root.append(window.HaruSpotInfo.create(s,ctx.date));
    const week=make('section','week-wrap');week.append(make('h3','','1週間のながれ'));const strip=make('div','week-strip');strip.setAttribute('role','group');strip.setAttribute('aria-label','予報の日付を選ぶ');ctx.dates.forEach((date,i)=>{const value=getDay(record,date),b=button('','date',date);b.dataset.date=date;b.setAttribute('aria-pressed',String(date===ctx.date));b.setAttribute('aria-label',dayLabel(date)+'、新雪 '+E.format(value.snow,1)+'cm');const amount=make('strong','',E.format(value.snow,1));amount.append(make('small','','cm'));b.append(make('span','day-label',i===0?'今日':i===1?'明日':date.slice(5).replace('-','/')),wx(value.code),amount);strip.append(b);});week.append(strip,make('p','mini-note','日を押すと、上の予報と時間帯の表示が切り替わります。'));root.append(week);
    const times=make('section','hour-section');times.append(make('h3','',dayLabel(ctx.date)+'の時間帯'),hours(d));root.append(times);
    const others=ctx.entries.filter(r=>r.resort.id!==s.id).sort((a,b)=>Number(b.resort.region===s.region)-Number(a.resort.region===s.region)).slice(0,3);
    if(others.length){const nearby=make('section','nearby');nearby.append(make('h3','',others.every(r=>r.resort.region===s.region)?'同じ地域のほかの場所':'ほかのスキー場'));const list=make('div','nearby-list');for(const r of others){const value=getDay(r,ctx.date),b=button('','spot',r.resort.id,'nearby-row'),right=make('span');right.append(wx(value.code),make('strong','',E.format(value.snow,1)+'cm'),make('small','',E.format(value.wind,1)+'m/s'),make('span','','›'));b.append(make('strong','',r.resort.name),right);list.append(b);}nearby.append(list);root.append(nearby);}return root;
  }
  window.HaruWeatherViews={render:ctx=>ctx.layout==='map'?window.HaruWeatherMap.render(ctx):ctx.layout==='compare'?compare(ctx):ctx.layout==='spot'?spot(ctx):list(ctx)};
})();
