/* Search, bounded forecast selection and attribution for the nationwide catalog. */
(() => {
  'use strict';
  const AREAS={'北海道':['北海道'],'東北':['青森','岩手','宮城','秋田','山形','福島'],'関東':['茨城','栃木','群馬','埼玉','千葉','東京','神奈川'],'甲信越':['新潟','山梨','長野'],'北陸':['富山','石川','福井'],'東海':['岐阜','静岡','愛知','三重'],'近畿':['滋賀','京都','大阪','兵庫','奈良','和歌山'],'中国':['鳥取','島根','岡山','広島','山口'],'四国':['徳島','香川','愛媛','高知'],'九州':['福岡','佐賀','長崎','熊本','大分','宮崎','鹿児島','沖縄']};
  const norm=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s・ー_-]/g,'');
  const matchesRegion=(resort,region)=>region==='all'||resort.region===region||AREAS[region]?.includes(resort.region);
  const matches=(resort,query)=>!query||norm([resort.name,resort.aliases,resort.region,resort.locality].join(' ')).includes(norm(query));
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
  window.HaruNationalCatalog={AREAS,matchesRegion,matches,elevation,url,websiteLabel,credits,PAGE_SIZE:40,MAX_FORECAST:40};
})();
