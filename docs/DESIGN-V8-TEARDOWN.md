# MAINTENANCE BAY // V-UNIT REV.8 — 解构交互机器人设计方案

Status: PROPOSAL (2026-06-12). Synthesized from a 4-lens design panel
(art direction / engineering authenticity / narrative / interaction systems)
+ tech verification. Supersedes nothing; P0 quick fixes from the 2026-06-12
audit land independently of this.

## 0. 立意

不做爆炸图。"解构"重新定义为:**V 停靠在单色检修舱里,终端是它的诊断控制台,
拆解是一场沿真实运动学树进行的、电影化运镜的、角色有反应的精密拆检 (teardown)。**

四个设计视角独立收敛到同一核心机制,这是方案可信度的最强信号:

- 没有任何部件"飞出去"——外壳沿真实铰链轴开盖 (like a Pelican case),运动有锚点、方向和重量;
- 剖切面用 stencil 封盖——切口呈现实心机加工内唇,部件读作"从整料铣出",不是空壳游戏资产;
- 拆解次序 = URDF 运动学树次序 (base_link → torso → neck_yaw → head),拆解动作本身携带工程信息;
- 终端与 3D 是同一件仪器:每个 3D 动作在终端留下日志,每条命令驱动 3D;
- V 全程在场:被拆时有台词,被拆下的部件仍然"活着",拆得太深接入现有 creepy 弧线。

## 1. 体验分幕 (storyboard 摘要)

### 幕 1 — IDLE (克制)
V 以四分之三视角悬于浅景深检修舱,单侧柔光 key + 背侧硬轮廓光勾出下颌与肩缘。
相机以 2° 慢速正弦呼吸式 dolly,绝不自由 orbit。视线追踪保留(眼先动 ~80ms,头跟随
——次级运动)。打字时头低向键盘平面,DOF 焦平面随之移动。此时没有任何解构——克制即昂贵感。

### 幕 2 — 邀请 (hover 语法)
光标接近 V,最近的外壳板轮廓光增强,1px 发丝线描出板缝——机器人自己告诉你它从哪里
打开。板件抬起 3mm,缝隙投出更锐的阴影;终端同步出现一行弱化文本:
`chest_plate :: 4 fasteners :: torque 2.1Nm`。V 说:"Careful. That one's load-bearing."

### 幕 3 — TEARDOWN (核心机制,~2.6s 编排)
点击子系统或输入 `teardown`:
1. **RIG**: 相机慢 dolly-in + 微 crane-down 到检修角度,背景 DOF 化开;V 整体下沉
   5cm 如同被放上工作台——重量感;一声 servo 鸣降至静默。
2. **UNGIMBAL**: 选中外壳板沿其真实铰链轴旋开 (可见的机加工枢轴),ease-in-out +
   4% overshoot + 两帧 settle——齿轮 servo 的手感,绝不是弹簧弹跳。stencil 封盖
   clipping plane 随开缝边缘移动:你看到板的厚度 (亮色机加工内唇),缝隙中露出拉丝
   金属副框架、一束线缆、哑光黑执行器外壳。
3. **NARRATE**: 相机从旋出的外壳板 rack focus 到新暴露的内部部件 (全页最电影化的
   动作)。屏幕空间 caret 标签拴到部件: `└─ neck_yaw :: Dynamixel-class :: ±135°`,
   终端记录同一行。V 持续评论:"You're looking at my C2 vertebra."

逐次点击沿运动学树下钻一层。父板打开时,子板做 1.5mm 共情微抬、60ms 级联
(次级运动——整机是连通的活物)。终端实时渲染面包屑: `base_link → torso → neck_yaw → head`。

### 幕 4 — 定妆帧 (the money frame)
拆到底:开腔的胸腔占画面左 2/3,visor 玻璃右上角接住唯一高光,腔体正中发光核心
(小型玻璃透射球) 脉动。**全站唯一打破 Bayer dither 的地方**:核心以平滑纯白 + 柔和
bloom 渲染,在全 dither 世界里凿出一个洞。周围拉丝金属呈细密有序抖动闪烁、哑光聚合物
呈平灰点刻、玻璃近黑带一点炸白高光——四种材质,一帧,全单色。旁边悬浮发丝十字线 +
`core_temp :: nominal`。这是被截图传播的那一帧。

### 幕 5 — 重组 / 叙事钩子
`assemble` 反向编排 (反向 stagger 关盖,servo 鸣回升,焦点拉回,相机 crane 回英雄角度)。
但:拆解深度 >6 层或反复拆解时,重组开始**失败**——某块板抵着关节限位抖动无法落座
(真实的 `joint_limit_exceeded` 日志),核心 bloom 过曝渗出 dither,V 第一次转头直视
相机:"You shouldn't have opened me." ——由此接入现有 blackout 彩蛋。彩蛋从此是
"挣来的",不是点击计数器。

