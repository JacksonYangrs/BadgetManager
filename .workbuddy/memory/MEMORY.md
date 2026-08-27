# 项目长期记忆 · BadgetManager（三安光电 AI 费用预决算管理系统）

## 项目性质与边界
- 本项目是**内部产品 Demo / 应用软件**，不是对外网站。松哥明确：不需要做 SEO / LLM 可见性（2026-08-26）。
- 因此审计、设计建议中，**不把** robots.txt / sitemap / canonical / JSON-LD / llms.txt / 语义 h1-h3 等"公开网站健康度"指标作为必做项或高优先级；除非将来要做对外获客/展示页。
- 站点当前以 `localhost:8300` 由 Express 托管 `website/` 静态前端 + SQLite 后端，登录墙后是主界面。

## 已落地的视觉规范（redesign 方向 A）
- 主色已迁移到 Sanan logo 蓝 `#003CB4` 族（--c-primary / --c-primary-deep / --c-primary-light）。
- Sanan logo 以 data URI 存于 `website/styles/brand.css`，`.brand-mark`/`.login-logo` 用背景图呈现；金色仅作状态强调色。
- 设计文档：`docs/plans/redesign-sanan-brand.md`。

## 已统一的激活态/按钮配色规则（2026-08-26）
- 页面内所有 Tab 组激活态统一为 logo 蓝 `--c-primary`（不再混用金色）。
- 按钮主操作（`.btn-primary` / `.btn-accent`）统一为 logo 蓝；金色 `--c-accent` 仅用于：① 顶部全局导航当前位置指示条（深蓝栏点睛）；② 状态徽标/关键数值/成功高亮。
- 角色切换激活态（`.role-btn.active`）、范围卡片选中态（`.scope-card.active`）统一为蓝。
- 设计文档：`docs/plans/redesign-motion.md` 第 5 节。

## 文件选择按钮统一美化（2026-08-26）
- 原生 `<input type="file">` 隐藏，外层用 `.btn-primary` 标签按钮触发（`.file-picker` 组件），右侧回显已选文件名；复用 `.btn-primary` 自然统一为 logo 蓝。
- 改动：`website/styles/components.css` + `website/views/rules.js`（创建明年新规则→导入政策文件）+ `website/views/import-view.js`（费控 Excel 导入）。
- 设计文档：`docs/plans/redesign-motion.md` 第 6 节；截图：`reports/audit/filebtn-*.png`。
