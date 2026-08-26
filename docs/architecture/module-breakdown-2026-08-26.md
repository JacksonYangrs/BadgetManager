# BadgetManager 模块拆分方案（业务维度 · 2026-08-26）

> 目标：把 `server/db.js`（1435 行 / 77 函数 God Object）按**业务域**拆成独立模块。
> 原则：对外导出的 77 个接口名**保持不变**，调用方（server.js / import_module.js / policy_rules.js / tests）零改动——属于「解构 God Object 但保持接口稳定」，风险最低。
> 当前 AI 三处：① AI 接入（大模型专线，**目前不存在**，待建）② AI 政策抽取（目前是规则抽取，非 LLM）③ AI 预算决策分析（目前是规则基线，非 LLM）。

## 一、模块总览表

| # | 模块 | 业务职责 | 文件 | 来源函数（db.js / 现有） |
|---|---|---|---|---|
| 1 | 组织与单位 | 组织树、单位预算表、BU 编码、管理中心、层级 | `server/modules/organization.js` | initUnits / listOrgs / listChildUnits / getOrg / createOrg / updateOrg / deleteOrg / buildOrgTree / inferBuCode / seedBuCodes / isOrgAncestor / recomputeOrgLevels / resolveManagedCenter / migrateOrgTypeAndCenters / MANAGE_CENTERS / ORG_SEEDS / UNIT_FACTOR |
| 2 | 身份与权限 | 用户、角色、会话、登录、密码 | `server/modules/auth.js` | initAuth / hashPassword / verifyPassword / loginUser / userToDto / getUserByToken / logoutSession / listRoles / listUsers / createUser / updateUser / ROLE_SEEDS / USER_SEEDS / SEED_PASSWORD / SESSION_TTL_MS / DEPT_SEEDS |
| 3 | 科目主数据 | 会计科目 CRUD（预算科目字典） | `server/modules/subjects.js` | migrateSubjects / rowToSubject / listSubjects / getSubject / createSubject / updateSubject / deleteSubject |
| 4 | 经济事项 | 核心业务实体：经济事项增删改查 | `server/modules/events.js` | rowToEvent / listEvents / getEvent / updateAmount / updateMonthly / createEvent / updateEvent / deleteEvent（含建表 + SEEDS） |
| 5 | 预算编制 | 按部门/角色编制、分配、压降预算（规划态） | `server/modules/budget-compile.js` | listUnitBudgets / summaryByCat / updateUnitBudgetReduction / ubRowToEvent |
| 6 | 预算执行·追踪 | 逐月执行流水（实际发生 vs 预算） | `server/modules/budget-execution.js` | initExecutions / seedExecutions / listExecutions / upsertExecution |
| 6a | └ 费控系统导入 | 从外部费控系统导入执行数据（execution 子模块） | `server/modules/expense-import.js` | 即现有 `import_module.js`（buildImportModule） |
| 7 | 规则与政策核心 | 规则版本、事件映射、因子、基线计算（非 AI 部分） | `server/modules/rules.js` | migrateRuleVersions / listRuleVersions / cloneRuleVersion / updateRuleItems / publishRuleVersion / deleteRuleVersion / getEvent  Map / putEventMap / loadActiveFactors / RULE_FACTORS / compileBaseline / ruleItemToDto / ruleVersionToDto / activeRuleVersionId / nextVersionLabel / cloneEventMap / HINT_SCOPE / hintToScope |
| 8 | AI 接入（网关） | 大模型专线：provider 配置、chat/embedding 调用、密钥与兜底 | `server/modules/ai-gateway.js` | **新增**：封装 LLM 调用（当前无真接入，先留接口与本地兜底，承接下面两个 AI 模块） |
| 9 | AI 政策抽取 | 用 AI 解析政策文件 → 生成规则建议（你说的「抽取」） | `server/modules/ai-policy-extract.js` | extractRuleProposals（现规则抽取，待接 ai-gateway 升级为 LLM）/ savePolicyDocument（政策文档落库） |
| 10 | AI 预算决策分析 | 用 AI 对预算做 lo/hi/mid 建议与依据（你说的「决策分析」） | `server/modules/ai-budget-decision.js` | aiSuggestion（现规则基线，待接 ai-gateway 升级为 LLM） |
| 11 | 通知 | 消息推送、已读、可见范围 | `server/modules/notifications.js` | seedNotifications / listNotifications / markNotificationRead / markAllNotificationsRead / createNotification / GRASSROOTS / UPPER_ROLES / isGrassroots / notifVisibleTo / notifRowToDto |
| 12 | 组合根 | `init()` 按序编排各模块 init + 合并导出 + DB_FILE | `server/db.js`（瘦身） | init / exports、删除全部业务函数 |

