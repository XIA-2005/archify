# Archify 可视化编辑器（扩展）

## draw.io 原生线条与框架操作

Architecture 画布使用本地固定版本 **draw.io Desktop 29.7.9** 的原始 `EditorUi`、`Graph` 和 mxGraph 编辑处理器。引擎来源为用户提供的桌面资源包，放在 `vendor/drawio/`，附 Apache-2.0 许可证及 `SOURCE.json` 文件校验值；不依赖 draw.io 网站或用户电脑上的安装目录。`drawio-adapter.mjs` 只负责转换数据和衔接 Archify 的属性、撤销及保存。

在画布上直接选中线条，使用 draw.io 原生端点、线段和折点控制柄、悬停连接箭头、右键菜单与内联文本编辑。节点及框架采用原生八方向缩放、对齐参考线、框选和多选；容器移动带动内部模块。Ctrl+Z / Ctrl+Y 与上方撤销/重做使用同一份 Archify 历史。原生编辑器自己的未保存提示由外层 Archify 接管，避免成功保存后再次出现未保存对话框。

框架手动几何保存在 `boundaries[].bounds: [x,y,width,height]`；未指定时继续按成员自动计算。右侧可恢复自动框架。端点保存在 `connections[].fromPort/toPort` 的归一化坐标，折点保存在原有 `via` 中；保存和重新打开保持这些数据。正式导出继续使用 Archify renderer 及完整校验，违规布局明确报错。

此集成的范围是 **architecture schema v1 中的模块、连接和分组框架**。仍要求连线关联真实模块；独立悬空线、任意 draw.io 图形/曲线/样式、任意多层分组以及其它图类型尚未具备完整 JSON 和正式导出的适配，不能宣称所有 draw.io 行为均已覆盖。不能把这些操作未经过验证的结果当作无损保存。浏览器回归在 `test/drawio-editor-browser.test.mjs`，数据及原始引擎校验在 `test/drawio-geometry.test.mjs`。

已检测到的未适配曲线、自定义箭头、原生文字/线条颜色和旋转模块会阻止 Archify JSON 导出与正式保存，明确提示恢复样式或从原生“文件”菜单导出 draw.io 源文件；不会把曲线静默保存成折线。

此目录提供独立于正式 SVG/HTML 渲染器的本地编辑入口。**正式绘图先由 AI 设计主路径、分组和排版；编辑器仅用于交付后的手工修订，不能以自动布局或编辑器预览替代视觉验收。** 正式渲染和四项检查流程保持不变。

## 双交付与不同图类型

Architecture：点击连线文字，在属性面板使用“连线文字颜色”的取色器或输入 `#RRGGBB`；点击“恢复默认”重新跟随主题。颜色保存在 `connections[].labelColor`，支持撤销/重做，保存及图片、GIF 导出均保留颜色，只更改文字颜色。

- **Architecture v1**：使用下述 `serve.mjs` 拖拽编辑器，支持节点、连线、独立字号、对齐和自动布局预览；几何和字体排版使用正式渲染流程。
- **Workflow / Sequence / Dataflow / Lifecycle**：使用新入口 `serve-schema.mjs`，支持结构字段、完整 JSON 编辑、官方 renderer 预览和保存前的 schema/Showcase 验证。目前**不支持拖拽重排这些类型的节点**；不能将这个页面称作完整的图形画布。
- 对任何类型，先以 `finalize` 输出独立 HTML；需视觉验收时用 `visual-check` 真实查看 1440×900 截图，通过后才可称作品精美。编辑器启动、连线预览和保存操作不得绕过该标准。

从项目根目录运行 Bash（替换目录和文件名）：

```bash
node "<skill-root>/editor/serve-schema.mjs" ".archify/<folder>/candidate.json"
```

