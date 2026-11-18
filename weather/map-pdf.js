/* Download PDF.js only when a PDF is imported; save raster pages for offline viewing. */
(() => {
  'use strict';
  const VERSION='6.5.438',DIST='https://cdn.jsdelivr.net/npm/pdfjs-dist@'+VERSION+'/',BASE=DIST+'legacy/build/';
  const FILES=[['pdf.mjs','2792b7c390ad6d5f4245d326b70deebbc990fa4bcac691412f6df886abb9e867'],['pdf.worker.mjs','8336aabf764cb08c818555a2fd2545e4fed10837146de927564875c93b3c4f83']];
  const CACHE='haru-detail:map-pdf-engine:'+new URL('../',location.href).href+':'+VERSION;
  let loading;
  async function verified(response,hash){
    const data=await response.arrayBuffer();if(data.byteLength>5000000)throw Error('PDF表示機能を取得できません。');
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
    if(digest!==hash)throw Error('PDF表示機能の確認に失敗しました。');return new Blob([data],{type:'text/javascript'});
  }
  async function engine(){
    if(!loading)loading=(async()=>{
      const cache=await caches.open(CACHE),urls=[];
      try{
        for(const [name,hash]of FILES){const url=BASE+name;let response=await cache.match(url);
          if(!response){const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),25000);try{response=await fetch(url,{signal:abort.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});if(!response.ok)throw Error('PDF表示機能を取得できません。');const blob=await verified(response,hash);await cache.put(url,new Response(blob,{headers:{'Content-Type':'text/javascript'}}));response=await cache.match(url);}finally{clearTimeout(timeout);}}
          urls.push(URL.createObjectURL(await verified(response,hash)));
        }
        const lib=await import(urls[0]);lib.GlobalWorkerOptions.workerSrc=urls[1];return lib;
      }catch(e){urls.forEach(url=>URL.revokeObjectURL(url));throw e;}
    })().catch(e=>{loading=null;throw e;});return loading;
  }
  const png=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('マップを画像化できません。')),'image/png'));
  async function convert(blob,progress){
    if(navigator.onLine===false)throw Error('PDFは通信できる状態で保存してください。保存済みマップはオフラインでも開けます。');
    const lib=await engine();let task,timer,password=false,timedOut=false;
    try{
      task=lib.getDocument({data:new Uint8Array(await blob.arrayBuffer()),cMapUrl:DIST+'cmaps/',cMapPacked:true,standardFontDataUrl:DIST+'standard_fonts/',wasmUrl:DIST+'wasm/',isEvalSupported:false,disableWorkerRendering:true,useSystemFonts:true,isOffscreenCanvasSupported:false,enableHWA:false});
      timer=setTimeout(()=>{timedOut=true;task.destroy();},90000);
      task.onPassword=()=>{password=true;task.destroy();};
      const pdf=await task.promise;if(pdf.numPages>8)throw Error('8ページ以下のマップPDFを選んでください。');const pages=[];
      for(let i=1;i<=pdf.numPages;i++){
        progress(i,pdf.numPages);const page=await pdf.getPage(i),original=page.getViewport({scale:1});
        if(!Number.isFinite(original.width)||!Number.isFinite(original.height)||original.width<=0||original.height<=0)throw Error('PDFのサイズを読み取れません。');
        const scale=Math.min(3200/Math.max(original.width,original.height),Math.sqrt(8000000/(original.width*original.height))),viewport=page.getViewport({scale}),canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.ceil(viewport.width));canvas.height=Math.max(1,Math.ceil(viewport.height));
        try{await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;pages.push({blob:await png(canvas),width:canvas.width,height:canvas.height});}finally{canvas.width=canvas.height=1;page.cleanup();}
      }
      return pages;
    }catch(e){if(password)throw Error('パスワード付きPDFは保存できません。画像のマップを選んでください。');if(timedOut)throw Error('PDFの処理に時間がかかっています。小さいPDFか画像を試してください。');throw e;}
    finally{clearTimeout(timer);if(task)await task.destroy();}
  }
  window.HaruMapPDF={convert,VERSION};
})();