**合计文件：** 11 个业务模块文件 + 1 个组合根（db.js 仅剩编排）= 12 个；外加已有的纯函数层 `pure-calc.js` / `pure-rule.js`（被 rules / ai-budget-decision 复用，不改动）。

## 二、各模块职责与边界

**1. 组织与单位 `organization.js`**
- 只负责：组织树、单位、BU 编码、管理中心、层级推导。
- 不负责：用户归属（归 auth）、预算金额（归 budget-compile/events）。
- 共享资源：仅 `economic_units` 表；被 auth / budget-compile / notifications 读。

**2. 身份与权限 `auth.js`**
- 只负责：登录态、角色、会话、密码哈希。权限语义（角色→可编辑哪些预算）此处只存角色，判断散在 middleware。
- 风险点：权限判定当前在 server.js / import_module.js / policy_rules.js **各抄一份**（auth + requireXxx），拆完后抽成 `server/middleware/auth.js` 统一。

**3. 科目主数据 `subjects.js`**
- 只负责：预算科目字典 CRUD。被 events / budget-compile 引用。

**4. 经济事项 `events.js`**
- 核心实体（预算条目）。createEvent / updateEvent 会调用 `rules.aiSuggestion` 生成初始 AI 建议字段（依赖出：rules）。
- 这是「预算编制」落地的载体（事项带 amount/monthly/ai），与「预算编制」模块是上下游，不是包含关系。

**5. 预算编制 `budget-compile.js`**
- 面向「规划态」：按部门/角色把预算分配到组织×科目×类别，支持压降（`updateUnitBudgetReduction`）、汇总（`summaryByCat`）。
- 角色差异（总经理/部门经理/员工/财务经理各自能编哪些）由 auth 角色 + 此模块的字段校验共同约束——这是你说的「支持不同部门、不同角色的预算编制」落点。

**6. 预算执行·追踪 `budget-execution.js` + 6a 费控导入**
- 执行/追踪是「实际发生」：逐月实际流水（upsertExecution）。
- 费控导入是独立子模块：从外部费控系统批量导入执行数据，导入后落入 execution 表——你明确要拆出的「小模块」。

**7. 规则与政策核心 `rules.js`**
- 规则版本化（draft→published）、事件映射、因子表、确定性基线计算（`compileBaseline`）。是所有预算建议的「地面真相」来源。

**8–10. AI 三件套**
- `ai-gateway` 是底层专线（被 9、10 依赖），目前缺位 → 先建接口 + 本地兜底，后续接真实 LLM（OpenAI / Qwen / 智谱 / DeepSeek，AWS 已配 Key）。
- `ai-policy-extract`：政策文件 → 规则建议（现 `extractRuleProposals`，规则版；接 gateway 后升级为 LLM）。
- `ai-budget-decision`：预算 lo/hi/mid 建议（现 `aiSuggestion`，规则版；接 gateway 后升级为 LLM）。

**11. 通知 `notifications.js`**：消息可见性按角色（grassroots vs upper）过滤。

## 三、跨模块依赖（已确认无环）
- events → rules（aiSuggestion）
- ai-policy-extract → rules（持久化）/ ai-gateway（LLM）
- ai-budget-decision → rules（RULE_FACTORS）/ ai-gateway（LLM）
- auth → organization（用户组织归属）
- budget-execution / notifications / budget-compile 用原生 SQL 读关联表，不 require 其他模块

## 四、执行验证（拆完后必跑）
1. `npm run test:unit` —— 纯函数单测（calc/rule/state）
2. `npm run test:integration` —— 后端 API 契约（接口未变，应全绿）
3. `node --experimental-sqlite server/server.js` 起服务 + 探活 `/api/health`，确认现有 `economic_event.db` 幂等初始化不报错

## 五、未决 / 待确认
- 经济事项的「编制」（createEvent 带预算）与「预算编制」模块（unit-budget 表）是否进一步合并为单一「预算」上下文？目前拆成 4+5 两个，符合「编制 vs 追踪」语义，保留。
- AI 接入的 provider / 密钥从 AWS 配置读取（你已配好），具体接入细节拆到执行时再落地，先留接口。

> 确认后我直接执行：新建 `server/modules/` 下 11 个文件 + 瘦身 `db.js`，补一份回归测试锁定接口稳定。
