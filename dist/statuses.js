/* Potency/count combat states. Original adaptation by Codex. */
(function(root){
  'use strict';
  const kinds=['burn','bleed','rupture','sinking','tremor'];
  const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
  const create=()=>({ailments:{},dread:0,stagger:0,staggered:false});
  function add(state,effect){
    if(!kinds.includes(effect.kind))return;
    const old=state.ailments[effect.kind]||{potency:0,count:0};
    state.ailments[effect.kind]={potency:Math.min(20,old.potency+effect.potency),count:Math.min(9,old.count+effect.count)};
  }
  function consume(state,kind){
    const a=state.ailments[kind];if(!a)return 0;
    const potency=a.potency;if(--a.count<=0)delete state.ailments[kind];return potency;
  }
  function purge(state,list){
    for(const kind of list){delete state.ailments[kind];if(kind==='sinking')state.dread=0;if(kind==='tremor'){state.stagger=0;state.staggered=false;}}
  }
  function snapshot(state){return{ailments:Object.fromEntries(Object.entries(state.ailments).map(([key,a])=>[key,{...a}])),dread:state.dread,stagger:state.stagger,staggered:state.staggered};}
  function restore(value){
    const fail=()=>{throw new Error('存档中的负面状态无效。');};
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['ailments','dread','stagger','staggered'].includes(k)))fail();
    if(!integer(value.dread,0,9)||!integer(value.stagger,0,216)||typeof value.staggered!=='boolean'||(value.staggered&&value.stagger!==0))fail();
    if(!value.ailments||typeof value.ailments!=='object'||Array.isArray(value.ailments))fail();
    for(const [key,a]of Object.entries(value.ailments))if(!kinds.includes(key)||!a||Object.keys(a).some(k=>!['potency','count'].includes(k))||!integer(a.potency,1,20)||!integer(a.count,1,9))fail();
    return snapshot(value);
  }
  const api={kinds,create,add,consume,purge,snapshot,restore};root.EmberStatuses=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
