/* A static locator with shared forecast records; no tiles, geolocation, requests or storage. */
(() => {
  'use strict';
  const E=window.HaruWeather,NS='http://www.w3.org/2000/svg';
  const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const button=(text,action,id,cls='')=>{const n=make('button',cls,text);n.type='button';n.dataset.action=action;n.dataset.id=id;return n;};
  const svg=(tag,attrs)=>{const n=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))n.setAttribute(key,String(value));return n;};
  const project=resort=>({x:(resort.lon-128.5)*38,y:(46.5-resort.lat)*47});
  const recent=r=>['fresh','cached'].includes(E.cacheState(r.fetchedAt));
  const island=region=>region==='北海道'?'hokkaido':['愛媛','香川','徳島','高知'].includes(region)?'shikoku':['福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島'].includes(region)?'kyushu':region==='沖縄'?'okinawa':'honshu';
  function hotCandidates(entries,date,mode){return E.ranked(entries,date,mode).filter(r=>recent(r)&&r.recommendation.eligible&&r.recommendation.score>=75).slice(0,3);}
  const zoomLevel=scale=>scale>=8?3:scale>=4?2:scale>=2?1:0;
  const levelScale=[1,2,4,8];
  function partition(entries,limit){
    const sets=entries.map(r=>({items:[r],...project(r.resort)}));
    while(true){let closest=null,distance=limit;
      for(let i=0;i<sets.length;i++)for(let j=i+1;j<sets.length;j++){
        if(island(sets[i].items[0].resort.region)!==island(sets[j].items[0].resort.region))continue;
        const items=[...sets[i].items,...sets[j].items];let fits=true;
        for(let a=0;a<items.length&&fits;a++)for(let b=a+1;b<items.length;b++){const p=project(items[a].resort),q=project(items[b].resort);if(Math.hypot(p.x-q.x,p.y-q.y)>limit){fits=false;break;}}
        const d=Math.hypot(sets[i].x-sets[j].x,sets[i].y-sets[j].y);if(fits&&d<distance){distance=d;closest=[i,j];}
      }
      if(!closest)break;const [i,j]=closest,items=[...sets[i].items,...sets[j].items];sets[i]={items,x:items.reduce((sum,r)=>sum+project(r.resort).x,0)/items.length,y:items.reduce((sum,r)=>sum+project(r.resort).y,0)/items.length};sets.splice(j,1);
    }return sets;
  }
  function groups(entries,scale=1,width=350){
    const level=zoomLevel(scale);let sets=partition(entries,110);
    // Each level only splits its parent; unrelated clusters never merge on zoom-in.
    if(level>=1)sets=sets.flatMap(g=>partition(g.items,55));
    if(level>=2)sets=sets.flatMap(g=>partition(g.items,22));
    if(level>=3)sets=sets.flatMap(g=>g.items.map(r=>({items:[r],...project(r.resort)})));
    const gap=55*700/(Math.max(240,width)*levelScale[level]),pad=Math.max(12,gap/2);
    sets.forEach(s=>{s.px=s.x;s.py=s.y;});
    for(let n=0;n<150;n++)for(let i=0;i<sets.length;i++)for(let j=i+1;j<sets.length;j++){
      const a=sets[i],b=sets[j],x=b.px-a.px,y=b.py-a.py,d=Math.hypot(x,y);if(d>=gap)continue;
      const ux=d>.01?x/d:1,uy=d>.01?y/d:0,shift=(gap-d)/2+.01;
      a.px=Math.max(pad,Math.min(700-pad,a.px-ux*shift));a.py=Math.max(pad,Math.min(780-pad,a.py-uy*shift));b.px=Math.max(pad,Math.min(700-pad,b.px+ux*shift));b.py=Math.max(pad,Math.min(780-pad,b.py+uy*shift));
    }return sets;
  }
  function source(record,ctx){
    const at=Date.parse(record.fetchedAt),state=E.cacheState(record.fetchedAt);
    return !E.finite(at)?'予報は未取得です':(state==='old'?'古い予報 · ':record.failed||ctx.offline?'前回の予報 · ':'取得 ')+ctx.formatTime(record.fetchedAt)+' JST'+(record.source==='gfs'?' · GFS予報':'');
  }
  function render(ctx){
    const root=make('div','national-map-view'),picks=hotCandidates(ctx.entries,ctx.date,ctx.mode),hot=new Set(picks.map(r=>r.resort.id)),clusters=groups(ctx.entries,window.HaruMapViewport?.getState().scale||1);
    const focused=ctx.entries.find(r=>r.resort.id===ctx.focused)||picks[0]||ctx.entries[0],group=clusters.find(g=>g.items.some(r=>r.resort.id===focused.resort.id)),title=make('div','map-intro');
    title.append(make('h3','','地図で、次に滑る場所を探そう'),make('p','',ctx.date.replaceAll('-','/')+' · '+ctx.entries.length+' / '+ctx.totalLocations+'地点を表示'));root.append(title);
    const picksBox=make('section','map-hot-picks');picksBox.append(make('h3','','🔥 激アツ候補'+(picks.length?' · '+picks.length+'か所':'')));
    if(picks.length){const options=make('div','map-hot-options');picks.forEach((r,i)=>{const b=button('','map-select',r.resort.id);b.setAttribute('aria-pressed',String(r.resort.id===focused.resort.id));b.append(make('span','hot-rank',String(i+1)),make('strong','',r.resort.name),make('small','',r.recommendation.reasons[0]));options.append(b);});picksBox.append(options);}
    else picksBox.append(make('p','info-small',ctx.busy?'予報がそろうと、条件の良い候補を表示します。':'今の予報では該当なし。地図から各地の天気を見比べられます。'));
    root.append(picksBox);
    const toolbar=make('div','map-zoom-controls'),out=button('−','map-zoom-out','','map-zoom-button'),inside=button('+','map-zoom-in','','map-zoom-button'),reset=button('全体へ','map-reset','','map-reset-button'),level=make('output','map-zoom-level','100%'),hint=make('p','map-gesture-hint');out.setAttribute('aria-label','地図を縮小');inside.setAttribute('aria-label','地図を拡大');reset.setAttribute('aria-label','地図全体を表示');level.setAttribute('aria-label','地図の拡大率');toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','地図の拡大と縮小');toolbar.append(out,level,inside,reset);root.append(toolbar,hint);
    let pins=[],pinLayout='';const board=make('div','national-map-board');board.tabIndex=0;board.setAttribute('role','group');board.setAttribute('aria-label','スキー場の簡易位置図。数字のボタンから周辺の場所を選べます。');
    const land=svg('svg',{viewBox:'0 0 700 780','aria-hidden':'true',focusable:'false',class:'japan-outline'});for(const d of window.HaruJapanOutline||[])land.append(svg('path',{d}));
    for(const [label,x,y]of[['北海道',553,92],['東北',529,346],['関東',480,539],['中部',342,465],['近畿',284,586],['中国',161,525],['四国',221,672],['九州',42,720]]){const t=svg('text',{x,y});t.textContent=label;land.append(t);}board.append(land);
    const leaders=svg('g',{class:'map-leaders'});land.append(leaders);
    function updatePins(scale,width){
      const key=zoomLevel(scale)+'|'+Math.round(width);if(key===pinLayout)return pins;pinLayout=key;
      const groupsNow=groups(ctx.entries,scale,width),selectedGroup=groupsNow.find(g=>g.items.some(r=>r.resort.id===focused.resort.id));
      const hadFocus=board.contains(document.activeElement)&&document.activeElement?.classList.contains('map-location');
      board.querySelectorAll('.map-location').forEach(node=>node.remove());leaders.replaceChildren();pins=[];
      for(const c of groupsNow){
        const count=c.items.length,hotCount=c.items.filter(r=>hot.has(r.resort.id)).length,available=c.items.some(r=>r.day?.valid&&recent(r)),selected=c===selectedGroup,id=selected?focused.resort.id:c.items[0].resort.id;
        const b=button(String(count),count===1?'map-select':'map-group',id,'map-location'+(count===1?' is-single':'')+(hotCount?' is-hot':available?'':' is-unknown')+(selected?' is-selected':''));
        if(Math.hypot(c.px-c.x,c.py-c.y)>2)leaders.append(svg('line',{x1:c.x,y1:c.y,x2:c.px,y2:c.py,class:'map-leader'}),svg('circle',{cx:c.x,cy:c.y,r:3,class:'map-anchor'}));
        b.style.left=c.px/700*100+'%';b.style.top=c.py/780*100+'%';b.setAttribute('aria-pressed',String(selected));
        b.setAttribute('aria-label',count===1?c.items[0].resort.name+(hotCount?'、激アツ候補':'')+'を選ぶ':[...new Set(c.items.map(r=>r.resort.region))].join('・')+'付近、'+count+'地点'+(hotCount?'、激アツ候補'+hotCount+'か所':'')+'を選ぶ');
        b.title=c.items.map(r=>r.resort.name).join('・');if(hotCount)b.append(make('span','map-fire','🔥'));
        if(count===1)b.append(make('span','map-pin-name',c.items[0].resort.name));
        board.append(b);pins.push({node:b,x:c.px,y:c.py,selected,ids:c.items.map(r=>r.resort.id)});
      }
      choiceButtons.replaceChildren();for(const r of selectedGroup.items){const b=button((hot.has(r.resort.id)?'🔥 ':'')+r.resort.name,'map-select',r.resort.id);b.setAttribute('aria-pressed',String(r.resort.id===focused.resort.id));choiceButtons.append(b);}
      if(hadFocus)board.focus({preventScroll:true});return pins;
    }
    root.append(board);const legend=make('div','national-map-legend');for(const [cls,text]of[['hot','激アツ候補あり'],['normal','予報あり'],['unknown','古い・未取得']]){const n=make('span');n.append(make('i',cls),document.createTextNode(text));legend.append(n);}root.append(legend,make('p','map-locator-note','数字は周辺の地点数です。拡大して指を離すとピンが分かれ、最大付近では1地点ずつ選べます。縮小すると再びまとまります。海岸線の細かな凹凸を省いた地図です。ピンは押しやすい位置へ調整し、元の概略位置と線で結んでいます。'));
    const choices=make('section','map-nearby-choices');choices.append(make('h3','','この付近のゲレンデ'));const choiceButtons=make('div','map-member-buttons');
    for(const r of group.items){const b=button((hot.has(r.resort.id)?'🔥 ':'')+r.resort.name,'map-select',r.resort.id);b.setAttribute('aria-pressed',String(r.resort.id===focused.resort.id));choiceButtons.append(b);}choices.append(choiceButtons);root.append(choices);
    const r=focused,d=r.day,card=make('article','map-selected-place'),head=make('div','map-selected-head'),name=make('div');card.id='map-selected-'+r.resort.id;card.tabIndex=-1;name.append(make('small','',r.resort.region+' · 標高'+r.resort.elevation+'m付近'),make('h3','',r.resort.name));
    const fav=ctx.isFavorite(r.resort.id),star=button(fav?'★':'☆','favorite',r.resort.id,'star');star.setAttribute('aria-label',r.resort.name+(fav?'をお気に入りから外す':'をお気に入りにする'));star.setAttribute('aria-pressed',String(fav));head.append(name,star);card.append(head);
    if(hot.has(r.resort.id))card.append(make('p','hot-selected-label','🔥 激アツ候補 · 天気予報から選択'));
    card.append(make('p','map-selected-weather',E.weather(d?.code).icon+' '+E.weather(d?.code).label));const metrics=make('dl','map-selected-metrics');
    for(const [label,value]of[['朝までの新雪',E.format(d?.snow,1)+'cm'],['日中気温',E.finite(d?.tmin)&&E.finite(d?.tmax)?E.format(d.tmin)+'〜'+E.format(d.tmax)+'°C':'—'],['最大風速',E.format(d?.wind,1)+'m/s']]){const part=make('div');part.append(make('dt','',label),make('dd','',value));metrics.append(part);}card.append(metrics,make('p','view-source',source(r,ctx)));
    if(hot.has(r.resort.id)){const why=make('ul','map-reasons');r.recommendation.reasons.forEach(text=>why.append(make('li','',text)));card.append(why);}
    else if(!d?.valid)card.append(make('p','operation-age','一部の予報は未取得です。— は0ではありません。'));
    else if(!recent(r))card.append(make('p','operation-age','古い予報のため、激アツ候補にはしていません。'));
    if(d?.flags?.length){const flags=make('div','flags');d.flags.forEach(t=>flags.append(make('span','flag',t)));card.append(flags);}
    card.append(button('この場所の詳細を見る','detail',r.resort.id,'map-detail-button'));root.append(card);
    const all=make('details','map-all-places');all.append(make('summary','','名前から選ぶ · '+ctx.entries.length+'地点'));const names=make('div','map-member-buttons');for(const entry of ctx.entries){const b=button(entry.resort.name,'map-select',entry.resort.id);b.setAttribute('aria-pressed',String(entry.resort.id===r.resort.id));names.append(b);}all.append(names);root.append(all);
    root.append(make('p','map-locator-note','激アツ候補は、新雪・雲・風・雨の独自比較で75点以上の上位3地点。取得から6時間以上前・未取得・強風や雷雨などの予報は対象外です。営業中・雪質・滑走の安全性を保証する表示ではありません。'));
    updatePins(window.HaruMapViewport?.getState().scale||1,350);
    window.HaruMapViewport?.attach({board,land,pins,updatePins,controls:{out,inside,reset,level,hint},focused:focused.resort.id,scope:ctx.entries.map(r=>r.resort.id).join(',')});
    const credit=make('a','map-credit','地図データ：Natural Earth（海岸線を簡略化）');credit.href='https://www.naturalearthdata.com/about/terms-of-use/';credit.target='_blank';credit.rel='noopener noreferrer';root.append(credit);return root;
  }
  window.HaruWeatherMap={render,groups,project,hotCandidates,zoomLevel};
})();
