# Redesign 设计文档 · 配色刻度 + 控件微动效

- 日期：2026-08-26
- 发起人：松哥
- 承接：`redesign-sanan-brand.md`（方向 A 已落地）
- 范围：在 logo 蓝主色基础上，理顺配色刻度（tint/hover/disabled），为控件元素补充克制的微动效。不含 B/C 方向的大改版、不含 SEO/LLM。

## 1. 配色刻度（新增/调整）
沿用 logo 蓝 `#003CB4` 为唯一品牌主色，补齐语义刻度：

| Token | 值 | 用途 |
|---|---|---|
| `--c-primary` | `#003CB4` | 主色（已定） |
| `--c-primary-dark` | `#002A7E` | hover/强调底 |
| `--c-primary` 浅 tint | `#E8F0FE` | 选中态背景、浅蓝块 |
| `--c-primary-soft` | `#1E5FD0` | 次级 hover |
| `--c-accent` | `#C9A44A` | 仅成功/高亮状态 |
| `--c-disabled` | `#C2C8D4` | 禁用文字/边框 |
| `--c-disabled-bg` | `#EEF0F4` | 禁用底 |

过渡令牌：
- `--t-fast: 0.12s ease`
- `--t-base: 0.2s ease`
- `--t-slow: 0.32s cubic-bezier(.2,.7,.3,1)`

## 2. 控件微动效清单
统一在 `website/styles/motion.css` 实现，全部 `transform/opacity` 驱动（GPU 友好），并对 `prefers-reduced-motion` 关闭。

| 控件 | 动效 |
|---|---|
| `.btn` | hover：轻微上移 1px + 阴影加深；active：scale(.97)；disabled：无动效、降透明度 |
| `.qn-btn`（顶部导航） | active 切换增加背景淡入 + 底部 2px 指示条滑入 |
| `.ai-card` / `.method-chip` / `.risk-card-view` | hover：translateY(-2px) + 阴影；过渡 `--t-base` |
| `input/textarea/select` | focus：box-shadow 环淡入（`--t-fast`） |
| `.toast` | 右侧滑入 + 淡入，离场淡出 |
| `.modal`（#modalRoot 内） | 遮罩淡入 + 卡片 scale(.96→1) |
| `.login-card` | 进场 fade + 轻微 scale(.98→1)（0.4s） |
| `.msg`（Copilot 消息） | 逐条 fade-up 入场 |

## 3. 改动文件
1. `website/styles/base.css` — 补 tint/disabled/过渡令牌
2. `website/styles/mobile.css` — 同步令牌
3. `website/styles/motion.css` — **新建**，动效规则
4. `website/index.html` — 接入 motion.css
5. `website/mobile/index.html` — 接入 motion.css

## 4. 验收
- 桌面/移动：按钮 hover 有上移+阴影，点击有按压感；卡片 hover 轻微浮起。
- 登录卡有柔和进场；消息/Toast 有淡入。
- `prefers-reduced-motion: reduce` 下所有动效关闭，仅保留颜色/布局。
- 无破版、无文字截断；主色仍为 `#003CB4`。
- Puppeteer 截图 `reports/audit/assets/after-motion-*.png` 对比。

## 5. 配色统一规则（2026-08-26 补充）
针对“tab 组切换色不统一、按钮颜色不统一”的视觉缺陷，追加统一规则：

| 元素 | 主色/激活色 | 金色 `--c-accent` 是否可用 |
|---|---|---|
| 页面内 Tab 激活态（`.mt-btn.active`、`.rtab-btn.active`、`.dash-tab.active`、`.bd-tab.active`、`.nav-tab.active`、`.view-tab.active`、`.tab-btn.active`） | `--c-primary` 蓝 | 否 |
| 按钮主操作（`.btn-primary` / `.btn-accent`） | `--c-primary` 蓝 | 否；`.btn-accent` 已重定义为 logo 蓝 |
| 角色切换激活态（`.role-btn.active`） | `--c-primary` 蓝 | 否 |
| 范围卡片选中态（`.scope-card.active`） | `--c-primary` 蓝 | 否 |
| 顶部全局导航当前位置指示条（`.qn-btn.active::after`） | `--c-accent` 金 | 是；作为深蓝顶栏上的点睛点缀 |
| 状态徽标/关键数值/成功高亮 | `--c-accent` 金 | 是 |

