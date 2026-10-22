# 美术方向、资产与生成提示词

用户要求：“游戏的ui和贴图不好看，由你自己重新生成”。需求ID：`user-2026-10-22-art-ui-redesign`。

本轮使用内置 **image_gen** 生成工具，不使用CLI/API回退。Codex负责提示词、资产选择、接入代码和界面；图像像素由image_gen生成。没有调用DeepSeek，也没有发送凭据或私有快照。

## 最终资产

资产根目录：`dist/assets/`。表中PNG为生成器原始输出的逐字节副本，未做裁切、重采样、重绘或背景替换。4项角色贴图为32位RGBA，文件角点透明度为0；其余为不透明RGB。图片本身已目视审阅，非游戏截图或运行验证。

| 最终路径 | 用途 | 尺寸 | 字节数 | SHA-256 |
| --- | --- | --- | --- | --- |
| `dist/assets/ashen-hall.png` | 战斗背景 | 1672×941 | 2846328 | `b093e39c7467a24015850b9eb1a8c1d823af69390d430f70ff5dd0f67fbac91e` |
| `dist/assets/lantern-wanderer.png` | 提灯旅人 | 1024×1536 | 2412413 | `a5274fb2bbc9f250235d9f79e7c8804f0ebd14045759ae6a5ac010adfe0a6bfc` |
| `dist/assets/moss-sentinel.png` | 普通敌人 | 1024×1536 | 2669668 | `8a555209ee702cdc113da7ef170429ede5141b7fb49f55a9759dd5c1be4aa5db` |
| `dist/assets/thorn-executioner.png` | 精英敌人 | 1024×1536 | 2310271 | `9a0afa77f9ab11c45313710bf4faa915e16e81583eff387d2175b9f9149d536c` |
| `dist/assets/ash-crown.png` | 灰冠门主 | 1024×1536 | 3097675 | `ac2739232d13b29b2473b2f723455d441a3aa728a47b257a1db7c11e8e5c95f8` |
| `dist/assets/route-parchment.png` | 路线羊皮纸底图 | 1086×1448 | 3280236 | `c167b78543577c6007b33ab23803e19ee67569539765800439f9df7c99002e4d` |
| `dist/assets/card-atlas.png` | 十张卡牌插画图集 | 1983×793 | 3510508 | `ffecaa4923b45b6fe078728a13ad25ca3d9454ce1c021a0930e8bb2b671fffba` |

`dist/art.js`统一声明本地图片路径；游戏通过CSS变量、图片元素和5×2图集位置引用。十张卡牌依次为：首行直击、举盾、重砸、余烬、洞察；第二行招架、专注、十字斩、横扫、坚守。卡牌形状用独立网格徽标呈现，选中后的实际放置预览仍由现有战斗逻辑绘制，不依赖插画判断命中。

`余烬回廊.html`将全部7项图片内嵌为data URI，并合并五个模块和样式，保留单文件离线使用。由于保留原始PNG，独立文件体积会增加；通过本地网站运行时，图片作为本地静态资源加载，无远程运行请求。

## 界面选择

手绘暗黑幻想，以午夜靛蓝、炭黑、暖羊皮纸和旧金铜搭配暖橙余烬。战斗保留清晰的健康摘要、敌人意图、方格生命与底部手牌；场景和角色成为主要视觉。地图使用羊皮纸底图，节点以原生SVG印章图标绘制。卡牌改为插画、暖纸牌面和金铜边框，医疗、结算与存档弹窗使用同一套颜色和字级。

整合此前叠加的样式为单一响应式样式表；继续使用窗口高度分配、详情内部滚动和窄屏横向手牌。玩法数值、部位公式、节点内容、随机状态和存档版本不变；旧的本层存档继续使用同一恢复逻辑。此处是实施意图和代码范围，不宣称完成浏览器实测。

## 完整提示词

下列文本就是本轮每项资产提交给内置工具的提示词；人物生成时传入`transparent_background=true`，其余为false。没有输入参考图片，全部为新生成。

### ashen-hall.png · 战斗背景

```text
Use case: stylized-concept. Asset type: final background illustration for a local 2D deckbuilding battle game, wide 16:9 landscape. Original hand-painted dark storybook fantasy, richly textured gouache and restrained oil brushwork, strong readable silhouettes, elegant muted midnight indigo and charcoal with worn bronze, amber firelight, ivory mist. Scene: the interior courtyard of a ruined cathedral in an ashen forest, tall broken gothic arches, twisted roots and a distant sealed doorway. Wide side-on battle stage: empty stone floor across the lower third, open central area where two separate character sprites will stand. Architecture recedes in layered atmospheric depth. A few glowing cinders, a small warm lantern niche on the left, subtle desaturated violet sky. Painterly, carefully composed, premium indie card game key art, not photorealistic or 3D. Keep upper corners and central fighting area fairly quiet for readable interface overlays. No characters, no monsters, no text, no letters, no UI, no frame, no watermark. Make the scene luminous enough to see its hand-painted details, with soft peripheral darkness.
```

