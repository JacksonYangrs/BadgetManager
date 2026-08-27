# Redesign 设计文档 · 方向 A 品牌校准（仅视觉令牌 + Logo）

- 日期：2026-08-26
- 发起人：松哥
- 来源审计：`reports/audit/report.html`
- 决策：选 A（品牌校准），范围=仅视觉令牌 + logo（不含 SEO/LLM 语义骨架）

## 1. 目标
将 Demo 的视觉系统从深蓝(#1E2A4A)+金色拉回到 Sanan / 三安制造 logo 的蓝色族，
并在顶栏、登录页置入真实 Sanan 图形标，强化品牌一致性。不改变信息架构、不新增页面、不动 JS 逻辑。

## 2. 设计令牌（替换值）

| Token | 原值 | 新值 | 说明 |
|---|---|---|---|
| `--c-primary` | `#1E2A4A` | `#003CB4` | logo 蓝，顶栏/主按钮/链接 |
| `--c-primary-deep` | `#141D36` | `#002A7E` | hover、强调底 |
| `--c-primary-light` | `#2B3C6E` | `#1E5FD0` | 浅蓝态 |
| `--c-accent` | `#C9A44A` | 保留 | 仅作成功/高亮状态色，不再做主按钮底 |
| `--c-info` | `#185FA5` | `#185FA5` | 保持 |
| `theme-color` (meta) | `#1E2A4A` | `#003CB4` | 浏览器/分享色 |

移动端 `website/mobile/styles/mobile.css` 内同名令牌同步替换。

## 3. Logo 嵌入方案
- 新建 `website/styles/brand.css`，内含：
  - `:root { --logo-sanan: url("data:image/png;base64,..."); }`
  - `.brand-mark` / `.login-logo` 用 `background: var(--logo-sanan) center/contain no-repeat;`
- 不在 JS/HTML 中重复 base64，避免膨胀与漂移。
- `index.html` 与 `mobile/index.html` 增加 `<link rel="stylesheet" href="styles/brand.css" />`（移动端为 `../styles/brand.css`）。

## 4. 改动文件清单
1. `website/styles/base.css` — 令牌（§2）
2. `website/styles/brand.css` — 新增，logo 资源 + 背景类
3. `website/index.html` — 移除顶栏 SVG、加 brand.css 引用、theme-color 改蓝
4. `website/views/login.js` — 登录页 logo 区改为 `.login-logo` 背景
5. `website/mobile/styles/mobile.css` — 令牌同步
6. `website/mobile/index.html` — 加 brand.css 引用、theme-color 改蓝、移除顶栏 SVG
7. `website/mobile/views/login.js` — 登录页 logo 区改为 `.login-logo` 背景

## 5. 验收标准（真机）
- 顶栏/登录页主色为 `#003CB4` 蓝。
- 顶栏左侧、登录页顶部显示 Sanan 图形标（非通用柱状图）。
- 金色仅出现在需要强调的状态（如激活态/成功），主 CTA 视觉不刺眼。
- 桌面 + 移动端均无破版、无文字截断。
- 用 Puppeteer 截图 `reports/audit/after-*.png` 对比。

## 6. 不在本次范围
- 语义化 h1/h2、静态价值主张、robots/sitemap/canonical/JSON-LD/llms.txt（留待下一轮）。
- B/C 方向（C 弧线母题、动效）暂不实现。