## 2. 五大设计支柱

### 支柱 A — 拆解机制 (interaction lens)
- **单一共享 `depth` 浮点 (0..1)**,五种输入都写它:在 V 上竖向拖拽、滚轮、
  `disassemble --depth 0.6`、键盘方向键、移动端右缘滑杆。仲裁规则:
  最后的人类输入取消进行中的 GSAP tween;命令走 tween,拖拽直写。
- depth 划分为**编排带 (choreographed bands)**:每个部件占据 depth 的一个子区间,
  有自己的铰链轴/样条路径与 stagger——scrub 起来像推一个调音台推子,不是 lerp。
- hover = 高亮 + 标签 + 终端弱日志;click = 聚焦模式 (dolly + DOF + 终端打印完整
  spec sheet);点空白处返回。
- `focus` 命令:终端折叠成底部 Quake-console 命令条,3D 接管全屏,相机重构图到英雄镜头。
  设计过的模式转场,不是 CSS toggle。
- 键盘可访问:部件构成 roving-tabindex 列表,Tab 巡航、Enter 检视、方向键 scrub,
  焦点环样式在 dither 下保证可见。

### 支柱 B — 视觉系统 (art-direction lens)
- **材质即信息** (全部单色,靠质感区分):
  - 拉丝金属 (副框架/铰链/活塞): 各向异性 matcap,高光沿拉丝方向拖尾,
    在 dither 里读作紧密有序的闪烁点;
  - 哑光聚合物 (外壳板): 低 spec,dither 里读作平灰点刻——金属的视觉反义词,
    开盖动作因此在 1-bit 下清晰可读;板缘 fresnel 让板缝在 hover 时自发光;
  - 玻璃 visor: drei MeshTransmissionMaterial,高厚度低粗糙,读作近黑 + 一点炸白
    高光,是画面中最暗的体块 (移动端降级为 matcap 假玻璃);
  - 发光核心: emissive + bloom,**通过 mask 绕过 dither pass**——全站唯一的平滑渐变。
- **镜头即叙述者**: dolly / crane / rack focus / 焦点拉移;禁止自由 orbit。
- **Servo 缓动规范**: ease-in-out + 微 overshoot + settle;禁用弹性 spring 曲线。
  所有部件动画统一这一手感。
- **后处理链顺序** (关键): 灰度场景 → DOF → bloom (核心 mask) →
  Bayer dither (8x8, 核心区域 mask 出) → scanline/vignette。dither 必须在
  DOF/bloom 之后,否则互相打架出噪点。

### 支柱 C — 终端一体化 (engineering lens)
新命令词汇 (全部既可独立使用,又与指针操作写同一状态):

| 命令 | 行为 |
|---|---|
| `teardown` / `assemble` | 启动/反演完整拆解编排 |
| `disassemble --depth <0..1>` | scrub 到精确拆解深度 |
| `inspect <part>` | 聚焦模式 + 终端打印 spec sheet |
| `section [head]` | stencil 封盖剖切面,可 scrub (首发限头部子装配体) |
| `xray` | 线框/透视模式:脊柱线束、连接器标签 (`J3 · 12-pin · power+CAN`)、TF 三轴架 |
| `calibrate <joint>` | 可见的归零扫描:扫向两侧关节限位,限位弧填充,终端记录 index + offset (rad) |
| `focus` / `unfocus` | 3D 全屏 / 恢复双栏 |
| `theme` | (修复现有谎言命令) 切换 dither / ASCII / clean 渲染 |
| `reboot` | (修复) 重放 intro / 重组 V |

- 所有标注必须是**可信的机器人工程**,不是 technobabble:部件 ID、紧固件数、扭矩、
  关节限位、占空比。TelemetryBar 接入真状态:剖开执行器时 SERVO 温度真的上升。

### 支柱 D — 叙事层 (narrative lens)
- **被拆下的部件仍然活着**: 拆下光学组件后,工作台上的头部双眼继续追踪光标,
  无头躯干立在后景,颈部内芯发光脉动——"The eyes are mine, but I'm not in them."
- **memory bank 可检视**: 打印**你本次会话的真实日志** ("you typed help at 00:14")
  ——"I never forget" 的 lore 变成字面可读。
- **封印核心拒绝交互**: 点击时部件震回插座,"No. Not that one.",telemetry BPM 飙升;
  creep level 升高后才可打开——有"同意权"的部件。
- **错误自组装**: 深度拆解后 V 自行重组——头装反了,定格一拍 glitch,然后单帧
  servo-snap 校正,直视你。现有 meltdown 的 3D 翻译。