### lantern-wanderer.png · 提灯旅人

```text
Use case: stylized-concept. Asset type: a single game-ready full-body character sprite on a truly transparent background, portrait 2:3 composition. Original hand-painted dark storybook fantasy, textured gouache and restrained oil brushwork, clear inked edges and strong silhouette. A mysterious travelling swordswoman wearing a weathered burnt-orange hooded cloak, dark indigo leather layers, narrow boots, a brass belt and an ivory scarf; hood shadows her face but hints at determined eyes. One hand holds a short worn sword low, the other lifts a brass lantern with a vivid warm amber flame. Standing grounded in a confident combat-ready three-quarter side view, facing RIGHT, head slightly turned right. Elegant stylized proportions, readable at 250px tall, warm rim light and cool indigo shadows. Complete body including head, both feet, sword and lantern, all fully inside image with a little breathing room. Single character only. No scenery, no floor, no cast ground shadow, no text, no labels, no UI, no watermark. Genuine transparent alpha around the character, not a checkerboard painted into the image.
```

### moss-sentinel.png · 普通敌人

```text
Use case: stylized-concept. Asset type: a single game-ready enemy sprite on a truly transparent background, portrait 2:3 composition. Original hand-painted dark storybook fantasy, textured gouache and restrained oil brushwork, strong carved silhouettes and inked edge accents. A squat ancient moss-covered stone sentinel, asymmetrical cracked slabs, one huge hammer-like stone forearm, tangled dry roots around its shoulders, sparse pale lichen, small amber eyes and a glowing ember in its chest cavity. Expressive grumpy guardian rather than generic robot. Worn blue-grey stone, muted olive moss, indigo recesses, warm copper light. Standing combat-ready in three-quarter side view facing LEFT, entire body and both broad feet visible, hands held low with room to swing. Premium 2D indie deckbuilder enemy concept made into a clean isolated sprite, readable silhouette at 240px tall. No other characters, no scenery, no floor, no ground shadow, no UI, no text, no watermark. All extremities inside the image. Genuine transparent alpha.
```

### thorn-executioner.png · 精英敌人

```text
Use case: stylized-concept. Asset type: a single game-ready elite enemy sprite on a genuinely transparent background, portrait 2:3. Same cohesive original hand-painted dark storybook fantasy language: textured gouache, restrained oil paint, clear inked edges, midnight indigo shadows and aged bronze highlights. The Thorn Executioner: a tall ominous articulated bronze knight, hunched armour wrapped in thorny brambles, pointed pauldrons, a narrow hollow visor with two dim amber slits, a ragged deep burgundy tabard. Holds a brutal chipped cleaver in its RIGHT hand pointing low toward the LEFT, heavy left gauntlet clenched. Three-quarter combat stance facing LEFT. Distinct silhouette from a rock golem and from a crowned boss, lean threatening torso and long arms. Full body, both feet, complete cleaver and all thorns inside frame with small clear margins, no parts cropped. Premium painterly 2D deckbuilding game sprite, readable at 280px tall. No background, scenery, floor, cast ground shadow, text, logos, frame or UI. True transparent alpha.
```

### ash-crown.png · 灰冠门主

```text
Use case: stylized-concept. Asset type: single final-boss full-body game sprite on a genuinely transparent background, portrait 2:3. Original hand-painted dark storybook fantasy, textured gouache and restrained oil brushwork, strong readable inked silhouette; midnight indigo and charcoal, antique gold and intense amber embers. The Ash-Crowned Gate Lord: a massive regal hollow armour monarch, wide weathered charcoal stone-and-bronze shoulders, a distinctive tall jagged golden crown hovering just above a dark helm, glowing ember face and chest. Cracked chest ribs reveal warm fire, long shredded ivory-grey royal mantle, a great chipped gate-shaped sword resting diagonally toward the LEFT, heavy armoured feet planted apart. Facing LEFT in three-quarter battle view, menacing but dignified. Entire full body, crown, sword and mantle completely inside image with comfortable margins. Designed to read as an imposing unique boss at 320px tall. No other figures, no scenery, no floor, no cast ground shadow, no UI, no text, no letters, no watermark. True transparent alpha, not a painted checkerboard.
```

