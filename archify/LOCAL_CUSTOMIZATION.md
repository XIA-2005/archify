# 本地 Archify 定制恢复记录（2026-10-10）

## 原因

Codex 加载 `C:/Users/m2694/.codex/skills/archify`。检查时，该目录的 SKILL、默认设计指南、架构渲染器和模板与上游 main 的 `54edef453ca3fc495f488c30de97eaea0c789f19` 相同。

原定制版仍在 `D:/ShunCode-Skills/6d32363934/archify`，包含强制双交付、视觉验收、拖拽、文字/连线修改、历史记录和字号控制。先前工作明确要求不同步到 Codex 安装目录。这是不同副本未同步；没有证据证明原版渲染器被破坏，也不能证明所有模型生成的不同 JSON 本来都具有相同美观性。

## 恢复范围

- 每次生成必须交付独立 HTML、匹配的“Archify · 可视化编辑器”和可编辑 JSON。
- `editor/deliver.mjs` 统一 finalize、真实截图、编辑器启动和源文件哈希验证；视觉评审仍须查看图片。
- 恢复架构节点拖拽、文字/连线编辑、撤销/重做；新增当前未保存草稿的 PNG/JPEG/WebP/SVG 导出入口。
- 编辑预览、图像导出和保存使用相同 `--repo-root`。
- 保持上游默认布局、配色、路由及默认标签几何。新增字号/线宽/箭头控制只在显式设置时启用扩展几何与箭头避让；保留箭头顶点裁切修复。
- 每个 Architecture 都须实际查看亮/暗截图，不能用自动回执代替美观验收。相同 JSON 的渲染确定；不同模型仍可能产生不同结构和坐标，靠统一设计与验收约束质量。

## 更新与恢复

`customization-manifest.json` 列出定制文件和 SHA-256。更新上游时先备份并比较这些文件，不得仅复制上游 SKILL 而遗漏编辑器或强制规则。未经用户授权不得更新任何 live 安装。

原始安装、被替换的源文件和检查证据保存在仓库 `.archify/repair-20261010/`。本次恢复包独立于官方 `archify.zip`，官方发布包未被冒充为本地定制版。

编辑器绑定 localhost，地址只在后台 Node 进程存活时可用。非 Architecture 模式保留表单/JSON 编辑器，目前没有图形拖拽画布。

## 2026-10-12：draw.io 交互集成

按用户要求，从 `D:/draw.io/resources/app.asar` 提取 draw.io 29.7.9 原生浏览器编辑引擎，用于 Architecture 线条、模块和框架编辑；代码字节、版本与许可证记录在 `editor/vendor/drawio/SOURCE.json`。编辑操作衔接原有 JSON、历史、属性及完整保存校验。框架 `bounds` 与端点 `fromPort/toPort` 是兼容新增字段。

本次 `archify.zip` 是从本地定制源码快照生成的恢复包，不是新的官方发布；版本、标签和远程发布未改变。使用官方 Node 22.23.2 / zlib 1.3.1-e00f703、隔离源码索引和现有干净打包脚本；保留原包可执行文件模式，未修改此下载目录的 Git 元数据。运行文件仅同步到 Codex 全局 `archify` Skill，覆盖前保存备份；其它 Skill 与已有独立 HTML 不受此次同步更新。当前原生交互和未支持的 JSON 表达范围见 `editor/README.md`。
