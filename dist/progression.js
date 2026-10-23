/* Permanent progression and original vector relic marks. Codex. */
(function(root){
  'use strict';
  const awards=[1,1,2,2,3],branches=[{id:'edge',name:'锋刃',note:'攻效、状态与能量'},{id:'guard',name:'庇护',note:'医疗、格挡与护印'},{id:'road',name:'远行',note:'补给、侦察与遗物'}];
  const nodes=[
    {id:'grip',branch:'edge',tier:1,name:'持刃训练',description:'所有攻击的基础攻效提高5%。',effects:{attack:.05}},
    {id:'etch',branch:'edge',tier:2,name:'刻印共鸣',description:'卡牌施加的负面状态威力+1，仍不超过20。',effects:{statusPotency:1}},
    {id:'tempo',branch:'edge',tier:3,name:'战斗节奏',description:'每场战斗开局额外获得1能量。',effects:{openingEnergy:1}},
    {id:'medicine',branch:'guard',tier:1,name:'急救训练',description:'每次包扎额外修复2点部位生命。',effects:{healing:2}},
    {id:'poise',branch:'guard',tier:2,name:'稳固架势',description:'卡牌提供的格挡提高10%。',effects:{guard:.1}},
    {id:'ward',branch:'guard',tier:3,name:'余火护印',description:'开局额外获得4格挡；每回合（含首回合）再获得1格挡。',effects:{openingBlock:4,turnBlock:1}},
    {id:'supplies',branch:'road',tier:1,name:'预备物资',description:'新旅途初始金币+20。',effects:{gold:20}},
    {id:'survey',branch:'road',tier:2,name:'先行侦察',description:'每场战斗开局额外抽1张牌，超限仍可选择弃牌。',effects:{openingDraw:1}},
    {id:'heirloom',branch:'road',tier:3,name:'传家罗盘',description:'每次新旅途自带「旧路罗盘」，商店价格降低20%。',effects:{startCompass:1}}
  ];
  for(const n of nodes){n.cost=n.tier;n.minFloor=[1,2,4][n.tier-1];n.requires=nodes.filter(p=>p.branch===n.branch&&p.tier===n.tier-1).map(p=>p.id);}
  const validId=id=>typeof id==='string'&&/^(run-[a-zA-Z0-9-]{8,80}|legacy-[1-9][0-9]{0,9})$/.test(id);
  const validTechs=ids=>Array.isArray(ids)&&ids.length<=nodes.length&&new Set(ids).size===ids.length&&ids.every(id=>nodes.some(n=>n.id===id))&&ids.every(id=>nodes.find(n=>n.id===id).requires.every(p=>ids.includes(p)));
  const floorOf=mask=>mask.toString(2).length;
  const journeyId=()=> 'run-'+(root.crypto?.randomUUID?root.crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,14));
  function bonuses(ids){const result={attack:0,statusPotency:0,openingEnergy:0,healing:0,guard:0,openingBlock:0,turnBlock:0,gold:0,openingDraw:0,startCompass:0};for(const id of ids)for(const [key,value]of Object.entries(nodes.find(n=>n.id===id).effects))result[key]+=value;return result;}
  class Profile{
    constructor(){this.unlocked=[];this.claims={};}
    get earned(){return Object.values(this.claims).reduce((sum,mask)=>sum+awards.reduce((value,points,i)=>value+((mask&(1<<i))?points:0),0),0);}
    get spent(){return this.unlocked.reduce((sum,id)=>sum+nodes.find(n=>n.id===id).cost,0);}
    get points(){return Math.max(0,this.earned-this.spent);}
    get bestFloor(){return Object.values(this.claims).reduce((best,mask)=>Math.max(best,floorOf(mask)),0);}
    claim(id,floors){
      if(!validId(id)||!Number.isInteger(floors)||floors<0||floors>5)throw new Error('旅途通层记录无效。');
      if(!floors)return 0;const old=this.claims[id]||0,next=old|((1<<floors)-1);this.claims[id]=next;
      return awards.reduce((sum,points,i)=>sum+((next&(1<<i))&&!(old&(1<<i))?points:0),0);
    }
    reason(id){const n=nodes.find(n=>n.id===id);if(!n)return'未知科技。';if(this.unlocked.includes(id))return'已经解锁。';if(this.bestFloor<n.minFloor)return'需要曾通关第'+n.minFloor+'层。';if(n.requires.some(p=>!this.unlocked.includes(p)))return'需要先解锁同分支前置科技。';if(this.points<n.cost)return'科技点不足。';return'';}
    unlock(id){const reason=this.reason(id);if(reason)return{ok:false,reason};this.unlocked.push(id);return{ok:true};}
    merge(other){if(other===this)return this;for(const [id,mask]of Object.entries(other.claims))this.claims[id]=(this.claims[id]||0)|mask;this.unlocked=nodes.filter(n=>this.unlocked.includes(n.id)||other.unlocked.includes(n.id)).map(n=>n.id);return this;}
    snapshot(){return{format:'ember-corridor.profile',version:1,unlocked:[...this.unlocked],claims:{...this.claims}};}
    static restore(data){
      const fail=()=>{throw new Error('永久科技记录无效。');};
      if(!data||data.format!=='ember-corridor.profile'||data.version!==1||!validTechs(data.unlocked)||!data.claims||typeof data.claims!=='object'||Array.isArray(data.claims))fail();
      if(Object.keys(data).some(k=>!['format','version','unlocked','claims'].includes(k)))fail();
      for(const [id,mask]of Object.entries(data.claims))if(!validId(id)||![1,3,7,15,31].includes(mask))fail();
      const profile=new Profile();profile.unlocked=[...data.unlocked];profile.claims={...data.claims};
      if(profile.unlocked.some(id=>profile.bestFloor<nodes.find(n=>n.id===id).minFloor))fail();return profile;
    }
  }
  // All marks are local, original line art; no remote or game-owned artwork.
  const relicIcons={
    heart:['#ed8f87','M12 21S2 15 2 8a5 5 0 0 1 10-1A5 5 0 0 1 22 8c0 7-10 13-10 13Z'],
    blade:['#c1d7ee','m4 20 5-5m-3-3 6 6m-4-4L18 3l3-1-1 4-10 10'],
    lantern:['#f0c77a','M8 7h8l2 13H6L8 7Zm1 0V4h6v3m-3 4v5m-2 5h4'],
    battery:['#d6ad6b','M7 5h10v16H7V5Zm3 0V2h4v3m-2 4-3 5h6l-3 5'],
    shell:['#a6c9c1','M3 18C-1 1 25 1 21 18H3Zm9-12v12M6 9l3 9m9-9-3 9m-9 3h12'],
    whetstone:['#bcb2e3','m3 16 5-9 14 3-5 10-14-4Zm0 0 13-4m-8-5 8 5 6-2'],
    silk:['#d2cee6','M4 4c5 4 11-2 16 2l-3 15c-5-4-10 2-14-2L4 4Zm4 1-1 14m10-14-2 14'],
    boots:['#d5b391','M6 3h8v10l6 4v4H3v-7h3V3Zm0 7h8M3 18h17'],
    feather:['#c7d8bb','M5 21C5 7 10 1 20 3c2 10-5 15-15 15m0 3L17 6m-7 5h6m-9 4h6'],
    chalice:['#e8bf76','M5 3h14l-2 9-5 4-5-4-2-9Zm7 13v5m-5 1h10'],
    coin:['#efcf77','M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-6v12m3-9c-5-4-8 3-3 3s2 7-3 3'],
    herb:['#b0d397','M8 8h8l5 13H3L8 8Zm2 0V4h4v4m-2 5v5m-3-3h6'],
    supplies:['#c4b0e0','M8 3h8m-6 0v8L4 21h16l-6-10V3M8 16h8'],
    sunstone:['#f1ba70','m12 3 7 4 2 8-9 7L2 15l3-8 7-4Zm0 5 4 4-4 5-4-5 4-4Z'],
    compass:['#b9d2c4','M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-5-5-3 8-5 2 3-8 5-2Z'],
    phoenix:['#eda67d','M12 22C2 19 0 11 4 7l5 7c-3-7 3-10 5-12-1 6 7 8 6 14l-7-3c5 6 4 8-1 9Z'],
    tidepearl:['#a8d7db','M20 15a8 8 0 1 1-16 0c0-5 8-13 8-13s8 8 8 13Zm-4 0a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'],
    blueflame:['#8db9ed','M12 2c4 8 10 7 8 14-1 7-13 8-16 1-2-5 2-7 3-10 0 7 6 6 5-5Zm0 12-3 4 4 3 3-3-4-4Z'],
    coral:['#eea4af','M12 22V7m0 8-7-3V5m0 4L2 7m10 4 6-3V2m0 4 4-2m-10 15 7-3v-4'],
    furnace:['#e8aa7b','M5 3h14v19H5V3Zm3 3h8m-8 4h8m-8 9c-2-4 2-6 4-8 0 3 5 5 4 8H8Z'],
    ironleaf:['#bdc5ac','M3 20C1 5 9 3 21 3c0 13-5 19-18 17Zm0 0L17 7m-6 6V7m0 6h6'],
    gear:['#dbbf86','m9 3 6 0 1 4 4 1 2 5-3 3 1 4-5 2-3-3-4 1-3-5 3-3-1-4 4-2 0-3Zm7 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'],
    lens:['#a7c9e9','M17 9a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 6 7 7M6 9l4-4m0 8 4-4'],
    mirrorplate:['#c9bfdf','m12 2 8 4-1 12-7 4-7-4L4 6l8-4Zm-4 5 8 10m0-10-8 10'],
    silverthread:['#d5d9ef','M6 3h12m-12 18h12M8 3v18m8-18v18M8 6l8 4-8 4 8 4M3 8h5m8 8h5'],
    starheart:['#efb3c4','m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Zm0 7-2 3 2 3 2-3-2-3Z'],
    dawnshield:['#e4cb8a','M4 7h16v6c0 4-8 9-8 9s-8-5-8-9V7Zm3-3 1 2m4-5v4m5-1-1 2M7 14a5 5 0 0 1 10 0H7Z'],
    eternity:['#c8b8ea','M12 12C2-3-5 23 7 19l10-14c12-4 5 22-5 7Z']
  };
  const api={Profile,nodes,branches,awards,validTechs,validId,journeyId,bonuses,relicIcons};root.EmberProgression=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