### route-parchment.png · 路线羊皮纸底图

```text
Use case: stylized-concept. Asset type: a portrait 3:4 background texture illustration for a branching travel map in an original fantasy deckbuilding game. Hand-painted antique parchment, textured warm ash-grey paper with muted umber edge wear, subtle midnight violet vignette and bronze pigment accents. Almost empty central 75 percent: fine soft paper grain and pale smoky washes only, plenty of calm space for separate UI route nodes and dashed connections. Along the distant edges, delicate ink-and-gouache silhouettes of an ashen forest, a broken bridge near the bottom corners, ruined cathedral spires near the top corners and faint contour-like terrain strokes. Premium atmospheric illustrated travel journal, dark storybook fantasy, luminous parchment rather than black or muddy. No pre-drawn routes, no nodes, no markers, no grid, no words, no lettering, no numbers, no readable symbols, no compass, no characters, no interface, no heavy decorative frame, no watermark.
```

### card-atlas.png · 十张卡牌插画图集

```text
Use case: stylized-concept. Asset type: one production-ready sprite atlas containing EXACTLY 10 card art illustrations, arranged in an EXACT regular 5-COLUMN by 2-ROW grid, wide 5:2 aspect ratio. Every cell exactly equal size; images meet edge-to-edge with NO gutters, NO gaps, NO frames, NO rounded corners and NO text. Each cell a separate square miniature hand-painted dark storybook fantasy painting, textured gouache with strong readable central motifs, indigo/charcoal shadows, antique gold, warm ivory and embers. TOP ROW left to right: (1) a worn silver short sword cutting a glowing diagonal arc; (2) a sturdy bronze round shield with an amber rune-like central boss but no writing; (3) a heavy stone war hammer smashing rock shards; (4) a bright orange ember flame cupped in a dark gauntlet; (5) an opened luminous mystical eye amid curling pale smoke. BOTTOM ROW left to right: (6) a short sword parrying across a small shield with sparks; (7) a focused ivory star of light hovering over a hand; (8) two crossing golden blades creating a cross-shaped slash; (9) one long sweeping curved blade with a broad horizontal golden trail; (10) a massive rectangular iron tower shield planted firmly in stone. Keep each main object centered and entirely within its own cell, never crossing grid boundaries. Each cell has its own fully painted atmospheric background. Consistent premium painterly game illustration, readable at 100px. Strict 5 by 2 equal grid so CSS background positioning can address cells. No UI, no card text, no labels, no borders, no watermark.
```

## 审计与验证范围

主项目事务：`2ea4ed32dc324cac9a7ad3f3aadc4f25`，在任何项目资产复制与源码修改前登记目标。生成器自己的输出路径由工具返回，得到真实路径后另按客观文件哈希、尺寸、创建时间元数据补录，并标为retrospective；不把文件创建时间冒充精确生成时刻，也不宣称代理能拦截生成器任意文件写入。生成器原输出保留，未删除。

本机私有审计保存原输出位置与项目目标之间的关联。项目PNG与HTML、源码有修改前后快照，可通过事务或Git提交回滚；发现后续编辑冲突时不强制覆盖。

按用户持续要求，没有运行游戏测试、语法检查、浏览器自动化或试玩。只审阅生成图片、PNG元数据、源码、差异、资源引用和待提交内容，视觉适配与手感由用户实际游玩确认。

## 2026-10-22 · 扩展图集

新增三个最终资产使用内置image_gen生成，Codex提示、审阅与复制，未进行像素修改。原有七项资产仍保留。需求：user-2026-10-22-content-balance-relics；项目事务：d7e74a6446b54bc6935a3f59cb25afe4。

| 最终路径 | 尺寸 | 字节数 | SHA-256 |
| --- | --- | --- | --- |
| `dist/assets/room-atlas.png` | 2048×768 | 3256093 | `5740d7b629a4c815317145ec7e168508f97efc5ba75a1571c7bc0a66cc14a8cc` |
| `dist/assets/enemy-atlas.png` | 1448×1086 | 2530058 | `dcdc214e40189085e85fb127369307d4f9edc0dece372450a7fce146140a845d` |
| `dist/assets/expansion-card-atlas.png` | 1402×1122 | 3212383 | `d90f228c21d2edd738a7878dd509357b52faa32e43841588aed5f00d18cc5a95` |

房间图集3列2行，首行营火/商店/宝箱，次行泉林事件/精英炉厅/Boss王座。敌人图集4列2行，依次鼠/蛾/弓手/凝胶，行者/蟹/先知/古根王后，保留RGBA透明通道。新卡图集5列4行，与CONTENT-EXPANSION.md新增20卡顺序一致。