该入口仅监听 `127.0.0.1` 并生成随机访问令牌，浏览器打开终端输出的完整 URL。关闭进程后地址失效；不要公开令牌。保存时会备份原 JSON、验证并使用正式 `finalize` 更新 HTML。如 JSON 已保存但最终发布失败，会返回明确错误，原有 HTML 不能视为更新成功。

## 标准交付入口（每次生成必须运行）

在图表项目根目录运行，`<skill-root>` 为本次加载的 Skill 目录：

```text
node <skill-root>/editor/deliver.mjs architecture <candidate.json> <diagram.html> --quality showcase --json
```

该入口依次完成正式 finalize、真实截图、匹配编辑器启动及 HTTP/源文件哈希核对。Windows 使用隐藏后台进程；不要求 Bash。返回实际 URL、进程 PID、校验回执和截图路径。必须实际查看截图，才能报告视觉验收通过。编辑器仅在该进程运行时可访问；关闭 Node 服务后地址失效。

引用库与项目目录不同时，增加 `--repo-root <证据库>`；此参数同样传入编辑预览、图像导出、保存校验与 finalize。不要创建虚假 Git 远程来绕过源码证据检查；无提交项目用本地源码说明。

顶部“导出图像”会用正式渲染器生成当前草稿，在新窗口打开原版 PNG/JPEG/WebP/SVG 导出菜单；无须先覆盖 JSON。草稿图像不代表已通过 finalize 或视觉验收，保存仍走完整验证。浏览器阻止弹窗时会明确提示。

## 启动

在存放 Archify 图的项目根目录打开 Bash：

    node "<skill-root>/editor/serve.mjs" ".archify/<folder>/candidate.json"

「导出图像」窗口还提供 GIF 动图（默认 6 秒、12 fps、循环播放），适合插入桌面 PowerPoint 后在幻灯片放映中播放。静态图也可直接导出连线追踪 GIF，无需修改 JSON 的动画设置；透明背景选项同时适用于 GIF。GIF 使用最多 256 色和二值透明，WebM 保留现有较丰富的色彩和透明度导出。

导出窗口的「导出放大倍数」提供默认 / 1× / 3× / 5× / 7× / 10×。图片、GIF、WebM 和 PNG 剪贴板均按目标分辨率重新渲染；默认保留原有图片 4×、动图适配 1280px 的行为。显式倍率相对于图表内容像素，图片还包含按倍率缩放的标题和边距；超出尺寸上限会提示降低倍率。SVG 保持矢量。

SVG（自动 / 浅色 / 深色）也遵循「透明背景」选项：勾选后不导出画布背景和网格，节点填充、文字、连线及矢量清晰度保留；自动主题切换后背景仍透明。

随后在浏览器打开终端输出的本机 URL；按 Ctrl+C 关闭服务。

此处的 `serve.mjs` 只适用于 Archify architecture schema v1；其他四类图使用上面的独立编辑服务。

## 编辑器主题

字号输入框显示实际默认值（连线默认 8px），向上箭头按 0.5px 递增；清空输入移除该段文字的显式覆盖；“一键设置”将当前字号应用到所有同类型文字。模块名称、说明、标签和连线/分组文字的修改（含删除、重新添加）、字号/文字颜色修改仅更新现有原生单元格，不重建连线路由或重新计算自动标签位置，撤销/重做保留原始位置。draw.io 的 `mxgraph/css/common.css` 随包加载，双击模块在当前模块处内联编辑，不改变画布根、缩放或滚动位置。

顶部「浅色模式 / 深色模式」切换整个可视化编辑器，包括画布、节点、连线、属性面板和小地图；选择在本浏览器中记忆。主题切换不修改 JSON、撤销记录、节点位置或正式导出的主题。

## 功能

