/* Small SVG camera. No tiles, dependencies, requests or persistent data. */
(() => {
  'use strict';
  const WIDTH=700,HEIGHT=780,MAX=4,MIN=1;
  const camera={scale:1,x:0,y:0};
  let active=null,lastFocus='',lastScope='';
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  function bound(){
    camera.scale=clamp(camera.scale,MIN,MAX);
    camera.x=clamp(camera.x,WIDTH*(1-camera.scale),0);
    camera.y=clamp(camera.y,HEIGHT*(1-camera.scale),0);
    if(camera.scale<1.001){camera.scale=1;camera.x=0;camera.y=0;}
  }
  function detach(){if(active){active();active=null;}}
  function attach({board,land,pins,controls,focused,scope}){
    detach();
    let gesture=null,mouse=null,frame=null,suppressUntil=0;
    const cleanup=[];
    const listen=(node,event,fn,options)=>{node.addEventListener(event,fn,options);cleanup.push(()=>node.removeEventListener(event,fn,options));};
    const size=()=>{const r=board.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width||350,height:r.height||390};};
    const local=point=>{const r=size();return {x:(point.clientX-r.left)*WIDTH/r.width,y:(point.clientY-r.top)*HEIGHT/r.height};};
    const cancel=event=>{if(event.cancelable)event.preventDefault();event.stopPropagation();};
    const blocked=()=>{suppressUntil=Date.now()+500;};
    const move=(x,y)=>{camera.x=x;camera.y=y;bound();schedule();};
    function paint(){
      frame=null;bound();
      land.setAttribute('viewBox',[-camera.x/camera.scale,-camera.y/camera.scale,WIDTH/camera.scale,HEIGHT/camera.scale].join(' '));
      board.dataset.zoomed=String(camera.scale>1);
      board.setAttribute('aria-label','スキー場の地図、拡大率'+Math.round(camera.scale*100)+'パーセント。2本指で拡大縮小、拡大中は1本指で移動できます。');
      for(const pin of pins){pin.node.style.left=(pin.x*camera.scale+camera.x)/WIDTH*100+'%';pin.node.style.top=(pin.y*camera.scale+camera.y)/HEIGHT*100+'%';}
      controls.level.textContent=Math.round(camera.scale*100)+'%';
      controls.out.disabled=camera.scale<=MIN;controls.inside.disabled=camera.scale>=MAX;controls.reset.disabled=camera.scale<=MIN;
      controls.hint.textContent=camera.scale>1?'1本指で移動 · 2本指で拡大・縮小':'2本指で拡大・縮小 · 1本指は画面スクロール';
    }
    function schedule(){if(frame!==null)return;if(window.requestAnimationFrame)frame=window.requestAnimationFrame(paint);else paint();}
    function scaleAt(value,point={x:WIDTH/2,y:HEIGHT/2}){
      const scale=clamp(value,MIN,MAX),ratio=scale/camera.scale;
      camera.x=point.x-(point.x-camera.x)*ratio;camera.y=point.y-(point.y-camera.y)*ratio;camera.scale=scale;bound();schedule();
    }
    function reset(){gesture=null;mouse=null;camera.scale=1;camera.x=0;camera.y=0;schedule();}
    function ensureVisible(pin){
      if(!pin||camera.scale<=1)return;
      const r=size(),marginX=36*WIDTH/r.width,marginY=36*HEIGHT/r.height;
      const x=pin.x*camera.scale+camera.x,y=pin.y*camera.scale+camera.y;
      camera.x+=x<marginX?marginX-x:x>WIDTH-marginX?WIDTH-marginX-x:0;
      camera.y+=y<marginY?marginY-y:y>HEIGHT-marginY?HEIGHT-marginY-y:0;bound();
    }
    // Use the touches that began inside this map, even when they hit different pins.
    const touches=event=>Array.from(event.touches||[]).filter(t=>!t.target||board.contains(t.target)).map(t=>({...local(t),id:t.identifier}));
    function begin(points){
      if(points.length>=2){
        const a=points[0],b=points[1],center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        gesture={kind:'pinch',ids:[a.id,b.id],distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),scale:camera.scale,world:{x:(center.x-camera.x)/camera.scale,y:(center.y-camera.y)/camera.scale}};blocked();
      }else if(points.length){gesture={kind:'pan',id:points[0].id,start:points[0],x:camera.x,y:camera.y,moved:false};}
      else gesture=null;
    }
    listen(board,'touchstart',event=>{const points=touches(event);if(!gesture&&points.length===1)suppressUntil=0;begin(points);if(gesture?.kind==='pan')gesture.prevented=camera.scale>1;if(points.length>=2||camera.scale>1)cancel(event);},{passive:false});
    listen(board,'touchmove',event=>{
      const points=touches(event);if(!points.length)return;
      if(points.length>=2){
        if(gesture?.kind!=='pinch'||!gesture.ids.every(id=>points.some(t=>t.id===id)))begin(points);
        const a=points.find(t=>t.id===gesture.ids[0]),b=points.find(t=>t.id===gesture.ids[1]);
        const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
        camera.scale=clamp(gesture.scale*Math.hypot(a.x-b.x,a.y-b.y)/gesture.distance,MIN,MAX);
        move(center.x-gesture.world.x*camera.scale,center.y-gesture.world.y*camera.scale);blocked();cancel(event);
      }else if(camera.scale>1){
        if(gesture?.kind!=='pan'||gesture.id!==points[0].id)begin(points);
        const dx=points[0].x-gesture.start.x,dy=points[0].y-gesture.start.y;
        if(Math.hypot(dx*size().width/WIDTH,dy*size().height/HEIGHT)>6)gesture.moved=true;
        if(gesture.moved){move(gesture.x+dx,gesture.y+dy);blocked();}cancel(event);
      }
    },{passive:false});
    listen(board,'touchend',event=>{
      const points=touches(event),wasPinch=gesture?.kind==='pinch',wasTap=gesture?.kind==='pan'&&gesture.prevented&&!gesture.moved;
      if(wasPinch||gesture?.moved){blocked();cancel(event);}
      begin(points);
      // A tap in zoomed mode was prevented at touchstart; activate that pin once.
      if(!points.length&&wasTap&&Date.now()>=suppressUntil){const pin=event.target.closest?.('.map-location');if(pin){cancel(event);pin.click();}}
    },{passive:false});
    listen(board,'touchcancel',()=>{gesture=null;blocked();},{passive:true});
    // Mouse/pen dragging uses pointer capture; touchscreen gestures use Touch Events.
    listen(board,'pointerdown',event=>{
      if(event.pointerType==='touch'||event.button!==0)return;
      suppressUntil=0;if(camera.scale<=1)return;
      mouse={id:event.pointerId,start:local(event),x:camera.x,y:camera.y,moved:false};
    });
    listen(board,'pointermove',event=>{
      if(!mouse||mouse.id!==event.pointerId)return;
      const point=local(event),dx=point.x-mouse.start.x,dy=point.y-mouse.start.y;
      if(!mouse.moved&&Math.hypot(dx*size().width/WIDTH,dy*size().height/HEIGHT)>6){mouse.moved=true;try{board.setPointerCapture?.(event.pointerId);}catch{}}
      if(mouse.moved){move(mouse.x+dx,mouse.y+dy);blocked();cancel(event);}
    });
    const endPointer=event=>{if(mouse?.id!==event.pointerId)return;if(mouse.moved)blocked();mouse=null;try{board.releasePointerCapture?.(event.pointerId);}catch{}};
    listen(board,'pointerup',endPointer);listen(board,'pointercancel',endPointer);listen(board,'lostpointercapture',()=>{mouse=null;});
    listen(board,'click',event=>{if(event.detail!==0&&Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
    listen(controls.inside,'click',()=>scaleAt(camera.scale*1.4));
    listen(controls.out,'click',()=>scaleAt(camera.scale/1.4));
    listen(controls.reset,'click',reset);
    listen(board,'keydown',event=>{
      if(event.target!==board)return;
      if(['+','=','-','Home','Escape'].includes(event.key)){event.preventDefault();event.key==='-'?scaleAt(camera.scale/1.4):['Home','Escape'].includes(event.key)?reset():scaleAt(camera.scale*1.4);}
      else if(camera.scale>1&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();move(camera.x+(event.key==='ArrowLeft'?70:event.key==='ArrowRight'?-70:0),camera.y+(event.key==='ArrowUp'?78:event.key==='ArrowDown'?-78:0));}
    });
    listen(board,'focusin',event=>{const pin=pins.find(p=>p.node===event.target);if(pin){ensureVisible(pin);if(frame!==null)window.cancelAnimationFrame?.(frame);paint();}});
    // Keep the same camera on forecasts, dates and pin selections; reveal a new area.
    if(focused!==lastFocus||scope!==lastScope)ensureVisible(pins.find(p=>p.selected));
    lastFocus=focused;lastScope=scope;paint();
    active=()=>{if(frame!==null)window.cancelAnimationFrame?.(frame);cleanup.forEach(fn=>fn());gesture=null;mouse=null;};
  }
  window.HaruMapViewport={attach,detach,getState:()=>({...camera})};
})();