角色图像通过图集格位和已有单体PNG组合支持19种定义，不宣称每种都有独立原画。资源按art.js地址解析，独立HTML则内嵌全部10项PNG。未运行浏览器检查，图像审阅不等同于页面适配验证。

### room-atlas.png · 完整提示词

```text
Use case: stylized-concept. One final production game background atlas, EXACT 3 columns by 2 rows, all six cells equal 16:9 landscape proportions, total canvas roughly 8:3 wide. No gutters, no borders, no text, no symbols or UI. Original hand-painted dark fantasy, textured gouache/oil paint, midnight indigo, antique bronze, warm amber lanterns and ivory haze. Each cell is a complete empty side-view room with a calm foreground for a 2D card-game overlay. TOP left: warm campfire under broken forest arches, bedrolls and distant trees. TOP middle: mysterious travelling merchant's candlelit stall with shelves of bottles, hanging trinkets and folded cloth. TOP right: ancient treasure vault with a luminous chest among gold and ruined pillars. BOTTOM left: quiet moonlit healing spring with a stone basin and pale blue luminous water in a forest ruin. BOTTOM middle: menacing red-amber elite enemy cathedral forge, chains and a cold anvil, empty floor. BOTTOM right: imposing royal boss throne hall with a sealed door, tall dark pillars and a crown-shaped silhouette far away, empty foreground. Rich coherent painterly atmosphere, readable architectural silhouettes, luminous details without overbusy central space. No characters or monsters, no letters, no watermark. Strict equal 3 by 2 atlas grid so CSS can select cells.
```

### enemy-atlas.png · 完整提示词

```text
Use case: stylized-concept. A final game sprite atlas on a truly transparent background, EXACT 4 COLUMNS by 2 ROWS of eight separate original hand-painted dark fantasy enemy sprites. All cells equal portrait 2:3, atlas total ratio 4:3. No borders or gutters drawn, no text, no letters, no labels. Entire full body, weapons and extremities of EACH creature inside its own cell with 8 percent clear margin, no overlapping adjacent cells. All face LEFT in three-quarter combat stance. Textured gouache and restrained oil paint, strong inked silhouettes, charcoal/indigo shadows, aged bronze and amber highlights matching a premium dark-fantasy deckbuilder. TOP row left to right: (1) small soot-black rat with glowing ember tail; (2) elegant giant ember moth with folded burnt-orange wings and skull-like markings; (3) hooded ragged bandit archer with a crooked bow; (4) squat translucent midnight-blue slime with faint gold core. BOTTOM row: (5) ghostly bell-carrying pilgrim in torn ivory robes; (6) armoured ash crab with iron shell and bronze claws; (7) tall glass-masked oracle with violet crystal staff, ornate elite silhouette; (8) imposing root-crowned forest queen made of ancient gnarled wood, torn ivory bark cloak, amber core, regal boss silhouette. No scenery, no floor, no ground shadows, true transparent alpha around each sprite, no checkerboard painted into image. Painterly details and clear varied silhouettes.
```

### expansion-card-atlas.png · 完整提示词

```text
Use case: stylized-concept. One production card illustration atlas of EXACTLY 20 separate square paintings, EXACT 5 COLUMNS by 4 ROWS, no gaps or borders, no text or numbers. All equal cells edge-to-edge, no subject crosses cell boundaries. Coherent hand-painted dark fantasy gouache/oil, indigo charcoal backgrounds, aged gold, warm amber and ivory light, readable centered miniature motifs. ROW 1 left to right: hooked bronze blade; two zigzag lightning blades; diagonal stair-like chain of four glowing cuts; long ivory-tipped spear; ring of eight glowing sword fragments. ROW 2: fiery nine-point impact burst; two-pronged fork blade; broad heavy cleaver; tiny piercing silver needle; crescent moon sickle. ROW 3: heavy fortress wall of shields; traveller retreating behind a small shield; two amber energy crystals hovering in a hand; a healing herb wrapped in white cloth with green glow; bronze surgical needle stitching an ivory cloth. ROW 4: three luminous pages of a book; a feinting short dagger with curling smoke; shield leaning against a white bandage roll; a golden shock-wave crossing dark stone; assassin's narrow curved knife in indigo smoke. Every painting has its own subtle atmospheric backdrop, centered subjects fit within their square. Premium painterly deckbuilding game art, strong silhouettes at 100 pixels. No UI, frames, labels, lettering or watermark. Strict 5 by 4 uniform atlas.
```