- **独立字号**：右侧按每段文字设置 6–72px 字号，步长 0.5，留空恢复该段文字的默认排版，点击「一键设置」统一当前类型的所有字号。覆盖图表标题/副标题、模块名称/说明/标签、分组、连接线、图例和卡片每条正文。显式字号不会自动缩小，空间不足需要扩宽模块或调小字号。保存使用 `font_sizes`（图例项为 `font_size`）；旧 `meta.font_scale` 载入时迁移为独立字号，保存后移除。
- **同类型批量字号**：属性检查器顶部展开「按文字类型设置字号」，可批量设置模块名称/说明/标签、连线文字、分组标题、图例文字、卡片标题及正文。一次操作更新当前图表内该类型的所有非空文字，覆盖它们原有的独立字号；其他类型不变。统一设置后仍可逐段修改；混合字号会明确显示。支持该类型恢复默认及单步撤销/重做，不设置全图比例，也不改变以后新增文字的默认字号。
- **全图线宽及箭头**：线宽 0.75–4 倍，箭头额外倍率 0.5–4 倍，常用步长 0.25，支持数值输入、滑杆即时预览和撤销/重做。箭头实际倍率为 `meta.line_scale × meta.arrow_scale`，默认额外倍率为 1；面板显示标准连线宽度和箭头尺寸（图表内容坐标 px）。选中高亮不会额外放大箭头。自动标签避让所有箭头的实际占位，固定标签发生碰撞时明确报错，需拖动标签修复。分别恢复默认不会重置另一项。

- 节点拖动、选中后的标签/说明/类型/尺寸/位置编辑
- 直接点击连线上的文字即可选中对应连线，展开属性检查器并聚焦「连线文字」；在旁边的「连线文字字号」单独调整大小（6–72px，步长 0.5）。文字底色保持透明，空白标签区域也可点击；键盘聚焦标签后按 Enter 或空格同样可编辑。修改支持撤销/重做，保存和导出使用修改后的 `label` / `font_sizes.label`。没有标签时可点击连线添加文字。
- 连线选中后修改起点、终点；拖动 draw.io 原生悬停箭头添加连线
- 新建/删除模块、连线、说明卡片；撤销/重做、画布平移与缩放
- 导出草稿 JSON；保存前完整 Showcase 验证，校验不通过时原文件不被覆盖
- 保存正式 candidate.json 前自动备份；随后使用原版 Archify finalize 生成 HTML 与四项检查
- 原有 HTML 浏览器查看、导出、验证逻辑保持不变

安全边界：仅绑定 127.0.0.1、随机访问密钥；保存需要同源 POST；
不可通过网页改变输入文件、输出路径或仓库标识。不要向其他人发送完整的编辑 URL。
不适用于公网部署或多人协同。

初始连线路径及标签位置由原版 Archify 的 render architecture 提供；
实际拖动时由原生 draw.io 画布计算并显示草稿几何，适配器保存精确端点及正交折点。
修改后仍请求正式渲染器校验；若布局无法渲染，明确显示错误。
原生草稿画布不能作为正式 HTML 已通过校验或视觉验收的证据。
性能管线采用异步官方 CLI 子进程、会话内 32 项 LRU 缓存、
相同候选请求合并、最多两个并发渲染及浏览器过期请求取消。
缓存仅保存完整的官方 SVG 路由结果；保存仍使用原版 validate/finalize。
模块卡片本身仍采用编辑器的选中/拖动视觉样式，完整定稿风格由正式 HTML 提供。
节点重叠、线条交叉、标签溢出等可能导致 Showcase 校验失败，
此时请调整布局再保存，或导出 JSON 草稿。
如果 JSON 已通过验证而后续 HTML 交付失败，会明确提示并保留备份，不能把旧 HTML 当成更新版本。

## 回归测试

    node "<skill-root>/editor/test-editor.mjs" "<现有 candidate.json 的绝对路径>"

    node "<skill-root>/editor/test-route-pipeline.mjs"

    node "<skill-root>/editor/benchmark-routes.mjs" "<现有 architecture candidate.json>" 12

