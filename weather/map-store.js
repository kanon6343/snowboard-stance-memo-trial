/* Maps stay on this device. Store replacement is one IndexedDB transaction. */
(() => {
  'use strict';
  const DB='haru-detail:resort-maps-v1',STORE='maps',LIMIT=25*1024*1024;
  let database;
  function open(){
    if(database)return database;
    database=new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(Error('このブラウザではマップを保存できません。'));return;}
      const r=indexedDB.open(DB,1);
      r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'id'});};
      r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();database=null;};resolve(db);};
      r.onerror=()=>reject(Error('マップの保存先を開けません。'));
      r.onblocked=()=>reject(Error('別の画面を閉じてからもう一度試してください。'));
    }).catch(e=>{database=null;throw e;});return database;
  }
  async function transaction(mode,action){
    const db=await open();return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode);let value;
      tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(Error('マップを保存・取得できません。空き容量やブラウザの設定を確認してください。'));
      try{const req=action(tx.objectStore(STORE));req.onsuccess=()=>{value=req.result;};}catch(e){tx.abort();reject(e);}
    });
  }
  function id(value){if(!/^[a-z][a-z0-9-]{0,39}$/.test(value))throw Error('場所が不正です。');return value;}
  async function fileType(file){
    if(!file||!Number.isFinite(file.size)||file.size<8||file.size>LIMIT)throw Error('25MB以下の画像かPDFを選んでください。');
    const h=new Uint8Array(await file.slice(0,16).arrayBuffer()),text=String.fromCharCode(...h);
    if(text.startsWith('%PDF-'))return 'application/pdf';
    if(h[0]===0xff&&h[1]===0xd8&&h[2]===0xff)return 'image/jpeg';
    if(h[0]===0x89&&text.slice(1,4)==='PNG'&&h[4]===13&&h[5]===10&&h[6]===26&&h[7]===10)return 'image/png';
    if(text.startsWith('RIFF')&&text.slice(8,12)==='WEBP')return 'image/webp';
    throw Error('JPEG・PNG・WebP画像、またはPDFを選んでください。');
  }
  async function put(value){
    id(value.id);if(!value.original||!Array.isArray(value.pages)||!value.pages.length||value.pages.length>8||value.pages.some(p=>!(p.blob instanceof Blob)))throw Error('保存するマップが不正です。');
    if(value.original.size+value.pages.reduce((sum,p)=>sum+p.blob.size,0)>100*1024*1024)throw Error('表示用データが大きすぎます。画像を小さくして試してください。');
    return transaction('readwrite',store=>store.put(value));
  }
  window.HaruMapStore={get:value=>transaction('readonly',store=>store.get(id(value))),put,remove:value=>transaction('readwrite',store=>store.delete(id(value))),fileType,LIMIT};
})();
