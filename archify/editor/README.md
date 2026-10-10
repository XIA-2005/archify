# Archify 可视化编辑器（扩展）

此目录提供独立于正式 SVG/HTML 渲染器的本地编辑入口。**正式绘图先由 AI 设计主路径、分组和排版；编辑器仅用于交付后的手工修订，不能以自动布局或编辑器预览替代视觉验收。** 正式渲染和四项检查流程保持不变。

## 双交付与不同图类型

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

随后在浏览器打开终端输出的本机 URL；按 Ctrl+C 关闭服务。

此处的 `serve.mjs` 只适用于 Archify architecture schema v1；其他四类图使用上面的独立编辑服务。

## 功能

- **独立字号**：右侧按每段文字设置 6–72px 字号，步长 0.5，留空或点击「默认」恢复默认排版。覆盖图表标题/副标题、模块名称/说明/标签、分组、连接线、图例和卡片每条正文。显式字号不会自动缩小，空间不足需要扩宽模块或调小字号。保存使用 `font_sizes`（图例项为 `font_size`）；旧 `meta.font_scale` 载入时迁移为独立字号，保存后移除。
- **同类型批量字号**：属性检查器顶部展开「按文字类型设置字号」，可批量设置模块名称/说明/标签、连线文字、分组标题、图例文字、卡片标题及正文。一次操作更新当前图表内该类型的所有非空文字，覆盖它们原有的独立字号；其他类型不变。统一设置后仍可逐段修改；混合字号会明确显示。支持该类型恢复默认及单步撤销/重做，不设置全图比例，也不改变以后新增文字的默认字号。
- **全图线宽及箭头**：线宽 0.75–4 倍，箭头额外倍率 0.5–4 倍，常用步长 0.25，支持数值输入、滑杆即时预览和撤销/重做。箭头实际倍率为 `meta.line_scale × meta.arrow_scale`，默认额外倍率为 1；面板显示标准连线宽度和箭头尺寸（图表内容坐标 px）。选中高亮不会额外放大箭头。自动标签避让所有箭头的实际占位，固定标签发生碰撞时明确报错，需拖动标签修复。分别恢复默认不会重置另一项。

- 节点拖动、选中后的标签/说明/类型/尺寸/位置编辑
- 连线选中后修改文字、起点、终点；两次点击节点添加连线
- 新建/删除模块、连线、说明卡片；撤销/重做、画布平移与缩放
- 导出草稿 JSON；保存前完整 Showcase 验证，校验不通过时原文件不被覆盖
- 保存正式 candidate.json 前自动备份；随后使用原版 Archify finalize 生成 HTML 与四项检查
- 原有 HTML 浏览器查看、导出、验证逻辑保持不变

安全边界：仅绑定 127.0.0.1、随机访问密钥；保存需要同源 POST；
不可通过网页改变输入文件、输出路径或仓库标识。不要向其他人发送完整的编辑 URL。
不适用于公网部署或多人协同。

连线预览严格使用原版 Archify 的 render architecture 计算 SVG 路径
（含正交转弯、圆角、箭头端点）及标签坐标；编辑器不会自行生成连线或使用近似直线。
拖动节点后自动调用正式渲染器更新；过时的连线仅作为半透明虚线参考，
若候选布局无法渲染，则明确显示错误，绝不将参考线路当作已验证的结果。
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

## v0.2 manual layout extension

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
