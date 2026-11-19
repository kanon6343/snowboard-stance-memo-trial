/* Static mapped inventory is deliberately separate from current official operations. */
(() => {
  'use strict';
  let cache=null,pending=null;
  const n=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const types={chair_lift:'チェアリフト',gondola:'ゴンドラ',cable_car:'ロープウェイ',rope_tow:'ロープトウ','t-bar':'Tバー','j-bar':'Jバー',platter:'プラッター',magic_carpet:'動く歩道',mixed_lift:'混合リフト',funicular:'ケーブルカー'};
  const difficulty={novice:'入門',easy:'初級',intermediate:'中級',advanced:'上級',expert:'最上級',freeride:'非圧雪・フリーライド',other:'その他',unknown:'難易度未登録'};
  const safe=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
  async function load(){
    if(cache)return cache;if(pending)return pending;
    pending=(async()=>{const response=await fetch('facilities.json',{credentials:'omit'});if(!response.ok)throw Error('基本情報を取得できませんでした');const data=await response.json();if(data.version!==1||!data.resorts)throw Error('基本情報の形式を確認できません');cache=data;return data;})().finally(()=>{pending=null;});return pending;
  }
  function create(resort){
    const box=n('section','facility-information');box.append(n('h3','','リフト・コースの基本情報'));const body=n('div');body.textContent='地図の登録情報を準備中…';box.append(body);
    load().then(data=>{
      if(!box.isConnected)return;body.replaceChildren();const info=data.resorts[resort.id];
      body.append(n('p','info-small','地図登録データ · '+data.sourceDate+'版。当日の運行・滑走可否は上の公式掲載情報で確認してください。'));
      if(!info){body.append(n('p','info-small','この施設の一覧は未収録です。'));return;}
      const grid=n('div','facility-grid');
      for(const [kind,label]of [['lifts','リフト'],['courses','名前付きコース']]){
        const items=Array.isArray(info[kind])?info[kind]:[],section=n('section','facility-card');section.append(n('h4','',label),n('p','facility-count',items.length?items.length+'件の記録':'未収録'));
        if(items.length){const details=n('details','facility-list');details.append(n('summary','','一覧を見る'));const list=n('ul');
          for(const item of items){const li=n('li'),name=n('span','',item.name),meta=n('small');if(kind==='lifts'){meta.textContent=types[item.type]||item.type||'種類未登録';if(item.sourceStatus&&item.sourceStatus!=='operating')meta.textContent+=' · 地図記録：'+({disused:'休止',construction:'建設中',proposed:'計画',unknown:'状態未登録'}[item.sourceStatus]||item.sourceStatus);}
            else meta.textContent=(difficulty[item.difficulty]||'難易度未登録')+(item.segments>1?' · '+item.segments+'区間を名称でまとめて表示':'');li.append(name,meta);list.append(li);}details.append(list);section.append(details);
        }grid.append(section);
      }body.append(grid);
      if(info.unnamedCourseSegments)body.append(n('p','info-small','ほかに名称未登録のコースが'+info.unnamedCourseSegments+'区間あります。'));
      body.append(n('p','info-small','地図上の記録を数えています。名称の重複・未登録や区間の分割があるため、公式のリフト本数・コース数とは異なる場合があります。未収録は「存在しない」という意味ではありません。'));
      if(safe(info.sourceUrl)){const link=n('a','info-link','地図の掲載元を確認');link.href=safe(info.sourceUrl);link.target='_blank';link.rel='noopener noreferrer';body.append(link);}body.append(window.HaruNationalCatalog.credits());
    }).catch(error=>{if(box.isConnected)body.textContent=error.message+'。ネット接続時に開き直してください。';});return box;
  }
  window.HaruFacilityInfo={create};
})();
