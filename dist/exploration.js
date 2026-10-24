/* Four-way exploration, limited movement and original node line art. Codex. */
(function(root){
  'use strict';
  const R=root.EmberRules||(typeof require==='function'?require('./balance.js'):null);
  const budgets=[14,13,12,11,10],width=880,height=830,styles=['雾枝环湾','折影林径','回声裂谷','四风群落'];
  const modes={walk:{name:'徒步',note:'沿小径移动，每经过一格消耗1步；途中不能越过未完成节点。'},grapple:{name:'折跃索',note:'同一行或列跳跃2–3格，消耗1步和1次装置，可越过未完成节点。'},glide:{name:'余烬滑翔翼',note:'移动至曼哈顿距离3格内的节点，消耗1步和1次装置，可越过未完成节点。'}};
  const labels={battle:'常规冲突',elite:'危险遭遇',boss:'终末恶敌',event:'迷途异闻',shop:'流浪行商',camp:'余火营地',treasure:'失落秘藏',cache:'应急补给',beacon:'瞭望观测',origin:'登陆点',clearing:'林间空地',unknown:'未知的诡秘','unknown-combat':'未知的凶戾'};
  const random=seed=>{let state=seed>>>0||1;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;state>>>=0;return state/4294967296;};};
  const pick=(a,r)=>a[Math.floor(r()*a.length)],distance=(a,b)=>Math.abs(a.gridX-b.gridX)+Math.abs(a.gridY-b.gridY);
  function build(seed,floor){
    const r=random(seed^0xd3a2646c),style=Math.floor(r()*4),nodes=[];
    const pool=kind=>Object.keys(R.enemies).filter(id=>R.enemies[id].kind===kind&&(R.enemies[id].floor||1)===floor);
    const events=floor===1?[...R.legacy.events]:[...R.legacy.events.filter(id=>['spring','medic','library','altar','sparrow'].includes(id)),...Object.keys(R.events).filter(id=>R.events[id].minFloor===floor)];
    for(let y=0;y<7;y++){
      const radius=style===0?[1,2,3,3,3,2,1][y]:style===1?[1,2,2,3,2,2,1][y]:style===2?[2,3,2,1,2,3,2][y]:[1,3,2,3,2,3,1][y];
      const shift=style===1?Math.round(Math.sin(y*.9)):style===2?(y<3?-1:y>3?1:0):Math.floor(r()*3)-1;
      const low=Math.max(0,Math.min(3,3+shift-radius)),high=Math.min(6,Math.max(3,3+shift+radius));
      for(let x=low;x<=high;x++){
        let type=pick(['battle','battle','battle','event','event','shop','camp','treasure','elite'],r);
        if(x===3)type=['boss','elite','event','camp','shop','battle','origin'][y];
        if(y===4&&x===4)type='cache';if(y===2&&x===2)type='beacon';
        const content=type==='event'?events:pool(type),variant=content.length?pick(content,r):null;
        nodes.push({id:'s'+y+'c'+x,gridX:x,gridY:y,row:6-y,lane:x,x:84+x*118,y:90+y*108,type,variant,next:[],floorNumber:floor,groupCombat:!(x===3&&y===5),statusCombat:true,squadSeed:Math.floor(r()*4294967295)||1,seaStyle:style});
      }
    }
    for(const n of nodes)n.next=nodes.filter(other=>distance(n,other)===1).map(other=>other.id);
    return nodes;
  }
  function reveal(state,nodes,id,radius=1){const at=nodes.find(n=>n.id===id);for(const n of nodes)if(distance(at,n)<=radius&&!state.seen.includes(n.id))state.seen.push(n.id);}
  function create(nodes,floor){const origin=nodes.find(n=>n.type==='origin'),boss=nodes.find(n=>n.type==='boss'),state={position:origin.id,steps:budgets[floor-1],mode:'walk',devices:{grapple:2,glide:1},seen:[origin.id,boss.id],pursuits:0,pursuing:false};reveal(state,nodes,origin.id);return state;}
  function plan(nodes,state,visited,to,mode=state.mode){
    const from=nodes.find(n=>n.id===state.position),target=nodes.find(n=>n.id===to),bad=reason=>({ok:false,reason,path:[],cost:0,mode});
    if(!target||!Object.hasOwn(modes,mode))return bad('请选择地图节点与移动方式。');if(to===state.position)return bad('你已经位于此处。');
    let path=[];
    if(mode==='walk'){
      const queue=[[from.id]],seen=new Set([from.id]);
      while(queue.length&&!path.length){const route=queue.shift(),at=nodes.find(n=>n.id===route.at(-1));for(const id of at.next){if(seen.has(id))continue;seen.add(id);const next=[...route,id];if(id===to){path=next.slice(1);break;}if(visited.includes(id)||nodes.find(n=>n.id===id).type==='origin')queue.push(next);}}
      if(!path.length)return bad('沿途有未完成节点。先探索相邻节点，或换用移动装置。');
    }else{
      const d=distance(from,target),allowed=mode==='grapple'?(from.gridX===target.gridX||from.gridY===target.gridY)&&d>=2&&d<=3:d>=1&&d<=3;
      if(!allowed)return bad(modes[mode].note);if(!state.devices[mode])return bad('此装置本层次数已用尽。');path=[to];
    }
    const cost=mode==='walk'?path.length:1;
    return{ok:state.steps>=cost,reason:state.steps>=cost?'':'行动力不足，需要'+cost+'步。',path,cost,mode,to};
  }
  function travel(nodes,state,visited,to){const route=plan(nodes,state,visited,to);if(!route.ok)return route;state.steps-=route.cost;if(route.mode!=='walk')state.devices[route.mode]--;state.position=to;for(const id of route.path)reveal(state,nodes,id);if(route.mode!=='walk'&&!state.devices[route.mode])state.mode='walk';return route;}
  function snapshot(state){return{...state,devices:{...state.devices},seen:[...state.seen]};}
  function restore(data,nodes,floor,visited){
    const fail=()=>{throw new Error('树海地图位置、行动力或装置记录无效。');},ids=nodes.map(n=>n.id),initial=create(nodes,floor),caches=visited.filter(id=>nodes.find(n=>n.id===id)?.type==='cache').length;
    if(!data||Object.keys(data).some(k=>!['position','steps','mode','devices','seen','pursuits','pursuing'].includes(k))||!ids.includes(data.position)||!Object.hasOwn(modes,data.mode)||!Number.isInteger(data.steps)||data.steps<0||data.steps>budgets[floor-1]+caches*4)fail();
    if(!data.devices||Object.keys(data.devices).length!==2||Object.keys(data.devices).some(k=>!['grapple','glide'].includes(k))||!Number.isInteger(data.devices.grapple)||data.devices.grapple<0||data.devices.grapple>2+caches||!Number.isInteger(data.devices.glide)||data.devices.glide<0||data.devices.glide>1)fail();
    if(!Array.isArray(data.seen)||new Set(data.seen).size!==data.seen.length||data.seen.some(id=>!ids.includes(id))||[...initial.seen,data.position,...visited].some(id=>!data.seen.includes(id))||!Number.isInteger(data.pursuits)||data.pursuits<0||data.pursuits>100000||typeof data.pursuing!=='boolean'||(data.pursuing&&(data.steps!==0||data.pursuits<1)))fail();
    return snapshot(data);
  }
  const paths={
    battle:'m4 3 9 7-3 3-7-9 1-1Zm16 0-9 7 3 3 7-9-1-1ZM8 11l-5 9 4 1 5-8m4-2 5 9-4 1-5-8',
    elite:'m12 2 9 5-2 12-7 3-7-3L3 7l9-5Zm-5 8 3 3m7-3-3 3m-5 4h6m-3-5v7',
    boss:'m12 1 3 5 6-2-2 8 3 5-6 1-4 5-4-5-6-1 3-5-2-8 6 2 3-5Zm-5 10 3 2m7-2-3 2m-5 4h6',
    event:'m12 2 9 10-9 10L3 12l9-10Zm-3 7c0-4 7-4 6 0 0 2-3 2-3 5m0 3v1',
    shop:'M3 9h18l-2-6H5L3 9Zm2 0v12h14V9M9 21v-7h6v7M2 9v3h5V9m0 3h5V9m0 3h5V9m0 3h5V9',
    camp:'m3 21 18-2M3 18l18 4M12 2c4 5 10 8 5 13-4 4-13 1-10-4 1 3 4 2 3-1-2-4 3-4 2-8Z',
    treasure:'m3 9 4-6h10l4 6v12H3V9Zm0 0h18m-12 0v12m6-12v12m-5 2h4v5h-4Z',
    cache:'M7 4h10l4 6-2 12H5L3 10l4-6Zm3 0V2h4v2m-2 5-3 6h6l-3 5M3 10h5m8 0h5',
    beacon:'M12 8v14m-6 0h12m-8-12-4 12m8-12 4 12M5 4c-4 4-4 9 0 13m14-13c4 4 4 9 0 13M8 7c-2 2-2 5 0 7m8-7c2 2 2 5 0 7m-4-6h0',
    origin:'M8 7h8l3 13H5L8 7Zm2 0V3h4v4m-2 5-2 5h4l-2-5M3 23h18',
    clearing:'m3 20 5-7 4 4 4-8 5 11H3Zm4-11V3m-3 3h6m8-1V1m-2 2h4',
    unknown:'m12 2 9 10-9 10L3 12l9-10M9 9c0-4 7-4 6 0 0 2-3 2-3 5m0 3v1',
    'unknown-combat':'m12 2 9 5-3 13-6 2-6-2L3 7l9-5Zm-4 8 2 2m6-2-2 2m-5 5h6m-3-5v3'
  };
  const glyph=type=>'<svg class="sea-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[type]||paths.unknown)+'"/></svg>';
  const api={budgets,width,height,styles,modes,labels,build,create,reveal,plan,travel,snapshot,restore,distance,glyph};root.EmberExploration=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