### 5.1 改动文件（本次补充）
1. `website/styles/base.css` — `.btn-accent` 金→蓝；`.role-btn.active` 金→蓝。
2. `website/styles/components.css` — `.rtab-btn.active` 金→蓝；`.scope-card.active` 边框/阴影去金。
3. `website/styles/v02.css` — `.mt-btn.active` 金→蓝。
4. `website/styles/v04.css` — `.dash-tab.active` 下划线金→蓝。
5. `website/mobile/styles/mobile.css` — `.btn-accent` 金渐变→蓝；`.tab-btn.active .tab-ico`、`.nav-tab.active` 金→蓝。

### 5.2 验证
- 6 个主导航 view 全量扫描 `.btn`/`.btn-accent`/`.btn-primary`：`backgroundColor = rgb(201, 164, 74)`（金）残留数 = **0**。
- 基础数据页 `.bd-tab.active` 计算色：`rgb(0, 60, 180)` = `#003CB4` 蓝。
- 真机截图：`reports/audit/assets/unify-bdTab.png`、`unify-desktop-login.png`。

## 6. 文件选择按钮美化（2026-08-26 补充）
针对用户反馈"几个文件选择按钮很丑"：系统里裸用原生 `<input type="file">` 的有两处，样式参差不齐。统一为自定义文件选择组件：

- **实现方式**：原生 input 隐藏（`clip` 而非 `display:none`，保留无障碍/表单可访问性），外层用 `<label class="btn btn-primary file-pick-label">选择文件</label>` 触发；选中后右侧显示文件名（多文件以 `·` 分隔）。
- **样式归位**：`.file-pick-label` 复用 `.btn-primary`，所以按钮颜色自动跟随 logo 蓝统一规则，不再有多余原生控件破坏视觉。

### 6.1 改动文件
1. `website/styles/components.css` — 新增 `.file-picker` / `.file-pick-label` / `.file-picker-name` 组件样式。
2. `website/views/rules.js` — 预算规则"创建明年新规则"tab 的文件上传改为 `.file-picker` 组件，保留 `multiple` 与 `accept` 能力。
3. `website/views/import-view.js` — 费控 Excel 导入的文件上传改为 `.file-picker` 组件，保留 `accept` 与 change 解析逻辑。

### 6.2 验证
- Puppeteer 真机登录后分别进入 `rules` 视图的"创建明年新规则"tab 和 `importView` 视图。
- `.file-pick-label` 计算样式：`backgroundColor = rgb(0, 60, 180)`（#003CB4 蓝），`color = rgb(255, 255, 255)`。
- 原生 input 计算样式：`width = 1px`，`position = absolute`，`clip = rect(0,0,0,0)`（已隐藏）。
- 上传临时文件后，`.file-picker-name` 正确回显文件名，且 `empty` 类移除。
- 真机截图：`reports/audit/filebtn-rules.png`、`reports/audit/filebtn-import.png`。

## 7. 预算规则「适用经济事项」布局重排（2026-08-26 补充）
按松哥截图要求，将 Tab3「适用经济事项」从"左侧规则卡 + 右侧科目勾选"改为"上中下"三段式布局：

1. **顶部规则卡横向滚动条**：`.evt-cards` 改为 `flex-direction: row; overflow-x: auto`，卡片固定宽度、可左右滑动，滚动条显式着色（webkit + scrollbar-color）。
2. **中间注释文本框**：新增 `.evt-comment-row` 单行框，标签「规则说明 / 注释」放在框内左侧，与输入共占一行；点击不同规则卡时，整行以 fade + 轻微下移/回位动效切换（`.changing` 类，180ms）。注释按规则卡本地缓存，可编辑补充。框高 40px（原 80px 减半）。
3. **底部经济事项勾选**：`.evt-list` 下移，继续以网格展示科目/经济事项多选。

