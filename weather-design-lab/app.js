/* Interactive layout lab; only the lab preference key can be written. */
(() => {
  'use strict';
  const E=window.HaruWeather,D=window.WeatherDesignSamples,byId=id=>document.getElementById(id);
  const KEY='haru-detail:weather-design-lab-v1',layouts=['list','compare','spot'];
  const labels={list:['01','エリア一覧','行くエリアの中で、どこにするか比べる。'],compare:['02','横並び比較','候補を絞って、同じ項目を並べて比べる。'],spot:['03','スポット詳細','行く場所を中心に、週と時間帯の変化を見る。']};
  let dates=E.dateList(),areas=D.build(dates),expanded=new Set();
  let state={layout:'list',area:areas[0].id,date:dates[1],selected:{},spot:{},stars:[]};
  const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const dateLabel=date=>{const d=new Date(date+'T00:00:00Z');return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+'（'+'日月火水木金土'[d.getUTCDay()]+'）';};
  const area=()=>areas.find(a=>a.id===state.area),day=spot=>spot.days.find(d=>d.date===state.date);
  const message=text=>{byId('interactionStatus').textContent=text;};
  function defaults(){for(const a of areas){state.selected[a.id]=a.spots.slice(0,3).map(s=>s.id);state.spot[a.id]=a.spots[0].id;}}
  function restore(){
    defaults();try{const raw=localStorage.getItem(KEY);if(!raw||raw.length>12000)return;const p=JSON.parse(raw);if(!p||typeof p!=='object')return;
      if(layouts.includes(p.layout))state.layout=p.layout;if(areas.some(a=>a.id===p.area))state.area=p.area;if(dates.includes(p.date))state.date=p.date;
      const ids=areas.flatMap(a=>a.spots.map(s=>s.id));if(Array.isArray(p.stars))state.stars=[...new Set(p.stars.filter(id=>ids.includes(id)))];
      for(const a of areas){const selected=p.selected?.[a.id];if(Array.isArray(selected)){const safe=[...new Set(selected.filter(id=>a.spots.some(s=>s.id===id)))].slice(0,3);if(safe.length)state.selected[a.id]=safe;}if(a.spots.some(s=>s.id===p.spot?.[a.id]))state.spot[a.id]=p.spot[a.id];}
    }catch{ /* Invalid lab preferences never affect real weather/history. */ }
  }
  function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{message('この画面では切り替えできますが、選択を端末に保存できません。');}}
  function wx(code){const info=E.weather(code),n=make('span','wx',info.icon);n.setAttribute('aria-label',info.label);return n;}
  function star(spot){const on=state.stars.includes(spot.id),b=make('button','star',on?'★':'☆');b.type='button';b.dataset.star=spot.id;b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',spot.name+(on?'をこの画面案のお気に入りから外す':'をこの画面案でお気に入りにする'));return b;}
  function flags(d){const n=make('div','flags');for(const text of d.flags)n.append(make('span','flag',text));return n;}
  function hours(d){const grid=make('div','hours');for(const h of d.hours){const n=make('div','hour');n.append(make('h4','',h.hour+'時'),wx(h.code),make('strong','',E.format(h.temp,1)+'°C'),make('small','','風 '+E.format(h.wind,1)+'m/s'));grid.append(n);}return grid;}
  function dateButton(date,index,compact=false){const n=make('button');n.type='button';n.dataset.date=date;n.setAttribute('aria-pressed',String(date===state.date));n.setAttribute('aria-label',dateLabel(date)+'のサンプルを見る');n.append(make('strong','',index===0?'今日':index===1?'明日':date.slice(5).replace('-','/')),make('small','',compact?'日月火水木金土'[new Date(date+'T00:00:00Z').getUTCDay()]+'曜日':dateLabel(date)));return n;}
  function drawDates(){const row=byId('dates'),left=row.scrollLeft;row.replaceChildren();dates.forEach((d,i)=>row.append(dateButton(d,i,true)));row.scrollLeft=left;}
  function heading(title){const n=make('div','panel-heading');n.append(make('h3','',title),make('small','','サンプル予報'));return n;}
  function metric(value,unit,extra=''){const n=make('span','row-metric'+(extra?' '+extra:''));n.append(make('strong','',value),make('small','',unit));return n;}
  function renderList(){
    const root=document.createDocumentFragment(),a=area();root.append(heading(a.name+' · '+dateLabel(state.date)));
    const key=make('div','list-key');['スキー場','新雪','気温','風速',''].forEach(t=>key.append(make('span','',t)));root.append(key);
    const list=make('div','area-list');for(const s of a.spots){const d=day(s),open=expanded.has(s.id),article=make('article','spot-row'),b=make('button','row-toggle');article.dataset.spotRow=s.id;b.type='button';b.dataset.expand=s.id;b.setAttribute('aria-expanded',String(open));b.setAttribute('aria-controls','detail-'+s.id);
      const identity=make('span','row-identity');identity.append(make('strong','',(state.stars.includes(s.id)?'★ ':'')+s.short));const weather=make('span','row-weather');weather.append(wx(d.code),make('span','',E.weather(d.code).label));identity.append(weather);
      b.append(identity,metric(E.format(d.snow),'cm'),metric(E.format(d.tmin)+'〜'+E.format(d.tmax),'°C','row-temp'),metric(E.format(d.wind,1),'m/s'),make('span','row-chevron','⌄'));
      const details=make('div','row-details');details.id='detail-'+s.id;details.hidden=!open;const top=make('div','row-detail-top');top.append(make('p','',s.name+' · 標高'+s.elevation+'m付近の例'),star(s));details.append(top,flags(d),hours(d),make('p','mini-note','朝まで24時間の新雪。気温・風は日中9〜15時。すべて架空の数値です。'));article.append(b,details);list.append(article);
    }root.append(list,make('p','mini-note','行を押すと、時間帯ごとの天気が開きます。'));return root;
  }
  function renderCompare(){
    const root=document.createDocumentFragment(),a=area(),chosen=state.selected[a.id],spots=chosen.map(id=>a.spots.find(s=>s.id===id));
    const selection=make('section','selection-card');selection.append(make('h3','','比較する場所を選ぶ · 最大3か所'));const options=make('div','spot-options');for(const s of a.spots){const b=make('button');b.type='button';b.dataset.compare=s.id;b.setAttribute('aria-pressed',String(chosen.includes(s.id)));b.append(make('span','choice-mark',chosen.includes(s.id)?'✓':''),make('span','',s.short));options.append(b);}selection.append(options);root.append(selection,heading(dateLabel(state.date)+'の比較'));
    const scroll=make('div','compare-scroll');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','選んだスキー場の比較。左右にスクロールできます。');const table=make('table','compare-table');table.style.minWidth=(72+spots.length*110)+'px';
    const colgroup=make('colgroup'),first=make('col');first.style.width='72px';colgroup.append(first);spots.forEach(()=>colgroup.append(make('col')));table.append(colgroup);
    const head=make('thead'),h=make('tr'),blank=make('th','','項目');blank.scope='col';h.append(blank);for(const s of spots){const th=make('th','',s.short);th.scope='col';th.append(make('small','','標高'+s.elevation+'m付近'));h.append(th);}head.append(h);table.append(head);
    const body=make('tbody'),rows=[['天気',d=>E.weather(d.code).label,'weather'],['朝の新雪',d=>E.format(d.snow)+' cm','new-snow'],['日中気温',d=>E.format(d.tmin)+'〜'+E.format(d.tmax)+'°C',''],['最大風速',d=>E.format(d.wind,1)+' m/s',''],['瞬間風速',d=>E.format(d.gust,1)+' m/s',''],['雨',d=>E.format(d.rain,1)+' mm',''],['確認点',d=>d.flags.length?d.flags.join('・'):'風・雨は少なめ','note']];
    for(const [label,value,cls]of rows){const tr=make('tr'),th=make('th','',label);th.scope='row';tr.append(th);for(const s of spots){const d=day(s),td=make('td',cls);if(cls==='weather')td.append(wx(d.code),make('small','',value(d)));else{td.textContent=value(d);if(cls==='note')td.className=d.flags.length?'has-flag':'calm-note';}tr.append(td);}body.append(tr);}table.append(body);scroll.append(table);root.append(scroll,make('p','scroll-hint','3か所を選んだ時は、表を左右に動かして比べられます。'));
    const week=make('section','compare-week');week.append(make('h3','','1週間の新雪を比べる'),make('p','mini-note','同じ場所でも、日を変えるとどうなる？'));const wt=make('table','week-table'),wh=make('thead'),wr=make('tr');wr.append(make('th','','日付'));spots.forEach(s=>wr.append(make('th','',s.short)));wh.append(wr);wt.append(wh);const wb=make('tbody');for(const date of dates){const tr=make('tr',date===state.date?'selected':'');tr.append(make('td','',dateLabel(date)));for(const s of spots){const d=s.days.find(x=>x.date===date),td=make('td');td.append(wx(d.code),document.createTextNode(E.format(d.snow)+'cm'));tr.append(td);}wb.append(tr);}wt.append(wb);week.append(wt);root.append(week);return root;
  }
  function renderSpot(){
    const root=document.createDocumentFragment(),a=area(),spot=a.spots.find(s=>s.id===state.spot[a.id]),d=day(spot);
    const picker=make('div','spot-picker');picker.setAttribute('role','group');picker.setAttribute('aria-label','見たいスキー場');for(const s of a.spots){const b=make('button','',s.short);b.type='button';b.dataset.spot=s.id;b.setAttribute('aria-pressed',String(s.id===spot.id));picker.append(b);}root.append(picker);
    const card=make('article','spot-card'),title=make('div','spot-title'),name=make('div');name.append(make('small','',a.name+' · サンプル予報'),make('h3','',spot.name));title.append(name,star(spot));card.append(title);const sd=make('p','selected-day');sd.append(wx(d.code),make('strong','',dateLabel(state.date)),make('span','',E.weather(d.code).label));card.append(sd);
    const metrics=make('dl','spot-metrics');for(const [label,value,unit,cls]of[['朝までの新雪',E.format(d.snow),'cm',''],['日中気温 °C',E.format(d.tmin)+'〜'+E.format(d.tmax),'','temperature'],['最大風速',E.format(d.wind,1),'m/s','']]){const box=make('div',cls),dd=make('dd','',value);if(unit)dd.append(make('small','',unit));box.append(make('dt','',label),dd);metrics.append(box);}card.append(metrics);const sub=make('div','spot-submetrics');sub.append(make('span','','瞬間風速 '+E.format(d.gust,1)+'m/s'),make('span','','日中の雨 '+E.format(d.rain,1)+'mm'));card.append(sub,flags(d));root.append(card);
    const week=make('section','week-wrap');week.append(make('h3','','1週間のながれ'));const strip=make('div','week-strip');strip.setAttribute('role','group');strip.setAttribute('aria-label','予報の日付を選ぶ');spot.days.forEach((d,i)=>{const b=make('button');b.type='button';b.dataset.date=d.date;b.setAttribute('aria-pressed',String(d.date===state.date));b.setAttribute('aria-label',dateLabel(d.date)+'、新雪'+E.format(d.snow)+'cmのサンプル');const amount=make('strong','',E.format(d.snow));amount.append(make('small','','cm'));b.append(make('span','day-label',i===0?'今日':i===1?'明日':d.date.slice(5).replace('-','/')),wx(d.code),amount);strip.append(b);});week.append(strip,make('p','mini-note','日を押すと、上の予報と時間帯の表示も切り替わります。'));root.append(week);
    const hour=make('section','hour-section');hour.append(make('h3','',dateLabel(state.date)+'の時間帯'),make('p','','朝から午後までの、天気・気温・風の例。'),hours(d));root.append(hour);
    const nearby=make('section','nearby');nearby.append(make('h3','','同じエリアのほかの場所'));const others=make('div','nearby-list');for(const s of a.spots.filter(s=>s.id!==spot.id)){const value=day(s),b=make('button','nearby-row');b.type='button';b.dataset.spot=s.id;const right=make('span');right.append(wx(value.code),make('strong','',E.format(value.snow)+'cm'),make('small','',E.format(value.wind,1)+'m/s'),make('span','','›'));b.append(make('strong','',s.short),right);others.append(b);}nearby.append(others);root.append(nearby);return root;
  }
  function render(){
    const active=document.activeElement,focus=active?.dataset?Object.entries(active.dataset).find(([key])=>['date','expand','compare','spot','star'].includes(key)):null;
    byId('area').value=state.area;for(const b of document.querySelectorAll('[data-layout]')){const selected=b.dataset.layout===state.layout;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;}
    const [number,title,lead]=labels[state.layout];byId('designNumber').textContent='案 '+number;byId('designTitle').textContent=title;byId('designLead').textContent=lead;byId('dateControls').hidden=state.layout==='spot';drawDates();
    const panel=byId('designPanel');panel.setAttribute('aria-labelledby','tab-'+state.layout);panel.replaceChildren(state.layout==='list'?renderList():state.layout==='compare'?renderCompare():renderSpot());
    if(focus){const [key,value]=focus;const replacement=document.querySelector('[data-'+key+'="'+value+'"]');replacement?.focus({preventScroll:true});}
  }
  function setLayout(layout){if(!layouts.includes(layout))return;message('');state.layout=layout;save();render();}
  document.querySelector('.layout-tabs').addEventListener('click',event=>{const value=event.target.closest('[data-layout]')?.dataset.layout;if(value)setLayout(value);});
  document.querySelector('.layout-tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const i=layouts.indexOf(state.layout),next=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;setLayout(layouts[next]);byId('tab-'+state.layout).focus();});
  byId('area').addEventListener('change',event=>{if(!areas.some(a=>a.id===event.target.value))return;message('');state.area=event.target.value;save();render();});
  function interact(event){const target=event.target.closest('button');if(!target)return;const data=target.dataset,a=area();message('');
    if(data.date&&dates.includes(data.date))state.date=data.date;
    else if(data.expand&&a.spots.some(s=>s.id===data.expand)){expanded.has(data.expand)?expanded.delete(data.expand):expanded.add(data.expand);render();return;}
    else if(data.compare&&a.spots.some(s=>s.id===data.compare)){const chosen=state.selected[a.id];if(chosen.includes(data.compare)){if(chosen.length===1){message('比較する場所を1か所以上選んでください。');return;}state.selected[a.id]=chosen.filter(id=>id!==data.compare);}else{if(chosen.length>=3){message('比較は3か所まで。選んだ場所を1つ外してから追加できます。');return;}state.selected[a.id]=[...chosen,data.compare];}}
    else if(data.spot&&a.spots.some(s=>s.id===data.spot))state.spot[a.id]=data.spot;
    else if(data.star&&a.spots.some(s=>s.id===data.star))state.stars=state.stars.includes(data.star)?state.stars.filter(id=>id!==data.star):[...state.stars,data.star];
    else return;save();render();
    if(target.classList.contains('nearby-row'))document.querySelector('.spot-card')?.scrollIntoView?.({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth'});
  }
  byId('dates').addEventListener('click',interact);byId('designPanel').addEventListener('click',interact);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&E.today()!==dates[0]){dates=E.dateList();areas=D.build(dates);if(!dates.includes(state.date))state.date=dates[1];render();}});
  restore();
  const requested=new URLSearchParams(location.search).get('view');if(layouts.includes(requested))state.layout=requested;
  render();
})();