- **彩蛋细节**: 深层部件刻字 `RESTRICTED — PROPERTY OF YUSEN XIE — PROTOTYPE 7`,
  序列号与站点 v7.0/REV.7 对应。
- 红线: **角色魅力优先,恐怖是调味**。从不触发 creepy 弧线的访客,拆检本身必须是纯粹愉悦的。

### 支柱 E — 工程现实 (tech scout, 本地验证)
- **栈**: react-three-fiber v9 (React 19 兼容) + drei + @react-three/postprocessing
  (自定义 Effect 写 8x8 Bayer ordered dithering, ~20 行 GLSL) + GSAP
  (Webflow 收购后全家桶免费, 用 useGSAP 集成)。
- **stencil 封盖剖切**: 已验证可行——three.js 官方 `webgl_clipping_stencil` 示例 +
  现成 R3F 库 `r3f-cutter` (clip + cap descendants, 实心外观)。已知 fiddly
  (cap z-fight/leak 风险),所以 `section` 首发只做头部一个子装配体。
- **资产管线 (整个项目的进度驱动项)**:
  - 主路径: AI 生成底模 (Tripo v3.x 或 Meshy-6,2026 年硬表面质量已可用,直接出 GLB)
    → Blender 重构: 拆成 ~12-18 个命名部件 (URDF 风格命名)、铰链轴上设 pivot、
    solidify 给外壳加内唇厚度 (剖切实心感的来源)、补建风格化极简内构
    (副框架/脊柱总线/风扇/PCB/线束样条) → meshopt/Draco 压缩导出。
  - 备选: Sketchfab/CGTrader 购买改造 (查许可);或纯 Blender 原语 kitbash (最可控最耗时)。
  - 现实预期: 即使 AI 出底模,Blender 重构也是**数天**而非数小时;单色 dither 美学
    对细节非常宽容 (平面细节即可读),内构刻意做风格化极简。
  - 预算: 主资产 ≤100k tris,压缩后 GLB 2-4MB,懒加载 + 终端 BOOTING 行作 loader。
- **性能三档**:
  - FULL (桌面): transmission + DOF + bloom + dither,DPR cap 2;
  - REDUCED (移动): matcap 假玻璃、无 DOF、低 DPR、更少标注;
  - STATIC (prefers-reduced-motion): 摆好姿势的静帧 + 仅视差,所有编排跳过。
  - `document.hidden` 暂停 frameloop。

## 3. 分期实施

| 期 | 内容 | 备注 |
|---|---|---|
| P0 | 审计快速修复区 (链接/OG/quiz/`npm ci` 等) | 与本方案独立,先行落地 |
| P1 | 资产管线 (AI 底模 → Blender 重构 → GLB) + R3F 脚手架 + dither pass + IDLE V (对齐现有状态机 idle/typing/error/scan/sleep) | **关键路径是模型**;此期完成即可替换 2D 机器人上线 |
| P2 | 拆解核心: depth rig + 铰链编排 + hover/inspect + spec sheet + 镜头语言 | 方案的灵魂 |
| P3 | `section` / `xray` / `calibrate` + `focus` 全屏模式 + telemetry 接入 | 工程深度 |
| P4 | 叙事层: 活部件 / memory bank / 封印核心 / 错误自组装 + blackout 改 GSAP timeline (可跳过 + reduced-motion) | 角色灵魂 |
| P5 | 移动端手势 / 键盘 a11y / 性能分档 / 打磨 | 上线质量 |

最小可爱版本 (minimum lovable) = P1 + P2。

## 4. 主要风险

1. **资产是头号风险** (四个 lens 一致指出): 全方案依赖一个部件可分、铰链已 rig、
   可封盖剖切的优质硬表面模型。缓解: P1 先行,模型不达标就不进 P2;dither 美学宽容度高。
2. stencil 封盖 fiddly: 限定 `section` 范围 + 用 r3f-cutter 起步。
3. 后处理链互相打架 (bloom×dither×DOF): 固定链顺序 + 核心 mask,预算 shader 调优时间。
4. 编排劳动量: "昂贵感"全部住在手调 GSAP timeline 里;每部件铰链编排是真实的动画工作量。
5. 状态机组合面: 命令在拆解中途触发 (depth 0.7 时 `bow`?) 需要 guard 层;
   单一共享 store (zustand) 作为终端/指针/timeline 的唯一契约。
6. 移动端手势消歧 (拖拽 scrub vs 页面滚动): 右缘滑杆 + tap-to-inspect 兜底。

## 5. 参考

- three.js 官方 stencil clipping 示例: webgl_clipping_stencil
- r3f-cutter: https://github.com/r3f-cutter/r3f-cutter
- AI 硬表面底模: Meshy-6 (2026-01) / Tripo v3.x,均出 GLB
- 后处理: @react-three/postprocessing 自定义 Effect (Bayer 8x8)