### 7.1 改动文件
1. `website/styles/components.css` — 重定义 `.evt-map` 为垂直 flex；`.evt-cards` 横排滚动；新增 `.evt-comment` / `.evt-comment-label` / `.evt-comment.changing` 动效。
2. `website/views/rules.js` — `renderEventsTab` 改为三段式 DOM；`highlightScope` 移除旧的 `.evt-cur-info` 逻辑；新增 `setCommentValue` / `animateCommentSwitch`。

### 7.2 验证
- Puppeteer 登录后进入 `rules` → "适用经济事项"tab。
- 规则卡横向排列，超出可视区；计算样式 `overflowX = auto`。
- 点击第二张规则卡，注释框从第一张内容切换为第二张规则说明（带 `.changing` 动效类）。
- 经济事项勾选网格正常显示在注释框下方。
- 真机截图：`reports/audit/rules-events-layout.png`、`reports/audit/rules-events-card2.png`。

## 8. 预算编制表列序与按钮样式调整（2026-08-26 补充）
按松哥截图要求，调整预算编制（`compile` 视图）经济事项视角填报表：

1. **列序调整**：「月度拆分」从第 4 列移至最后一列（第 8 列），表头顺序变为：经济事项 → 会计科目 → 本年度预算值 → 上年预算 → 上年决算 → 偏差 → AI 建议 → 月度拆分。
2. **月度拆分按钮更醒目**：按钮类从 `.btn-outline.btn-sm` 改为 `.btn-primary.btn-sm`（蓝色填充、白字），在末尾列更突出。
3. **采纳中值按钮改蓝框**：按钮类从 `.btn-primary.btn-sm` 改为 `.btn-outline-primary.btn-sm`（透明底 + 蓝色边框 + 蓝色文字），与「月度拆分」形成主次区分；保留 `align-items: center` 垂直对齐。
4. **新增按钮样式**：`base.css` 新增 `.btn-outline-primary` 复用 `--c-primary` 蓝，hover 加浅蓝底。

### 8.1 改动文件
1. `website/styles/base.css` — 新增 `.btn-outline-primary`。
2. `website/views/compile.js` — 调整表头列序；移动 `monthTd` append 到 `aiTd` 之后；改月度拆分按钮为 `.btn-primary`；改采纳中值按钮为 `.btn-outline-primary`。

### 8.2 验证
- Puppeteer 登录后进入 `compile` 视图。
- 表头顺序正确，月度拆分在最后一列。
- 月度拆分按钮计算样式：`backgroundColor = rgb(0, 60, 180)`，文字白色。
- 采纳中值按钮计算样式：`backgroundColor = rgba(0, 0, 0, 0)`（透明），`color = rgb(0, 60, 180)`，`borderColor = rgb(0, 60, 180)`。
- 真机截图：`reports/audit/compile-table-reordered.png`。

## 9. 登录页 logo 替换为 Sanan 品牌标（2026-08-27 补充）
按截图要求，将登录页原先的金色占位方块 logo 替换为 Sanan 三安制造品牌 logo：

1. **问题**：`website/styles/v02.css` 中的 `.login-logo` 用金色渐变方块覆盖了 `brand.css` 中定义的 Sanan logo 背景。
2. **修复**：将 `.login-logo` 改为 `background: var(--logo-sanan) center / contain no-repeat`，尺寸 120×48px，透明背景，无圆角。

### 9.1 改动文件
1. `website/styles/v02.css` — 重写 `.login-logo` 样式，复用品牌图资源。

### 9.2 验证
- 打开登录页，顶部显示 Sanan logo（蓝底白字/图形）。
- 计算样式：`backgroundImage` 为 `var(--logo-sanan)` data URI，`backgroundColor` 透明，`borderRadius` 为 0。
- 真机截图：`reports/audit/login-logo-sanan.png`。
