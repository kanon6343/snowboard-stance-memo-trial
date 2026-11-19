/* Search, bounded forecast selection and attribution for the nationwide catalog. */
(() => {
  'use strict';
  const AREAS={'北海道':['北海道'],'東北':['青森','岩手','宮城','秋田','山形','福島'],'関東':['茨城','栃木','群馬','埼玉','千葉','東京','神奈川'],'甲信越':['新潟','山梨','長野'],'北陸':['富山','石川','福井'],'東海':['岐阜','静岡','愛知','三重'],'近畿':['滋賀','京都','大阪','兵庫','奈良','和歌山'],'中国':['鳥取','島根','岡山','広島','山口'],'四国':['徳島','香川','愛媛','高知'],'九州':['福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄']};
  // App navigation areas, not administrative or resort-operating boundaries.
  const DETAIL_AREAS=[{"id":"hokkaido-niseko","prefecture":"北海道","label":"ニセコ・ルスツ","ids":["hirafu","rusutsu","osm-relation-8385428","osm-relation-8385446","osm-relation-14756845","osm-way-935191872"]},{"id":"hokkaido-sapporo","prefecture":"北海道","label":"札幌・小樽・キロロ","ids":["kiroro","skimap-1308","osm-way-1080141945","osm-way-1083658291","osm-way-341164658","osm-way-256401232","osm-way-1080161782","osm-way-1056695421","osm-way-672881398","osm-way-430502608","osm-way-1567243622"]},{"id":"hokkaido-furano","prefecture":"北海道","label":"富良野・トマム","ids":["furano","skimap-12249","osm-way-913328023","osm-way-1467769873","osm-way-1567493675","osm-way-934298187"]},{"id":"hokkaido-asahikawa","prefecture":"北海道","label":"旭川・大雪","ids":["skimap-1236","osm-way-478522135","osm-way-479915906","osm-way-667593226","osm-way-172593585","osm-way-1567564630","osm-way-207269012","osm-way-1458944068","osm-way-487093516","osm-way-1448328280","osm-way-1056651738"]},{"id":"hokkaido-tokachi","prefecture":"北海道","label":"十勝・サホロ","ids":["osm-way-934303265","osm-way-934301491","osm-way-934055659","osm-way-934296801","osm-way-1448331027","osm-way-1567277516"]},{"id":"niigata-yuzawa","prefecture":"新潟","label":"湯沢・南魚沼","ids":["naeba","gala","skimap-1504","osm-way-682257432","osm-way-682257431","osm-way-1042547889","osm-way-948360185","osm-way-626857453","osm-way-948359373","osm-way-949500907","osm-way-680041863","osm-way-1040111000","osm-way-626844179","osm-way-1039248004","osm-way-680045685","osm-way-949496196","osm-way-680041845","osm-way-948328283","osm-way-682257433","osm-way-464023310","osm-way-432881342","osm-way-948360186","osm-way-679253285"]},{"id":"niigata-myoko","prefecture":"新潟","label":"妙高・上越","ids":["akakura","osm-way-937101624","osm-way-1458695224","osm-way-937100229","osm-way-937086872","osm-way-937086873","osm-way-937100226","osm-way-1469699107","osm-way-937100228"]},{"id":"niigata-itoigawa","prefecture":"新潟","label":"糸魚川","ids":["charmant","osm-way-323049815"]},{"id":"niigata-uonuma","prefecture":"新潟","label":"魚沼・十日町","ids":["skimap-1539","osm-way-952120707","osm-way-1568989701","osm-way-1348679001","osm-way-233173940","osm-way-1201567796","osm-way-1568989113","osm-way-1201568241","osm-way-1201570295"]},{"id":"niigata-kaetsu","prefecture":"新潟","label":"下越","ids":["osm-way-1458630488","osm-way-1208479232","osm-way-1208478420","osm-way-1208479993"]},{"id":"nagano-hakuba","prefecture":"長野","label":"白馬・小谷・大町","ids":["happo","osm-way-773558920","osm-way-324162841","osm-way-771665619","osm-way-936978931","osm-way-773558919","osm-way-546849385","osm-way-771665618","osm-way-773558921","osm-way-936980547"]},{"id":"nagano-shiga","prefecture":"長野","label":"志賀・北志賀","ids":["shiga","osm-way-954664891","osm-way-954663673","osm-way-954647481","osm-way-937384804","osm-way-937398568","osm-way-937398573","osm-way-937384809","osm-way-937384807","osm-way-937384808","osm-way-937384806","osm-way-937398570","osm-way-937398576","osm-way-937398575","osm-way-937384805","osm-way-937404334","osm-way-937398574","osm-way-937398571","osm-way-937384811","osm-way-937384810","osm-way-955280979","osm-way-954656377"]},{"id":"nagano-nozawa","prefecture":"長野","label":"野沢・飯山・斑尾","ids":["nozawa","osm-way-1201076626","osm-way-955246841","osm-way-997044731","osm-way-1174493817","osm-way-997044732"]},{"id":"nagano-nagano","prefecture":"長野","label":"長野・戸隠・飯綱","ids":["skimap-1612","osm-way-936983829","osm-way-936983347","osm-way-937371922","osm-way-937080875"]},{"id":"nagano-sugadaira","prefecture":"長野","label":"菅平・須坂","ids":["skimap-1684","osm-way-1202443815","osm-way-1257427792","osm-way-1475616294","osm-way-1257259815","osm-way-1475616299"]},{"id":"nagano-tateshina","prefecture":"長野","label":"蓼科・白樺湖・八ヶ岳","ids":["osm-way-664629852","osm-way-1202440838","osm-way-1202440345","osm-way-1202441057","osm-way-1463884606","osm-way-664629851","osm-way-521974831","osm-way-953872291","osm-way-377436962","osm-way-664637989","osm-way-664637993","osm-way-664954071","osm-way-1202441174","osm-way-664620348"]},{"id":"nagano-kiso","prefecture":"長野","label":"木曽・御嶽","ids":["osm-way-1201230108","osm-way-1567821254","osm-way-103278112","osm-way-161410035"]},{"id":"nagano-matsumoto","prefecture":"長野","label":"松本・乗鞍","ids":["osm-way-1458250741","osm-way-1201232967","osm-way-1201230619"]},{"id":"nagano-ina","prefecture":"長野","label":"伊那・南信","ids":["skimap-1644","osm-way-941714799","osm-way-1567821497","osm-way-1458684045","osm-way-427537955","osm-way-1469706159"]},{"id":"gifu-hida","prefecture":"岐阜","label":"飛騨","ids":["skimap-1709","osm-way-1176728877","osm-way-449289364","osm-way-103280609","osm-way-1176717812","osm-way-1220491455","osm-way-1176708933","osm-way-1220435020"]},{"id":"gifu-okumino","prefecture":"岐阜","label":"奥美濃","ids":["takasu","osm-way-1221233782","osm-way-1189279617","osm-way-1221234009","osm-way-257625735","osm-way-1568983673","osm-way-1458947806","osm-way-1221232599","osm-way-1415197311","osm-way-1221232880","osm-way-1221231986"]},{"id":"gunma-katashina","prefecture":"群馬","label":"沼田・片品・川場","ids":["marunuma","kawaba","osm-way-547179360","osm-way-911279404","osm-way-908947831","osm-way-911521626","osm-way-911279403","osm-way-91224669"]},{"id":"gunma-minakami","prefecture":"群馬","label":"みなかみ","ids":["osm-way-389722521","osm-way-1221236522","osm-way-569178790","osm-way-908946630","osm-way-568836635","osm-way-569151593","osm-way-1221235497"]},{"id":"gunma-agatsuma","prefecture":"群馬","label":"草津・嬬恋・万座","ids":["osm-way-1188381817","osm-way-914531708","osm-way-1158882270","osm-way-1202443039","osm-way-1469703172"]},{"id":"fukushima-bandai","prefecture":"福島","label":"猪苗代・磐梯","ids":["inawashiro","osm-way-320005478","osm-way-322310181","osm-way-319961200","osm-way-322328447","osm-way-322310180","osm-way-322328453","osm-way-320005481","osm-way-322328454","osm-way-322105645"]},{"id":"fukushima-minamiaizu","prefecture":"福島","label":"南会津・檜枝岐","ids":["osm-way-322328448","osm-way-319842653","osm-way-322328449","osm-way-1144295326","osm-way-319879036"]},{"id":"hyogo-hachi","prefecture":"兵庫","label":"ハチ・養父・香美","ids":["hachikita","osm-way-1220422088","osm-way-952183492","osm-way-952183491","osm-way-1220421289","osm-way-1220421900","osm-way-1220420792","osm-way-1567315973"]},{"id":"hyogo-kannabe","prefecture":"兵庫","label":"神鍋","ids":["osm-way-1087495295","osm-way-1568679748","osm-way-1568666832"]},{"id":"hyogo-harima","prefecture":"兵庫","label":"播磨・宍粟","ids":["osm-way-1458631222","osm-way-1201632282","osm-way-1568670453"]},{"id":"shiga-kohoku","prefecture":"滋賀","label":"湖北・奥伊吹","ids":["okuibuki","osm-way-1458245386"]},{"id":"shiga-kosei","prefecture":"滋賀","label":"湖西","ids":["biwako","skimap-1726","osm-relation-17590123","osm-way-1201638581"]}];
  const detailById=new Map(DETAIL_AREAS.map(group=>[group.id,group]));
  const detailByResort=new Map(DETAIL_AREAS.flatMap(group=>group.ids.map(id=>[id,group.id])));
  const areaFor=prefecture=>Object.keys(AREAS).find(area=>AREAS[area].includes(prefecture))||'all';
  const detailFor=resort=>{const id=detailByResort.get(resort.id);return detailById.get(id)?.prefecture===resort.region?id:'';};
  const detailLabel=resort=>detailById.get(detailFor(resort))?.label||'';
  const matchesDetail=(resort,detail)=>!detail||detail==='all'||(detail==='other'?!detailFor(resort):detailFor(resort)===detail);
  function normalizeScope(saved,resorts){
    const p=saved&&typeof saved==='object'?saved:{},prefectures=new Set(resorts.map(r=>r.region));
    let area='all',prefecture='all',detailArea='all';
    if(Object.hasOwn(p,'area')||Object.hasOwn(p,'prefecture')){
      if(p.area==='all'||Object.hasOwn(AREAS,p.area))area=p.area;
      if(prefectures.has(p.prefecture))prefecture=p.prefecture;
    }else if(Object.hasOwn(AREAS,p.region)){area=p.region;}
    else if(prefectures.has(p.region)){prefecture=p.region;area=areaFor(prefecture);}
    if(prefecture!=='all'){
      if(area==='all')area=areaFor(prefecture);
      else if(!AREAS[area].includes(prefecture))prefecture='all';
    }
    if(prefecture!=='all'){
      const group=detailById.get(p.detailArea);
      if(group?.prefecture===prefecture&&resorts.some(r=>detailFor(r)===group.id))detailArea=group.id;
      else if(p.detailArea==='other'&&resorts.some(r=>r.region===prefecture&&!detailFor(r)))detailArea='other';
    }
    return {area,prefecture,detailArea,region:prefecture==='all'?area:prefecture};
  }
  function scopeOptions(resorts,scope){
    const areas=Object.keys(AREAS).filter(area=>resorts.some(r=>AREAS[area].includes(r.region)));
    const prefectures=[...new Set(resorts.filter(r=>scope.area==='all'||AREAS[scope.area]?.includes(r.region)).map(r=>r.region))];
    const details=DETAIL_AREAS.filter(group=>group.prefecture===scope.prefecture&&resorts.some(r=>detailFor(r)===group.id));
    const unclassified=scope.prefecture!=='all'&&resorts.some(r=>r.region===scope.prefecture&&!detailFor(r));
    return {areas,prefectures,details,unclassified};
  }
  const MAX_CANDIDATES=8;
  const isAreaCandidate=item=>item.prefecture==='all'&&Object.hasOwn(AREAS,item.area);
  const candidateToken=item=>isAreaCandidate(item)?'area~'+item.area:item.prefecture+'~'+item.detailArea;
  const candidateKey=items=>'candidates:'+items.map(candidateToken).sort().join('+');
  const candidateLabel=item=>isAreaCandidate(item)?item.area+'全域':item.detailArea==='all'?item.prefecture:item.prefecture+'：'+(item.detailArea==='other'?'その他・未分類':detailById.get(item.detailArea)?.label||'');
  const candidateMatches=(resort,item)=>isAreaCandidate(item)?AREAS[item.area].includes(resort.region):resort.region===item.prefecture&&matchesDetail(resort,item.detailArea);
  function validCandidate(value,resorts){
    if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.prefecture!=='string')return null;
    const detailArea=value.detailArea===undefined?'all':value.detailArea;
    if(typeof detailArea!=='string')return null;
    if(value.prefecture==='all')return Object.hasOwn(AREAS,value.area)&&detailArea==='all'&&resorts.some(r=>AREAS[value.area].includes(r.region))?{area:value.area,prefecture:'all',detailArea:'all'}:null;
    const scope=normalizeScope({area:'all',prefecture:value.prefecture,detailArea},resorts);
    return scope.prefecture!=='all'&&scope.prefecture===value.prefecture&&scope.detailArea===detailArea?{prefecture:scope.prefecture,detailArea}:null;
  }
  function candidateCovers(parent,child){
    if(isAreaCandidate(parent))return isAreaCandidate(child)?parent.area===child.area:AREAS[parent.area].includes(child.prefecture);
    if(isAreaCandidate(child))return parent.detailArea==='all'&&AREAS[child.area].length===1&&AREAS[child.area][0]===parent.prefecture;
    return parent.prefecture===child.prefecture&&(parent.detailArea==='all'||parent.detailArea===child.detailArea);
  }
  function addCandidate(current,value,resorts){
    const item=validCandidate(value,resorts);if(!item)return {items:current,status:'invalid'};
    if(current.some(x=>candidateCovers(x,item)))return {items:current,status:'covered'};
    const next=current.filter(x=>!candidateCovers(item,x));
    if(next.length>=MAX_CANDIDATES)return {items:current,status:'limit'};
    return {items:[...next,item],status:'added'};
  }
  function normalizeCandidates(value,resorts){
    let items=[];for(const entry of Array.isArray(value)?value.slice(0,100):[])items=addCandidate(items,entry,resorts).items;return items;
  }
  function candidateResorts(resorts,items){
    const lists=items.map(item=>resorts.filter(resort=>candidateMatches(resort,item))),seen=new Set(),out=[];
    // Interleave selected areas so the first bounded forecast batch includes each.
    for(let i=0;i<Math.max(0,...lists.map(x=>x.length));i++)for(const list of lists){const r=list[i];if(r&&!seen.has(r.id)){seen.add(r.id);out.push(r);}}
    return out;
  }
  const norm=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s・ー_-]/g,'');
  const matchesRegion=(resort,region)=>region==='all'||resort.region===region||AREAS[region]?.includes(resort.region);
  const matches=(resort,query)=>!query||norm([resort.name,resort.aliases,resort.region,resort.locality,detailLabel(resort)].join(' ')).includes(norm(query));
  const elevation=resort=>Number.isFinite(resort.elevation)?'標高'+resort.elevation+'m付近':'標高未登録（予報は地形データを使用）';
  const safe=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
  const url=resort=>safe(resort.official)||safe(resort.sourceUrl);
  const websiteLabel=resort=>resort.legacy?'営業・運行を公式サイトで確認':resort.official?'登録サイトで営業情報を確認':'地図の施設情報を確認';
  function credits(){
    const wrapper=document.createElement('section');wrapper.className='catalog-credits';const credit=document.createElement('p');credit.textContent="OpenSkiData / OpenSkiMap.org · © OpenStreetMap contributors (ODbL) · Skimap.org · Who's On First · © Mapterhorn";wrapper.append(credit);
    const box=document.createElement('details');const heading=document.createElement('summary');heading.textContent='全国の施設データ・収録範囲について';box.append(heading);wrapper.append(box);
    const note=document.createElement('p');note.textContent='OpenSkiDataの日本の下り系施設から、廃止扱い・名称未登録を除いて収録。現在の営業を保証する一覧ではなく、収録漏れ・重複・休止施設が含まれる可能性があります。';box.append(note);
    for(const [label,href]of [['OpenSkiData / OpenSkiMap.org','https://www.openskidata.org/'],['© OpenStreetMap contributors（ODbL）','https://www.openstreetmap.org/copyright'],['Skimap.org','https://skimap.org/'],["Who's On First",'https://whosonfirst.org/'],['© Mapterhorn','https://mapterhorn.com/'],['加工データ・ライセンス','DATA-LICENSE.md']]){const a=document.createElement('a');a.textContent=label;a.href=href;a.target='_blank';a.rel='noopener noreferrer';box.append(a,document.createTextNode(' · '));}return wrapper;
  }
  window.HaruNationalCatalog={AREAS,MAX_CANDIDATES,isAreaCandidate,candidateCovers,candidateToken,candidateKey,candidateLabel,candidateMatches,addCandidate,normalizeCandidates,candidateResorts,DETAIL_AREAS,areaFor,detailFor,detailLabel,matchesDetail,normalizeScope,scopeOptions,matchesRegion,matches,elevation,url,websiteLabel,credits,PAGE_SIZE:40,MAX_FORECAST:40};
})();
