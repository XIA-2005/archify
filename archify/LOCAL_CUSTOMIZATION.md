# 本地 Archify 定制恢复记录（2026-10-10）

## 原因

Codex 加载目标环境中的 `<installed-skill>/archify`。检查时，该目录的 SKILL、默认设计指南、架构渲染器和模板与上游 main 的 `54edef453ca3fc495f488c30de97eaea0c789f19` 相同。

此前保存的定制版包含强制双交付、视觉验收、拖拽、文字/连线修改、历史记录和字号控制。不同副本未同步不构成原版渲染器损坏的证据，也不能证明不同模型生成的 JSON 本来就应有相同的视觉效果。

## 恢复范围

- 每次生成必须交付独立 HTML、匹配的“Archify · 可视化编辑器”和可编辑 JSON。
- `editor/deliver.mjs` 统一 finalize、真实截图、编辑器启动和源文件哈希验证；视觉评审仍须查看图片。
- 恢复架构节点拖拽、文字/连线编辑、撤销/重做；新增当前未保存草稿的 PNG/JPEG/WebP/SVG 导出入口。
- 编辑预览、图像导出和保存使用相同 `--repo-root`。
- 保持上游默认布局、配色、路由及默认标签几何。新增字号/线宽/箭头控制只在显式设置时启用扩展几何与箭头避让；保留箭头顶点裁切修复。
- 每个 Architecture 都须实际查看亮/暗截图，不能用自动回执代替美观验收。相同 JSON 的渲染确定；不同模型仍可能产生不同结构和坐标，靠统一设计与验收约束质量。

## 更新与恢复

`customization-manifest.json` 列出定制文件和 SHA-256。更新上游时先备份并比较这些文件，不得仅复制上游 SKILL 而遗漏编辑器或强制规则。未经用户授权不得更新任何 live 安装。

安装备份和私有检查证据不属于发布的 Skill 文件。

编辑器绑定 localhost，地址只在后台 Node 进程存活时可用。非 Architecture 模式保留表单/JSON 编辑器，目前没有图形拖拽画布。

## 2026-10-12：draw.io 交互集成

集成 draw.io Desktop 29.7.9 原生浏览器编辑引擎，用于 Architecture 线条、模块和框架编辑；版本、Apache 2.0 许可证及资源哈希记录在 `editor/vendor/drawio/SOURCE.json`。编辑操作衔接原有 JSON、历史、属性及完整保存校验。框架 `bounds` 与端点 `fromPort/toPort` 是兼容新增字段。

源码仓库不再跟踪 `archify.zip`，需要时临时构建或从 GitHub Release 获取；本次没有发布新版本、标签或 Release，也没有更新任何 live 安装。当前原生交互和未支持的 JSON 表达范围见 `editor/README.md`。
