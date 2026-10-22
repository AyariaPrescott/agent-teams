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
    library:{title:'散页藏书室',story:'一本没有书名的册子翻到了空白页。',choices:[choice('read','读懂旧卷','获得「澄明」。',{card:'clarity'}),choice('forget','烧去直击的旧页','移除一张直击；牌组至少保留5张。',{remove:'strike'})]},
    altar:{title:'余烬祭坛',story:'石碗中有一枚尚未熄灭的晶核。',choices:[choice('offer','献出10%血容量','血容量必须高于25%，获得一件未拥有的遗物。',{randomRelic:true,bloodCost:10}),choice('rest','围坐片刻','血容量+25，止血。',{blood:25,cleanse:true})]},
    prisoner:{title:'门后的囚徒',story:'生锈的牢门后传来轻轻的敲击。',choices:[choice('free','买下钥匙','支付20金币，获得渡鸦之羽；已有则改给45金币。',{relic:'feather'},20),choice('listen','听完他的故事','获得「洞察」与15金币。',{card:'insight',gold:15})]},
    mirror:{title:'裂开的镜子',story:'镜中的旅人比你更早举起了刀。',choices:[choice('cross','模仿镜中剑势','获得「影袭」。',{card:'backstab'}),choice('shatter','击碎空镜','获得35金币。',{gold:35})]},
    fountain:{title:'干涸的药泉',story:'石壁上爬满尚未枯萎的青藤。',choices:[choice('herbs','采下青藤','获得常青药囊；已有则改给45金币。',{relic:'herb'}),choice('bandage','就地处理伤处','存活部位修复20%，止血，血容量+20。',{heal:.2,blood:20})]},
    toll:{title:'断桥摆渡人',story:'摆渡人愿意用一块琥珀换走你的钱币。',choices:[choice('trade','交换蓄能石','支付35金币，获得琥珀蓄能石；已有则改给45金币。',{relic:'battery'},35),choice('path','沿岸找路','获得「退守」与10金币。',{card:'retreat',gold:10})]},
    sparrow:{title:'受伤的信鸟',story:'灰羽小鸟衔来一小袋遗落的钱币。',choices:[choice('rescue','照料信鸟','获得「回春」与20金币。',{card:'renew',gold:20}),choice('follow','跟随它的指引','获得一件未拥有的遗物。',{randomRelic:true})]},
    obelisk:{title:'旧路方碑',story:'方碑上的凹槽正好能放入一枚硬币。',choices:[choice('compass','购买罗盘','支付25金币，获得旧路罗盘；已有则改给45金币。',{relic:'compass'},25),choice('study','描下震荡符纹','获得「震荡」。',{card:'pulse'})]},
    cache:{title:'遗失的行囊',story:'倒塌的树干下压着一只旅行皮包。',choices:[choice('gold','收下钱袋','获得55金币。',{gold:55}),choice('study','取走技艺手册','获得「环刃」。',{card:'ring'})]}
  };
  root.EmberRules = rules;
  if (typeof module !== 'undefined' && module.exports) module.exports = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
