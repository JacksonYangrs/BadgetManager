# 项目长期记忆 · BadgetManager（三安光电 AI 费用预决算管理系统）

## 项目性质与边界
- 本项目是**内部产品 Demo / 应用软件**，不是对外网站。松哥明确：不需要做 SEO / LLM 可见性（2026-08-26）。
- 因此审计、设计建议中，**不把** robots.txt / sitemap / canonical / JSON-LD / llms.txt / 语义 h1-h3 等"公开网站健康度"指标作为必做项或高优先级；除非将来要做对外获客/展示页。
- 站点本地以 `localhost:8300` 由 Express 托管；**线上部署于 AWS EC2 `3.25.82.99:8300`**（`/opt/badgetmanager`，systemd `badgetmanager`，node22 + `--experimental-sqlite`，SSH 私钥 `~/AIProjects/awaconfig/my-OPC-app-key.pem` 用户 ubuntu），登录墙后是主界面。
- **手机端与桌面端完全分离（2026-09-02 松哥确立 · 交付边界）**：手机端（`website/mobile/`）做出来后与桌面端**完全分离、不随桌面端同时发布**；**交付给项目方时不包括手机端这一部分**。手机端是独立产品线/独立交付物，有自己的发布节奏。

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

## 团队治理与开发流程（2026-09-02 松哥确立 · 权威文档 `governance/TEAM.md` V2.2）
- **角色**：Sponsor=松哥（最终拍板/验收），PM=我（项目经理），开发工程师（前端 sanan-frontend-dev + 后端 sanan-backend-dev 统称），测试工程师（sanan-qa-tester）。
- **开发工程师强制流程（6 步，缺一不可）**：①影响评估（全树去重+影响面，依据 `pre-change-impact-analysis`）→ ②文件位置决策（是否新建模块，依据 `module-structure-discipline`，新建先写模块规格）→ ③开发+自测 → ④报告代码位置 → ⑤PM 评审代码 vs 需求/设计一致性 → ⑥移交测试。
- **测试工程师强制流程（3 步）**：写用例 → 写方案 → 执行（端到端+真机，blocker 有质量否决权）。
- **Git 提交纪律**：每 2 小时 或 每完成一个模块提交一次（以先到者为准）；版本号每次改动最小位 +1，本地与 AWS 一致，打 tag 后 push origin/main。
- **纪律违规汇报机制（2026-09-02 松哥确立）**：出现项目纪律违规 → PM 第一时间向 Sponsor 汇报（不隐瞒、不拖延、不自行消化），如实上报有奖励（Sponsor 判定）。违规判定 7 条定稿、汇报形式双轨（当场对话文字 + 落文件留痕 TASK_BOARD/日志）见 `governance/TEAM.md` §3.6。
- **Sponsor 决策/仲裁边界 vs PM 自主边界（2026-09-02 松哥确立 · 永久规则）**：一句话——**冲突/取舍/新增/对外/违规 → 找 Sponsor；执行/排期/修 bug/既定程序 → PM 自主、事后汇报，不再逐次请示**。必须找 Sponsor 共 6 类：①需求冲突 ②设计取舍（PM 枚举 ≥2 方案 + 权衡 + 推荐，Sponsor 拍板）③新增需求/理解偏差 ④范围扩张 ⑤对外/不可逆动作（发布给项目方、对外消息/邮件、生产部署、资金、权限移交、删数据）⑥纪律违规上报。任务先后顺序不找 Sponsor（PM 更清楚执行依赖）。见 `governance/TEAM.md` §2.8。
- **双映射文件维护（2026-09-02 松哥确立 · 永久规则）**：① 开发工程师每完成一个任务，更新《产品功能与代码映射关系.md》（项目根目录，功能→代码落点）；② PM 维护《需求-产品功能-模块对应关系.md》（项目根目录，需求→功能→模块三级追踪）；③ PM 每天汇报时必须报告这两个映射文件的变化。见 `governance/TEAM.md` §2.9。
- **滚动预算 = 月度结转（2026-09-02 松哥澄清口径 · 永久约定）**：滚动预算指「一个年度内，上一期（月/季度）预算未用完的部分结转到下一期，使下一期可用额度增加，但全年预算总额不变」——是「期间结转（carry-over）」，**不是**「滚动预测（rolling forecast）」。**已拍板规则：按月结转 / 全部科目可转 / 不设上限**。落地为 M8 执行跟踪的可用额度计算（本期可用 = 本期预算 + 上期结转），改动落 `pure-calc.js` 纯函数，不涉数据模型迁移。
- **角色模型拍板（2026-09-02 松哥拍板）**：完整重构 **14 角色**（松哥选 A，非 PM 推荐的渐进 B）——集团层 3（CEO/总经办负责人/总经办预算管理员）+ 法人公司层 3 + 归口层 1 类（11 职能中心归口责任人）+ 基层 7 类，替换 demo 的 boss/manager/staff/finance 4 占位。
- **P1 填报粒度拍板（2026-09-02 松哥拍板）**：按最细经济事项（~390 项）填报，「小类」作聚合展示层，不做填报粒度。