基准工具在临时目录启动本地编辑器，记录首次、重复、不同候选的 HTTP
预览 p50/p95、同一候选并发请求的总耗时，以及渲染时 /api/spec 的响应时间。
它不会修改原始候选。基准数字依赖机器与图规模，比较前后版本时须使用相同输入。

## v0.2 manual layout extension（旧 SVG 画布实现记录）

以下自定义 SVG 交互及浏览器测试描述历史实现；当前画布交互以本文开头的 draw.io 原生操作及新浏览器回归为准。

- Ctrl + click for multi-node selection, six alignments, horizontal/vertical distribution and 24px grid snapping.
- Nodes can move beyond the left/top canvas edge. Completing a drag translates the whole scene, waypoints, pinned labels, layout origin and camera into valid nonnegative coordinates in one undoable operation. Automatically sized diagrams remain automatic; explicit viewBox dimensions expand as needed.
- Edge inspector exposes `fromSide`, `toSide`, `route`, `via`, and `labelAt`; orange waypoint handles are draggable.
- On a temporary invalid layout, the last known official edge paths remain visible as dimmed dashed references instead of disappearing. They are NOT presented as a verified final route.
- Quality presets can be selected per diagram; saving still requires successful original Archify validation/finalization.
- UI test: `node editor/test-interaction.mjs <candidate.json>` from repo cwd.
- Font/drag/WebM browser regression: `node editor/test-font-drag.mjs <candidate.json> <evidence-directory>`. Uses a temporary copy and closes its test server/browser on completion.
- Geometry/schema/default-output regression: `node editor/test-text-geometry.mjs <candidate.json> [unchanged-installation-directory]`. The optional baseline is read-only.
- Delivered artifact WebM recording/decoding and mobile check: `node editor/test-export.mjs <diagram.html> <output.webm>`.

## 里程碑三 · 第一步：自动布局 MVP

- 仅适用于 Architecture v1。按连接拓扑分层，支持「左→右 / 上→下」、层间距与同层节点间距；循环连接与互不相连的子图也会安排位置。不同的最外层边界组会尽量分开排布。
- 点击「预览自动布局」先看蓝色虚线节点框。此时真实节点、连线、候选 JSON 均不变；「取消预览」直接恢复视图。
- 点击「应用布局」才一次性更新节点 `pos`，必要时扩展 `meta.viewBox`，并生成一个可撤销/重做的历史步骤。
- 原有连接的 `fromSide`、`toSide`、`route`、`via`、`labelAt` 完整保留；已有手动折点和标签不会随节点自动迁移，应用后请检查它们的位置。
- 预览阶段仍显示旧布局的官方连线（不是新布局路由预览）。应用后使用原版 Archify CLI 重新计算并校验 SVG 路径；若布局不合规，保存前的校验会阻止覆盖。
- 不保证无连线交叉、标签碰撞或边界组的最佳包围效果；复杂图可继续手动编辑。MVP 不引入第三方布局引擎。
- 单元测试：`node editor/test-auto-layout.mjs`；浏览器回归：`node editor/test-interaction.mjs <candidate.json>`。

## 里程碑三 · 第二步：大图模式

- 当 Architecture 图包含 **100 个或更多模块**时，编辑器自动启用大图模式；也可通过「大图模式：开/关」手动切换。
- **搜索定位**：按 ID、名称或说明搜索模块，按 Enter 或「定位 / 下一项」逐个定位并高亮。只移动相机和选择状态，不修改 JSON。
- **小地图**：右下角显示全图模块位置和当前视口框；点击、拖动可平移，聚焦小地图后方向键也可平移。
- **适应画布**：现有按钮显示所有模块；定位后可快速返回全图。缩放范围根据图幅自动扩大，不再固定限制为 6500 世界单位。
- **视口裁剪 + LOD**：只绘制视口附近模块、已获得的官方连线和边界；缩小后先隐藏副标题和连线标签，极远视图只保留模块矩形及正式路径。大图平移/缩放按动画帧合并重绘，纯视口操作不重新请求官方路线。
- 小地图仅绘制模块概览，不会模拟或替换正式连线。原有 Archify 官方路由缓存、过期请求取消、校验、备份和 `finalize` 流程保持不变。
- 大图优化主要降低浏览器 SVG DOM 负担；**不保证** Archify CLI 能验证任意 1000 节点架构，也不改变官方全图路由计算成本。无第三方依赖。
- 单元测试：`node editor/test-large-graph.mjs`；1000 节点浏览器导航测试：`node editor/test-large-browser.mjs`。合成大图测试仅验证编辑器交互，不作为正式图质量通过的证明。

