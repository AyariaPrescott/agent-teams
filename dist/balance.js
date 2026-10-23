/* Initial balance proposal: DeepSeek. Grid-combat redesign and current values: Codex. */
(function (root) {
  const rules = {
    enemyHp: 24, gridColumns: 6, gridRows: 4,
    maxCellLayers: 9,
    enemyLayers: [
      0, 1, 1, 1, 1, 0,
      1, 2, 3, 3, 2, 1,
      0, 1, 2, 2, 1, 0,
      0, 0, 1, 1, 0, 0
    ],
    layerColors: ['#b2c992', '#73c8a5', '#71c5d7', '#81a9e5', '#a396e6', '#ca93d9', '#e291b4', '#eeaa78', '#f4ce78'],
    deck: ['strike', 'guard', 'ember', 'insight', 'heavy', 'strike', 'strike', 'guard', 'parry', 'focus'],
    cards: {
      strike: { name: '直击', cost: 1, type: 'attack', damage: 3, shapeName: '直线', shape: [[0, 0], [1, 0], [2, 0]], block: 0, draw: 0, burn: 0, energy: 0, description: '3格直线攻击，覆盖的生命格各削去1层。' },
      guard: { name: '举盾', cost: 1, type: 'skill', damage: 0, block: 6, draw: 0, burn: 0, energy: 0, description: '获得6点格挡，在你的下个回合开始时清空。' },
      heavy: { name: '重砸', cost: 2, type: 'attack', damage: 5, shapeName: 'L形', shape: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], block: 0, draw: 0, burn: 0, energy: 0, description: '5格L形攻击，覆盖的生命格各削去1层。' },
      ember: { name: '余烬', cost: 1, type: 'attack', damage: 4, shapeName: '方块', shape: [[0, 0], [1, 0], [0, 1], [1, 1]], block: 0, draw: 0, burn: 0, energy: 0, description: '2×2方块攻击，覆盖的生命格各削去1层。' },
      insight: { name: '洞察', cost: 1, type: 'skill', damage: 0, block: 0, draw: 2, burn: 0, energy: 0, description: '抽2张牌。' },
      parry: { name: '招架', cost: 1, type: 'attack', damage: 4, shapeName: 'T形', shape: [[0, 0], [1, 0], [2, 0], [1, 1]], block: 3, draw: 0, burn: 0, energy: 0, description: '4格T形攻击，各削去1层生命，并获得3点格挡。' },
      focus: { name: '专注', cost: 0, type: 'skill', damage: 0, block: 0, draw: 0, burn: 0, energy: 1, exhaust: true, description: '本回合能量+1；打出后消耗，本局不再回到牌库。' },
      cross: { name: '十字斩', cost: 1, type: 'attack', damage: 5, shapeName: '十字', shape: [[1,0],[0,1],[1,1],[2,1],[1,2]], block: 0, draw: 0, burn: 0, energy: 0, description: '5格十字攻击。' },
      sweep: { name: '横扫', cost: 1, type: 'attack', damage: 4, shapeName: '长线', shape: [[0,0],[1,0],[2,0],[3,0]], block: 0, draw: 0, burn: 0, energy: 0, description: '4格长线攻击。' },
      wall: { name: '坚守', cost: 1, type: 'skill', damage: 0, block: 9, draw: 0, burn: 0, energy: 0, description: '获得9点格挡。' }
    },
    intents: [
      { name: '碎门重锤', type: 'attack', damage: 9, block: 0, strength: 0 },
      { name: '石门壁垒', type: 'defend', damage: 0, block: 3, strength: 0 },
      { name: '余烬蓄势', type: 'attack', damage: 5, block: 0, strength: 3 }
    ]
  };
  const attack = (name,cost,shapeName,shape,extra={}) => ({name,cost,type:'attack',shapeName,shape,damage:shape.length,block:0,draw:0,burn:0,energy:0,...extra});
  const skill = (name,cost,extra) => ({name,cost,type:'skill',damage:0,block:0,draw:0,burn:0,energy:0,...extra});
  Object.assign(rules.cards,{
    hook:attack('钩月',1,'钩形',[[0,0],[0,1],[0,2],[1,2],[1,1]]),
    zigzag:attack('折光',1,'折线',[[1,0],[2,0],[0,1],[1,1]]),
    diagonal:attack('斜切',1,'斜线',[[0,0],[1,1],[2,2],[3,3]]),
    spear:attack('贯刺',1,'长枪',[[0,0],[0,1],[0,2],[0,3]],{pierce:true}),
    ring:attack('环刃',2,'环形',[[0,0],[1,0],[2,0],[0,1],[2,1],[0,2],[1,2],[2,2]]),
    burst:attack('碎星',3,'九宫',[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]]),
    fork:attack('双叉',1,'叉形',[[0,0],[2,0],[0,1],[1,1],[2,1]]),
    cleave:attack('断岩',2,'矩形',[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]]),
    needle:attack('银针',0,'短线',[[0,0],[1,0]],{pierce:true,exhaust:true}),
    crescent:attack('弦月',1,'弧形',[[1,0],[2,0],[0,1],[1,2],[2,2]]),
    bulwark:skill('铁壁',2,{block:12,draw:1}),
    retreat:skill('退守',1,{block:4,draw:1}),
    channel:skill('聚火',0,{energy:2,exhaust:true}),
    renew:skill('回春',1,{heal:8,cleanse:true,exhaust:true}),
    suture:skill('缝合',1,{heal:6}),
    clarity:skill('澄明',1,{draw:3,exhaust:true}),
    feint:attack('佯攻',1,'双点',[[0,0],[2,0]],{draw:1}),
    brace:skill('稳固',1,{block:5,heal:3}),
    pulse:attack('震荡',2,'菱形',[[1,0],[0,1],[2,1],[1,2]],{powerBonus:.5}),
    backstab:attack('影袭',1,'V形',[[0,0],[1,1],[2,0]],{pierce:true,powerBonus:.25,exhaust:true})
  });
  for(const card of Object.values(rules.cards)) if(!card.description) card.description=[card.shape?`${card.shape.length}格${card.shapeName}攻击${card.powerBonus?'，额外削层效能':''}。`:'',card.pierce?'穿甲。':'',card.block?`基础格挡${card.block}。`:'',card.draw?`抽${card.draw}张。`:'',card.energy?`能量+${card.energy}。`:'',card.heal?`修复最重的存活伤处${card.heal}点。`:'',card.cleanse?'止住全部出血。':'',card.exhaust?'消耗。':''].join('');
  rules.rewardPool=Object.keys(rules.cards).filter(id=>!['strike','focus'].includes(id));
  rules.relics={
    heart:{name:'残火之心',description:'躯干上限+6、心脏上限+4，恢复新增生命。'},
    blade:{name:'淬火刀锋',description:'所有形状攻击穿甲。'},
    lantern:{name:'不灭提灯',description:'每场战斗开局额外抽1张牌。',openingDraw:1},
    battery:{name:'琥珀蓄能石',description:'每场战斗开局额外获得1能量。',openingEnergy:1},
    shell:{name:'石壳护符',description:'每场战斗开局获得4格挡。',openingBlock:4},
    whetstone:{name:'月纹磨石',description:'形状攻击效能提高15%。',attack:.15},
    silk:{name:'银丝披肩',description:'卡牌格挡提高20%。',guard:.2},
    boots:{name:'轻灰之靴',description:'每个回合额外恢复1能量，最多6。',energy:1},
    feather:{name:'渡鸦之羽',description:'每回合多抽1张牌，手牌仍最多9张。',draw:1},
    chalice:{name:'温泉圣杯',description:'每次战斗胜利后，存活部位各修复上限8%，止血，血容量+12。',victoryHeal:.08},
    coin:{name:'旅商古币',description:'战斗金币奖励提高25%，向上取整。',gold:.25},
    herb:{name:'常青药囊',description:'每次包扎额外修复3点部位生命。',healing:3},
    supplies:{name:'炼金试管',description:'每场战斗强化剂补充至2次。',stimulants:1},
    sunstone:{name:'灼阳晶核',description:'强化剂生效时，攻击效能再提高25%。',boostAttack:.25},
    compass:{name:'旧路罗盘',description:'商店价格降低20%，向上取整。',discount:.2},
    phoenix:{name:'火鸟余烬',description:'进入每场战斗时恢复15%血容量。',openingBlood:15}
  };
  const I=(name,damage=0,block=0,strength=0)=>({name,type:damage?'attack':'defend',damage,block,strength});
  const enemy=(name,kind,hp,sprite,style,intents,enrage=0)=>({name,kind,hp,sprite,style,intents,enrage});
  rules.enemies={
    moss:enemy('苔石哨兵','battle',12,'sentinel',0,[I('石拳',4),I('苔壳',0,2),I('缓慢重击',3)]),
    rat:enemy('烬尾鼠','battle',10,0,1,[I('啃咬',3),I('躲闪',0,1),I('尾火',4)]),
    moth:enemy('余火蛾','battle',11,1,2,[I('鳞粉',3),I('敛翼',0,2),I('焰扑',4)]),
    archer:enemy('破弦猎手','battle',12,2,3,[I('短箭',4),I('架弓',0,1),I('双矢',5)]),
    slime:enemy('冷灰凝胶','battle',13,3,0,[I('撞击',3),I('凝结',0,3),I('酸涌',4)]),
    pilgrim:enemy('摇铃行者','battle',13,4,2,[I('铃击',4),I('祈祷',0,2),I('回声',3,0,1)]),
    crab:enemy('铁壳灰蟹','battle',14,5,0,[I('钳击',4),I('缩壳',0,3),I('侧扫',4)]),
    watcher:enemy('裂隙巡卫','battle',14,'sentinel',3,[I('巡刃',5),I('石盾',0,2),I('追击',3)]),
    scavenger:enemy('拾荒刀客','battle',12,2,1,[I('试探',3),I('招架',0,2),I('掠击',5)]),
    shade:enemy('无灯影灵','battle',13,4,3,[I('影触',4),I('隐匿',0,1),I('侵袭',5)]),
    cinder:enemy('锈火构装体','battle',15,'sentinel',2,[I('锈拳',4),I('覆甲',0,3),I('火核冲撞',5)]),
    keeper:enemy('残钟守卫','battle',15,5,1,[I('钟摆',5),I('钟壳',0,2),I('余响',4)]),
    thorn:enemy('铜棘执刑者','elite',22,'elite',1,[I('断枝刃',6),I('铜棘甲',0,3),I('处刑',5,0,1)]),
    abbot:enemy('铁衣修士','elite',24,4,0,[I('戒尺',6),I('铁衣',0,4),I('重戒',6)]),
    oracle:enemy('碎镜先知','elite',23,6,3,[I('镜刺',5),I('折光壁',0,3),I('预言之刃',7)]),
    warden:enemy('枯骨典狱长','elite',26,'elite',2,[I('锁链',7),I('囚笼',0,3),I('枷锁',5,0,1)]),
    crown:enemy('灰冠门主','boss',34,'boss',0,[I('王冠断击',7),I('灰冠壁垒',0,4),I('余火审判',6,0,1)],2),
    queen:enemy('古根王后','boss',38,7,1,[I('根须缠击',7),I('树皮王座',0,5),I('枯枝扫荡',6,0,1)],2),
    priest:enemy('终钟祭司','boss',42,6,3,[I('终钟回响',8),I('静默钟罩',0,4),I('灰烬颂歌',6,0,1)],2)
  };
  const choice=(id,label,text,effects={},cost=0)=>({id,label,text,effects,cost});
  rules.events={
    spring:{title:'余温泉眼',story:'断裂的石槽里，温热泉水仍在流动。',choices:[choice('drink','饮下泉水','存活部位修复25%，止血，血容量+35。',{heal:.25,blood:35}),choice('coins','打捞旧币','获得45金币。',{gold:45})]},
    medic:{title:'无名医者',story:'戴面具的医者在灯下收拢针线。',choices:[choice('treat','接受治疗','支付20金币，存活部位修复40%，止血，血容量+40。',{heal:.4,blood:40},20),choice('learn','学习缝合','获得「缝合」。',{card:'suture'})]},
    forge:{title:'冷却的锻炉',story:'炉底还有一块温热的月纹磨石。',choices:[choice('stone','购买磨石','支付30金币，获得月纹磨石；已有则改给45金币。',{relic:'whetstone'},30),choice('blade','磨出贯刺','获得「贯刺」。',{card:'spear'})]},
    library:{title:'散页藏书室',story:'一本没有书名的册子翻到了空白页。',choices:[choice('read','读懂旧卷','获得「澄明」。',{card:'clarity'}),choice('forget','烧去一页旧技艺','自由选择移除一张牌；牌组至少保留5张。',{remove:'any'})]},
    altar:{title:'余烬祭坛',story:'石碗中有一枚尚未熄灭的晶核。',choices:[choice('offer','献出10%血容量','血容量必须高于25%，获得一件未拥有的遗物。',{randomRelic:true,bloodCost:10}),choice('rest','围坐片刻','血容量+25，止血。',{blood:25,cleanse:true})]},
    prisoner:{title:'门后的囚徒',story:'生锈的牢门后传来轻轻的敲击。',choices:[choice('free','买下钥匙','支付20金币，获得渡鸦之羽；已有则改给45金币。',{relic:'feather'},20),choice('listen','听完他的故事','获得「洞察」与15金币。',{card:'insight',gold:15})]},
    mirror:{title:'裂开的镜子',story:'镜中的旅人比你更早举起了刀。',choices:[choice('cross','模仿镜中剑势','获得「影袭」。',{card:'backstab'}),choice('shatter','击碎空镜','获得35金币。',{gold:35})]},
    fountain:{title:'干涸的药泉',story:'石壁上爬满尚未枯萎的青藤。',choices:[choice('herbs','采下青藤','获得常青药囊；已有则改给45金币。',{relic:'herb'}),choice('bandage','就地处理伤处','存活部位修复20%，止血，血容量+20。',{heal:.2,blood:20})]},
    toll:{title:'断桥摆渡人',story:'摆渡人愿意用一块琥珀换走你的钱币。',choices:[choice('trade','交换蓄能石','支付35金币，获得琥珀蓄能石；已有则改给45金币。',{relic:'battery'},35),choice('path','沿岸找路','获得「退守」与10金币。',{card:'retreat',gold:10})]},
    sparrow:{title:'受伤的信鸟',story:'灰羽小鸟衔来一小袋遗落的钱币。',choices:[choice('rescue','照料信鸟','获得「回春」与20金币。',{card:'renew',gold:20}),choice('follow','跟随它的指引','获得一件未拥有的遗物。',{randomRelic:true})]},
    obelisk:{title:'旧路方碑',story:'方碑上的凹槽正好能放入一枚硬币。',choices:[choice('compass','购买罗盘','支付25金币，获得旧路罗盘；已有则改给45金币。',{relic:'compass'},25),choice('study','描下震荡符纹','获得「震荡」。',{card:'pulse'})]},
    cache:{title:'遗失的行囊',story:'倒塌的树干下压着一只旅行皮包。',choices:[choice('gold','收下钱袋','获得55金币。',{gold:55}),choice('study','取走技艺手册','获得「环刃」。',{card:'ring'})]}
  };
  // Frozen ID order is part of the v1/v2 save format. Never extend these pools.
  rules.legacy={rewardPool:[...rules.rewardPool],relics:Object.keys(rules.relics),enemies:Object.keys(rules.enemies),events:Object.keys(rules.events)};
  const rect=(w,h)=>Array.from({length:w*h},(_,i)=>[i%w,Math.floor(i/w)]);
  const advanced={
    tidecut:attack('潮线斩',1,'潮线',rect(4,1),{powerBonus:.5,art:'sweep'}),
    inkfork:attack('墨潮双叉',2,'双叉',[[0,0],[2,0],[0,1],[1,1],[2,1]],{powerBonus:1,art:'fork'}),
    deepneedle:attack('深水针',1,'针列',rect(1,4),{powerBonus:.5,pierce:true,art:'spear'}),
    tideguard:skill('回潮盾',1,{block:9,draw:1,art:'retreat'}),
    saltstitch:skill('盐泉缝线',1,{heal:10,cleanse:true,art:'suture'}),
    readcurrent:skill('解读水纹',0,{draw:2,exhaust:true,art:'clarity'}),
    hammerfall:attack('锻炉坠击',2,'锤面',rect(3,2),{powerBonus:1,pierce:true,art:'cleave'}),
    rivet:attack('铆钉阵',1,'四角',[[0,0],[2,0],[0,2],[2,2]],{powerBonus:1,block:4,art:'needle'}),
    forgecross:attack('熔火十字',2,'十字',[[1,0],[0,1],[1,1],[2,1],[1,2]],{powerBonus:1.5,art:'cross'}),
    steelcoat:skill('钢衣',1,{block:14,art:'wall'}),
    bellows:skill('风箱',0,{energy:2,draw:1,exhaust:true,art:'channel'}),
    fieldrepair:skill('战地整备',1,{heal:14,block:4,exhaust:true,art:'renew'}),
    mirrorfan:attack('万镜扇',2,'扇面',[[0,0],[1,0],[2,0],[3,0],[1,1],[2,1]],{powerBonus:1.5,art:'crescent'}),
    prism:attack('棱光环',2,'光环',[[0,0],[1,0],[2,0],[0,1],[2,1],[0,2],[1,2],[2,2]],{powerBonus:1,pierce:true,art:'ring'}),
    starlance:attack('星芒枪',1,'长枪',rect(1,4),{powerBonus:1.5,pierce:true,art:'spear'}),
    reflection:skill('折镜壁',1,{block:12,draw:1,art:'bulwark'}),
    nightsight:skill('夜观',1,{draw:4,exhaust:true,art:'insight'}),
    moonstitch:skill('月丝重缝',1,{heal:16,cleanse:true,art:'suture'}),
    supernova:attack('新星',3,'十二宫',rect(4,3),{powerBonus:2,pierce:true,exhaust:true,art:'burst'}),
    coronacut:attack('日冕轮',2,'日冕',[[0,0],[1,0],[2,0],[0,1],[2,1],[0,2],[1,2],[2,2]],{powerBonus:2,art:'ring'}),
    voidstep:attack('虚空踏',1,'折跃',[[0,0],[2,0],[1,1],[0,2],[2,2]],{powerBonus:1.5,block:6,art:'zigzag'}),
    lastwall:skill('不落壁垒',2,{block:24,draw:1,art:'bulwark'}),
    starfuel:skill('星核燃料',0,{energy:3,exhaust:true,art:'focus'}),
    rebirth:skill('余烬回生',1,{heal:22,cleanse:true,block:8,exhaust:true,art:'renew'})
  };
  Object.entries(advanced).forEach(([id,c],i)=>{c.minFloor=2+Math.floor(i/6);c.description=[c.shape?`${c.shape.length}格${c.shapeName}，基础攻效${Math.round((1+(c.powerBonus||0))*100)}%。`:'',c.pierce?'穿甲。':'',c.block?`基础格挡${c.block}。`:'',c.draw?`抽${c.draw}张。`:'',c.energy?`能量+${c.energy}。`:'',c.heal?`修复最重存活伤处${c.heal}点。`:'',c.cleanse?'全部止血。':'',c.exhaust?'消耗。':''].join('');rules.cards[id]=c;});
  rules.rewardPool=Object.keys(rules.cards).filter(id=>!['strike','focus'].includes(id));
  Object.assign(rules.relics,{
    tidepearl:{name:'潮汐珠',minFloor:2,description:'每回合开始获得2点格挡。',turnBlock:2},
    blueflame:{name:'蓝焰灯芯',minFloor:2,description:'攻击效能提高25%。',attack:.25},
    coral:{name:'珊瑚药盒',minFloor:2,description:'每次包扎额外修复5点。',healing:5},
    furnace:{name:'微型熔炉',minFloor:3,description:'每回合额外1能量，最多6。',energy:1},
    ironleaf:{name:'铁叶披风',minFloor:3,description:'卡牌格挡提高35%。',guard:.35},
    gear:{name:'回转齿轮',minFloor:3,description:'每回合多抽1张牌，手牌最多9张。',draw:1},
    lens:{name:'棱星透镜',minFloor:4,description:'攻击效能提高40%。',attack:.4},
    mirrorplate:{name:'镜面胸针',minFloor:4,description:'开局获得10格挡；每回合开始获得3格挡。',openingBlock:10,turnBlock:3},
    silverthread:{name:'银月线轴',minFloor:4,description:'每次非首领节点结束，额外修复存活部位8%并恢复10%血容量。',nodeHeal:.08},
    starheart:{name:'星核余温',minFloor:5,description:'攻击效能提高50%；每场开局额外1能量。',attack:.5,openingEnergy:1},
    dawnshield:{name:'黎明盾印',minFloor:5,description:'卡牌格挡提高50%；每回合开始获得4格挡。',guard:.5,turnBlock:4},
    eternity:{name:'永燃书签',minFloor:5,description:'每场开局多抽2张牌；包扎额外修复6点。',openingDraw:2,healing:6}
  });
  // Each upper floor has six common enemies, two elites and its own boss.
  const packs=[
    {floor:2,prefix:'tide',names:['溺页鼠','墨潮蛾','盐弓守望','淤泥抄写员','沉钟潜徒','珊瑚盾蟹','藏书禁卫','潮痕司书','溺海典藏者'],hp:[22,23,24,26,27,28,42,44,60],sprites:[0,1,2,3,4,5,'elite',6,7],damage:5},
    {floor:3,prefix:'forge',names:['炉渣啮兽','铜翼飞蛾','铆钉猎手','熔蜡工匠','灰铁监工','钢壳搬运者','炉膛刽子手','铁誓主教','百锤熔炉'],hp:[32,34,35,37,38,40,58,61,82],sprites:[0,1,2,3,4,5,'elite',6,'boss'],damage:7},
    {floor:4,prefix:'mirror',names:['镜隙啮影','月尘蝶','碎光射手','水银镜灵','无面观星人','星壳守卫','棱镜执刑官','盲目先知','千面星后'],hp:[44,46,48,50,52,54,78,82,108],sprites:[0,1,2,3,4,5,'elite',6,7],damage:9},
    {floor:5,prefix:'star',names:['蚀星幼兽','日蚀蛾','黑曜投矛者','星髓凝聚体','终焰苦修者','陨铁巨蟹','终火审判者','寂星引路人','永夜之心'],hp:[58,60,63,65,68,70,100,106,144],sprites:[0,1,2,3,4,5,'elite',6,'boss'],damage:11}
  ];
  packs.forEach(p=>p.names.forEach((name,i)=>{
    const kind=i===8?'boss':i>=6?'elite':'battle',d=p.damage+(kind==='boss'?4:kind==='elite'?2:0),id=p.prefix+i;
    rules.enemies[id]={...enemy(name,kind,p.hp[i],p.sprites[i],i%4,[I(['突袭','裂刃','冲撞'][i%3],d),I(kind==='boss'?'王座重铸':i%2?'凝甲':'蓄力',0,p.floor+(i%3),i%2?0:1),I(kind==='boss'?'崩解审判':'追猎',d+2,0,kind==='battle'?0:1)],kind==='boss'?p.floor+1:0),floor:p.floor};
  }));
  Object.assign(rules.events,{
    tidetable:{minFloor:2,title:'被水淹没的案桌',story:'墨迹顺着水纹散开，一页完整剑谱漂到灯下。',choices:[choice('ink','拾起剑谱','获得「墨潮双叉」。',{card:'inkfork'}),choice('pearl','打捞潮珠','支付35金币，获得潮汐珠；已有则45金币。',{relic:'tidepearl'},35)]},
    saltclinic:{minFloor:2,title:'盐泉诊室',story:'玻璃瓶里封存着旧日医者的盐泉。',choices:[choice('restore','接受再生术','支付45金币，恢复一支缺失部位树；没有缺失则全身修复40%。',{restore:true},45),choice('learn','收起缝线','获得「盐泉缝线」，血容量+20。',{card:'saltstitch',blood:20})]},
    drownedbell:{minFloor:2,title:'水下钟声',story:'一记钟声让所有漂浮书页同时静止。',choices:[choice('listen','听清潮汐','获得「解读水纹」及25金币。',{card:'readcurrent',gold:25}),choice('rest','等待退潮','修复存活部位35%，全部止血，血容量+35。',{heal:.35,blood:35})]},
    gearmarket:{minFloor:3,title:'齿轮黑市',story:'无名匠人把仍在转动的齿轮装进木盒。',choices:[choice('gear','购买齿轮','支付55金币，获得回转齿轮；已有则45金币。',{relic:'gear'},55),choice('rivet','学习铆接','获得「铆钉阵」和20金币。',{card:'rivet',gold:20})]},
    coldanvil:{minFloor:3,title:'未冷的铁砧',story:'铁砧上回荡着前一位旅人的最后一锤。',choices:[choice('forge','接过锻锤','获得「锻炉坠击」。',{card:'hammerfall'}),choice('coat','披上钢衣','获得「钢衣」，修复存活部位15%。',{card:'steelcoat',heal:.15})]},
    furnacegarden:{minFloor:3,title:'炉边药圃',story:'暗红的叶片在火舌旁缓缓展开。',choices:[choice('heal','采药整备','获得「战地整备」，全身止血，血容量+35。',{card:'fieldrepair',blood:35,cleanse:true}),choice('fuel','收集燃料','获得「风箱」和35金币。',{card:'bellows',gold:35})]},
    starwindow:{minFloor:4,title:'没有倒影的窗',story:'窗外的星辰组成了你尚未走过的路。',choices:[choice('lens','取下观星透镜','支付65金币，获得棱星透镜；已有则45金币。',{relic:'lens'},65),choice('prism','描下星轨','获得「棱光环」。',{card:'prism'})]},
    moonward:{minFloor:4,title:'月光病房',story:'银线在空中缓慢缝起一道裂口。',choices:[choice('restore','缝补缺失部位','支付55金币，恢复一支缺失部位树；无缺失则全身修复40%。',{restore:true},55),choice('thread','学会月丝重缝','获得「月丝重缝」，全部止血。',{card:'moonstitch',cleanse:true})]},
    mirrorchoir:{minFloor:4,title:'碎镜合唱',story:'每一片镜子都在唱不同的旋律。',choices:[choice('fan','记下剑舞','获得「万镜扇」。',{card:'mirrorfan'}),choice('quiet','让歌声停歇','获得70金币，血容量+30。',{gold:70,blood:30})]},
    fallenstar:{minFloor:5,title:'坠落的晨星',story:'星核还在震动，仿佛一颗迟迟不肯停下的心脏。',choices:[choice('fuel','封存星核','获得「星核燃料」和30金币。',{card:'starfuel',gold:30}),choice('relic','接住余温','支付80金币，获得星核余温；已有则45金币。',{relic:'starheart'},80)]},
    dawnsanctum:{minFloor:5,title:'黎明圣所',story:'石壁上残存着最后一道完整盾印。',choices:[choice('wall','记下不落壁垒','获得「不落壁垒」。',{card:'lastwall'}),choice('restore','接受最后的再生','恢复一支缺失部位树，无缺失则全身修复40%；血容量+50。',{restore:true,blood:50})]},
    lastletter:{minFloor:5,title:'最后一封家书',story:'纸张已经烧焦，唯独“活着回来”四字还清晰可辨。',choices:[choice('rebirth','带走这句话','获得「余烬回生」，修复存活部位25%。',{card:'rebirth',heal:.25}),choice('nova','点燃信纸','血容量高于25%时献出10%，获得「新星」和一件未拥有遗物。',{card:'supernova',randomRelic:true,bloodCost:10})]}
  });
  rules.floors=[
    {name:'残火之径',subtitle:'THE ASHEN PATH',story:'提灯穿过苔石与旧钟。先补足牌组，再推开灰冠之门。',hue:0},
    {name:'潮汐书库',subtitle:'THE DROWNED ARCHIVE',story:'书页沉入墨潮。护甲与蓄力的敌人开始考验穿甲和治疗。',hue:135},
    {name:'铜炉工坊',subtitle:'THE COPPER FORGE',story:'钢铁在火中苏醒。用高效削层、能量和格挡突破铸造防线。',hue:325},
    {name:'碎镜天台',subtitle:'THE SHATTERED OBSERVATORY',story:'月光折入万千镜面。厚重生命格与狂怒首领等待成熟的牌组。',hue:225},
    {name:'群星熔心',subtitle:'THE STELLAR HEART',story:'余火抵达永夜中心。整备身体，用最强的形状划出黎明。',hue:285}
  ];
  // Freeze reward/legacy pools before adding permanent, per-copy upgrade variants.
  rules.baseCardIds=Object.keys(rules.cards);
  rules.describeCard=card=>[
    card.shape?`${card.shape.length}格${card.shapeName}攻击，基础攻效${Math.round((1+(card.powerBonus||0))*100)}%。`:'',
    card.pierce?'穿甲，忽略生命格护甲。':'',card.block?`获得${card.block}点格挡，下个己方回合开始时清空。`:'',
    card.draw?`抽${card.draw}张牌。`:'',card.energy?`本回合获得${card.energy}能量。`:'',
    card.heal?`修复最重的存活伤处${card.heal}点。`:'',card.cleanse?'全部部位止血。':'',
    card.exhaust?'消耗：本场战斗不再抽到。':''
  ].filter(Boolean).join('');
  for(const id of rules.baseCardIds){
    const c=rules.cards[id];c.baseId=id;c.upgraded=false;c.description=rules.describeCard(c);
    const u={...c,name:c.name+'+',art:c.art||id,upgraded:true};
    if(c.shape)u.powerBonus=(c.powerBonus||0)+1;
    else{
      if(c.block)u.block=c.block+(c.block>=12?5:3);
      if(c.draw)u.draw=c.draw+1;
      if(c.heal)u.heal=c.heal+4;
      if(c.energy)u.energy=c.energy+1;
    }
    u.description=rules.describeCard(u);rules.cards[id+'+']=u;
  }
  rules.upgradeId=id=>rules.cards[id]&&!rules.cards[id].upgraded?id+'+':null;
  root.EmberRules = rules;
  if (typeof module !== 'undefined' && module.exports) module.exports = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
