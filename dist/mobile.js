/* Touch presentation only. No combat rules, save fields, or random draws. */
(function(){
  'use strict';
  if(document.documentElement.dataset.ui!=='phone')return;
  const $=id=>document.getElementById(id),game=window.emberGame;
  const menu=$('phone-menu'),scrim=$('phone-menu-scrim'),arena=$('arena'),hand=$('hand'),map=$('route-map');
  let handKey='',mapKey='',roomKey='',lastSelected=null,frame=0;
  function closeMenu(){menu.open=false;scrim.hidden=true;$('phone-menu-toggle').setAttribute('aria-expanded','false');}
  menu.addEventListener('toggle',()=>{scrim.hidden=!menu.open;$('phone-menu-toggle').setAttribute('aria-expanded',String(menu.open));});
  scrim.addEventListener('click',closeMenu);
  $('phone-health-button').addEventListener('click',()=>{closeMenu();game.showHealth();});
  document.addEventListener('click',e=>{
    if(e.target.closest('.phone-menu-items button,.phone-menu-items a')||(!menu.contains(e.target)&&!scrim.contains(e.target)))closeMenu();
    queueMicrotask(sync);
  });
  document.addEventListener('ember:render',sync);
  document.addEventListener('ember:modal',()=>{
    if(!$('modal').hidden)closeMenu();sync();
    const preview=$('modal').querySelector('.route-preview');
    if(preview)scheduleLayout(()=>{const current=preview.querySelector('.route-node.current'),viewport=preview.querySelector('.sea-map-viewport')||preview;if(current){viewport.scrollTop=Math.max(0,current.offsetTop-viewport.clientHeight*.6);viewport.scrollLeft=Math.max(0,current.offsetLeft-viewport.clientWidth/2);}});
  });
  function guardSwipe(element){
    let touch=null,ignoreClick=false;
    element.addEventListener('pointerdown',e=>{ignoreClick=false;touch=e.pointerType==='touch'||e.pointerType==='pen'?{id:e.pointerId,x:e.clientX,y:e.clientY,moved:false}:null;});
    element.addEventListener('pointermove',e=>{if(touch?.id===e.pointerId&&Math.hypot(e.clientX-touch.x,e.clientY-touch.y)>12)touch.moved=true;},{passive:true});
    element.addEventListener('pointerup',e=>{if(touch?.id===e.pointerId){ignoreClick=touch.moved;touch=null;}});
    element.addEventListener('pointercancel',()=>{ignoreClick=!!touch;touch=null;});
    element.addEventListener('click',e=>{if(ignoreClick&&e.detail!==0){e.preventDefault();e.stopImmediatePropagation();ignoreClick=false;}},true);
  }
  for(const element of [hand,map,$('node-panel'),$('enemy-grid'),$('modal-body')])guardSwipe(element);
  function scheduleLayout(fn){
    if(frame)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{frame=0;fn();});
  }
  function focusAvailable(){
    if(game.run.screen!=='map')return;
    const node=map.querySelector('.sea-node.current')||map.querySelector('.route-node.available'),viewport=map.querySelector('.sea-map-viewport')||map;
    if(node){viewport.scrollTop=Math.max(0,node.offsetTop-viewport.clientHeight*.6);viewport.scrollLeft=Math.max(0,node.offsetLeft-viewport.clientWidth/2);}
  }
  function revealGrid(){
    if(game.run.screen!=='battle'||!$('modal').hidden)return;
    const grid=$('enemy-grid-panel'),a=arena.getBoundingClientRect(),b=grid.getBoundingClientRect();
    if(b.bottom>a.bottom||b.top<a.top)arena.scrollTo({top:Math.max(0,arena.scrollTop+b.top-a.top-6),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }
  function sync(){
    const run=game.run,battle=game.battle;
    document.body.dataset.screen=run.screen;
    const busy=$('health-button').disabled;
    $('phone-health-button').disabled=busy;$('save-button').disabled=busy;$('route-button').disabled=busy;
    const title=document.querySelector('.map-intro h1'),note=document.querySelector('.map-intro p');
    if(title.textContent!==run.mapName)title.textContent=run.mapName;
    note.textContent=run.screen==='node'?'处理当前房间后继续前行。':run.exploration?'滑动地图 · 点节点预览 · 确认移动':'滑动浏览地图 · 点亮的节点可前往';
    const nextHand=[run.seed,run.floorNumber,run.nodeId,battle.turn].join(':');
    if(nextHand!==handKey){handKey=nextHand;hand.scrollLeft=0;}
    const chosen=hand.querySelector('.card.selected')?.dataset.uid||null;
    if(chosen&&chosen!==lastSelected)scheduleLayout(revealGrid);
    lastSelected=chosen;
    if(run.screen==='map'){
      const nextMap=[run.seed,run.floorNumber,run.routeVersion,run.exploration?.position||run.visited.at(-1)||'start'].join(':');
      if(nextMap!==mapKey){mapKey=nextMap;scheduleLayout(focusAvailable);}
    }
    const nextRoom=run.seed+':'+run.floorNumber+':'+run.nodeId;
    if(run.screen==='node'&&nextRoom!==roomKey){roomKey=nextRoom;$('node-panel').scrollTop=0;}
    $('route-button').setAttribute('aria-current',run.screen==='map'||run.screen==='node'?'page':'false');
    $('phone-menu-toggle').setAttribute('aria-expanded',String(menu.open));
  }
  window.addEventListener('resize',()=>{if(game.run.screen==='map')scheduleLayout(focusAvailable);else if(hand.querySelector('.card.selected'))scheduleLayout(revealGrid);});
  sync();
})();