## 画布优先布局

编辑区跟随窗口占满可用高度；常用工具保留在顶部，布局、对齐、全图样式和大图导航收进折叠面板，操作帮助按需展开。属性检查器宽度为 240–280px，可通过“收起属性”让出宽度；“专注画布”隐藏属性、辅助工具和底部状态，退出后恢复面板状态。窄屏默认关闭属性面板，点击“显示属性”以浮层打开。

“适应画布”按实际视口比例居中显示节点、分组、正式连线和图例，取消固定最小画布尺寸；窗口和面板尺寸变化时，适配模式重新居中，手动缩放或平移后则保留视图中心和缩放比例。以上是编辑器视图设置，不改动 JSON 坐标、字号或正式 HTML。

画布尺寸与适配回归：`node editor/test-viewport.mjs <candidate.json> <evidence-directory>`，检查四种窗口尺寸、节点/分组/图例完整显示、专注模式、属性切换、折叠工具与正式路径不变。


## 分组标题移动

拖动分组标题文字可单独调整位置，不移动模块或分组框。选中标题后可在属性面板设置水平/垂直偏移，或恢复默认位置；支持单步撤销/重做。保存到 boundaries[].labelOffset（相对自动标题位置的 [dx,dy]）。正式 HTML 与图像导出使用同一位置，Showcase 仍检查标题越界、节点/标题/连线文字重叠。未设置偏移的旧图保持原有排版。

批量字号的文字类型下拉列表支持悬停或键盘焦点预览：对应模块、连线、分组、图例或说明卡片高亮；离开列表、关闭或切换属性时清除。预览不修改 JSON、当前选择、字号或撤销记录。

各字号输入框旁的「一键设置」将当前输入值应用到所有同类型文字，例如所有连线文字、模块名称、模块说明或卡片正文。其他文字类型保持不变；一次撤销恢复整批修改。图表标题、副标题和图例标题只有一个目标，按钮设置对应目标的字号。

「标题、图例与输出设置」默认折叠，包含图表标题与字号、副标题与字号、图例标题字号、输出质量。需要时展开，修改属性期间保留展开状态。输出质量是校验标准，不是导出分辨率；标题、图例标题与批量模块文字字号独立。



## 输入兼容与恢复

省略 `connections` 等同于无连线。节点省略 `size` 时使用正式渲染器的 120 × 60 默认尺寸；显式尺寸保持优先。`layout.mode: "grid"` 可用 `row/col` 代替 `pos`，两者同时存在时 `pos` 优先；打开文件不会把网格坐标改写为像素坐标，移动后才写入 `pos`。

Schema 编辑器单独保留未应用 JSON 文本，包括无效 JSON。切换页签和失败的应用操作不会覆盖草稿；必须先应用或明确丢弃，才可修改表单、预览、保存或重新加载。导出草稿保留当前原文，格式化不会自动应用。未应用草稿离页时会提醒。

两个编辑服务的候选文件读取接口对缺失文件返回 404、损坏 JSON 返回 422，其他读取错误返回 500，响应为 `{ok:false,message}`；服务继续运行。修复文件后点击重新加载即可重试，失败读取保留当前内存内容。
