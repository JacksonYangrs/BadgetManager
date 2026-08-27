# AI 模块设计文档 · BadgetManager v1.2

> 阶段：讨论→设计（本文件为开发交接物，待松哥定稿后进入开发）
> 日期：2026-08-27
> 决策来源：当日对齐（AskUserQuestion 拍板）

## 0. 对齐结论（已拍板）

| 决策点 | 结论 |
|---|---|
| LLM 接入时机 | **先搭骨架留接口**：ai-gateway 实现统一调用入口 + 确定性兜底，**暂不真接**大模型；未来填 AWS 环境变量 `AI_PROVIDER/AI_API_KEY` 即自动启用 |
| 模块二「系统动态」范围 | **全量业务数据**：预算编制 / 执行追踪 / 审批 / 调整 / 单位汇总 / 规则版本等所有业务表 |
| 模块三 AI 配置页 | **最小可用集**：provider 选择 + API Key（加密存储）+ 测试连接 + 当前启用模型显示 |
| 开发顺序 | **先三 → 再一 → 再二**（配置页是地基，一/二都依赖 AI 接入） |

### 0.1 补充决策（2026-08-27 11:42 拍板）

| 决策点 | 结论 |
|---|---|
| 规则生成范围 | **调参数 + 造新卡（两手都要）**：AI 抽取命中已有 scopeKey 则调参；未命中则**创建新规则卡**（动态注册 scopeKey + 复用通用计算逻辑），需人核对确认后发布 |
| Copilot 数据访问 | **受控动态 SQL（现场拼查询）**：AI 直接生成结构化查询 DSL → 后端**白名单校验**（表/字段/操作符）+ 参数化翻译执行 → 返回数据。非裸 SQL 字符串，防注入/越权 |
| 规则卡 Q 按钮 | **不做**：规则卡保持现有「适用经济事项」tab 呈现适用对象与限制，不新增 Q 按钮 |

> 安全红线（受控动态 SQL，按严格度排序）：
> ①【最严格·组织/行级授权】动态查询的结果集必须限定在请求用户 `resolveAllowedOrgIds` 返回的组织范围内；AI 生成 DSL 时只允许引用用户权限内的组织/单位，越权引用（如基层员工查总经理预算及执行情况）直接拒绝，绝不返回越权数据。
> ② 只允许白名单业务表；③ 字段/操作符白名单；④ 全部参数化（无字符串拼接）；⑤ 屏蔽敏感字段（如密码/密钥）；⑥ 只读 SELECT，禁止写操作。
> ⑦ 敏感数据类（**成本、经济/经营性数据**等）同样受 ① 组织授权约束，且**仅限页面内展示，禁止任何形式导出**（含要求 AI 协助导出）。
> ⑧ 涉及**个人的姓名字段**，在查询结果展示与自然语言作答中**一律脱敏**（星号替代 / 以「你查的这个人」代称），即便该数据在用户权限范围内（如张三为下级、可显金额，但姓名不显明文）。
> 任何一条不通过 → 拒绝执行并回退到兜底/「建议联系人工」。

## 1. 总体架构

```
前端 (website/)
  ├─ 设置/AI 配置页 ──PUT/GET/POST /api/ai-config──┐
  ├─ 规则页「生成新的规则」──POST /api/rule-versions/:id/extract──┤
  └─ Copilot ──POST /api/copilot/ask───────────────┤
                                                       │
后端 (server/)                                         │
  └─ ai-gateway.js（统一 LLM 入口）◄──────────────────┘
        │  chatCompletion(messages, opts)
        ├─ 已配置 AI_PROVIDER/AI_API_KEY → 调厂商 HTTP（OpenAI/Qwen/智谱/DeepSeek）
        └─ 未配置 → 抛「AI 未启用」错误 → 调用方必须有确定性兜底
  └─ system_config 表（scope=ai_gateway）存 provider/key/model/启用状态
```

**铁律（沿用 HELPBUY）**：LLM 只做「经 prompt 抽取/结构化」，最终金额/决策由确定性规则护栏，AI 不直接入库关键结论；所有 AI 产物供人核对。

**复用 HELPBUY 的设计理念（非代码，因语言不同）**：
- HELPBUY 是 Python/FastAPI，BadgetManager 是 Node/Express，代码不可直搬。
- 复用点：① provider/key/模型 配置理念；② 测试连接 `/test` 自检；③ 配置草稿/线上双态 + 加密存储；④ 成本计量（后续扩展）。
- HELPBUY 参考：`core/2.0/apps/api/main.py` 的 `/api/ai/*`、`apps/web/src/pages/AiGatewayConfig.tsx`、`packages/ai_gateway/config.py`。

## 2. 模块三：AI 配置页（先做，最小集）

### 2.1 后端

**新增 `system_config` 表**（若不存在）：
```sql
CREATE TABLE IF NOT EXISTS system_config (
  scope TEXT NOT NULL,
  key   TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (scope, key)
);
```
配置存 `scope='ai_gateway'`：`provider`、`api_key`（加密）、`model`、`enabled`、`updated_at`。

**接口契约**：
- `GET /api/ai-config` → `{ provider, model, enabled, keyMasked, status }`（key 脱敏返回 `sk-****1234`，不返明文）
- `PUT /api/ai-config`（auth: admin/finance）→ body `{ provider, apiKey, model }` → 保存（apiKey 加密存储），返回保存结果
- `POST /api/ai-config/test`（auth: admin/finance）→ 用当前/填入配置调一次 `ai-gateway.chatCompletion` 验证连通 → `{ ok, latencyMs, sample }` 或 `{ ok:false, error }`
- 改 `ai-gateway.js`：`getProvider()` 优先读 `system_config`，其次 `process.env`；`chatCompletion` 按 provider 调对应厂商 HTTP（本阶段**实现 HTTP 调用骨架**，但默认不启用，未配置则走兜底）。

**加密**：Node 内用 `crypto` 做 AES-256-GCM（key 取自环境变量 `APP_SECRET` 或固定口令派生），存储密文；回显脱敏。

### 2.2 前端

- 入口：admin/finance 角色「设置」或「预算规划」下新增「AI 配置」菜单项（复用 NAV 机制）。
- 页面：
  - provider 下拉（OpenAI / Qwen / 智谱 / DeepSeek）
  - API Key 输入框（type=password，保存后回显脱敏）
  - 模型名输入（如 `gpt-4o-mini` / `qwen-max` / `glm-4` / `deepseek-chat`）
  - 「测试连接」按钮 → 调 `/api/ai-config/test`，展示延迟/样例或错误
  - 当前状态条：「已启用 · 当前模型 xxx」/「未启用（AI 功能使用确定性兜底）」
- 样式复用现有 `.wb-section-title` / `.btn` / 表单类。

## 3. 模块一：政策文件 → 生成规则卡（骨架 + 兜底）

### 3.1 现状
- 前端「生成新的规则」按钮 → `POST /api/rule-versions/:id/extract`（rules.js:797/806）
- 后端 `extractPolicyChanges()`（rules.js:173 附近）是**正则占位**：解析「下调/下降 X%」类表述 → 产出 `{hint, scopeKey, factor, logic}` 清单，供人核对（不当即入库）。

### 3.2 目标（调参数 + 造新卡，两手都要）

后端 `/api/rule-versions/:id/extract` 产出统一为 `proposals[]`，分两条子路径：

- **路径 A · 调参数（命中已有 scopeKey）**：AI 抽取 `[{ scopeKey, factor(压降比例), logic(依据) }]`，scopeKey 命中现有规则卡词典（`BM.RULE_EVENT_MAP` / scopeKey 词典）→ 生成一张「参数更新草案卡」，**复用该 scopeKey 既有计算逻辑**，仅把 factor/阈值更新为新值。
- **路径 B · 造新卡（未命中 scopeKey）**：AI 抽取出的 `scopeKey` 不在既有词典中 → **动态注册新 scopeKey** + 复用通用计算逻辑（generic compute，不写死到具体卡）→ 生成一张「全新规则草案卡」。草案先入**草稿态**，**必须人核对确认后**才可由「生成草案版本/正式发布」入库为正式规则，AI 不得自动入库。
- 若 AI 未配置 → **保持现有正则兜底**（`extractPolicyChanges` 不动），同样走 A/B 路径判定（正则仅能命中少量已知 scopeKey，其余归 B）。

两者产出统一为 `proposals[]` → 前端渲染草案规则卡（`renderCreateNextTab` 已就绪），人核对后可微调再「生成草案版本/正式发布」。UI 不变，仅后端抽取逻辑升级（骨架+兜底）。

**解耦约束**：新卡的计算逻辑必须走 `BM.RULES` 通用 compute 入口，禁止在抽取层写死专属公式；新 scopeKey 注册需经 `ai-gateway`/规则层白名单式校验命名规范，避免脏 key 污染词典。

### 3.3 复用 HELPBUY prompt 思路
抽取 prompt 遵循「LLM 经 prompt 抽取，规则仅作护栏」：模型只输出结构化字段，scopeKey 映射与入库校验由后端规则层完成。

## 4. 模块二：Copilot 智能问答（全量业务数据 + 兜底）

### 4.1 现状
- `website/core/engine.js` 是**纯确定性关键词匹配**（问「超预算」→ 查预置数据 → 返回卡片），不是真 LLM。

### 4.2 目标（受控动态 SQL · 现场拼查询）

核心机制（2026-08-27 拍板 · 受控动态 SQL / 现场拼查询）：Copilot 的「查询条件」与「数据访问」之间**不引入预置函数映射、不引入 Agent**，由 **AI 直接生成结构化查询 DSL → 后端白名单校验（表/字段/操作符）→ 参数化翻译执行 → 返回数据** 实现。全程非裸 SQL 字符串，防注入/越权。

新增 `POST /api/copilot/ask`：`{ question }` →

- **若 AI 已配置**：
  1. `ai-gateway.chatCompletion` 做**意图识别 + 结构化查询 DSL 生成**（强制 JSON 输出），DSL 形如：
     ```json
     { "tables": ["budget_compile"],
       "fields": ["dept", "amount", "used"],
       "filters": [{"field":"amount","op":">","value":100000}],
       "groupBy": ["dept"], "orderBy": [{"field":"used","dir":"desc"}],
       "limit": 20 }
     ```
     —— 这是「查询意图的结构化描述」，**不是 SQL 字符串、不是自然语言**。
  2. 后端 `server/modules/copilot-retrieval.js` 对 DSL 做**白名单校验 + 参数化翻译**：校验 `tables/fields/op` 是否落在白名单内、剥离敏感字段（密码/密钥类）、翻译为参数化 `SELECT ... WHERE ...`（占位符绑定，零字符串拼接）。
  3. 执行只读 `SELECT` → 拿到业务数据 → 再回灌 `chatCompletion` 组织成自然语言 `answer` + 附 `evidence[]`（命中行/聚合值）。
- **若 AI 未配置** → **保持 `engine.js` 确定性兜底**（现有关键词匹配逻辑不变），返回 `{ answer, cards }`。
- 返回统一 `{ answer, cards, evidence[] }`，前端 Copilot 渲染。

**「系统动态」= 全量业务数据**（编制/执行/审批/调整/单位汇总/规则版本等所有业务表，只读）。检索层 `copilot-retrieval.js` 与 LLM 解耦：它只负责「白名单校验 + 参数化查询执行」，不懂业务语义，业务语义在 AI 生成的 DSL 里。

**安全红线（沿用 §0.1，按严格度排序，落地于此）**：①【最严格·组织/行级授权】结果集必须限定在请求用户 `resolveAllowedOrgIds` 的组织范围内，AI 只能引用权限内组织，越权引用（基层员工查总经理预算/执行）直接拒绝；② 只允许白名单业务表；③ 字段/操作符白名单；④ 全部参数化（无字符串拼接）；⑤ 屏蔽敏感字段（如密码/密钥）；⑥ 只读 SELECT，禁止写操作；⑦ 敏感数据类（成本/经济等）仅页面内展示、禁止导出（含 AI 协助导出）；⑧ 个人姓名字段展示与作答一律脱敏（星号/「此人」代称）。任何一条不通过 → 拒绝执行并回退到兜底/「建议联系人工」。

### 4.3 边界
- 不接语音/多模态；不自动执行写操作（只回答/建议）；超范围问题由兜底或「建议联系人工」承接。

### 4.4 隐私与导出约束（2026-08-27 补充 · 最严格之一）

Copilot 的「数据访问」在 ①②③ 红线之外，还受以下**展示 / 导出**约束：

- **禁止导出**：Copilot 只在本页内以卡片/文本作答，**不提供任何导出能力**（不含 Excel/CSV/PDF/整表复制）；用户不得要求 AI 协助导出，DSL 也只 SELECT，绝不变相产出文件。
- **敏感数据类同样受授权 + 仅展示**：成本数据、经济/经营性数据等敏感类目，与总经理预算同级——仅在用户权限内、仅页面内展示，不得越权、不得导出。
- **个人姓名脱敏（即便数据在权限内）**：结果或作答中涉及个人姓名时，不得显示明文：
  - 金额/数值可显示（如张三为提问人下级，其预算金额可展示）；
  - 姓名不显示明文，改为 **星号替代**（如 `张*` / `***`）或以 **「你查的这个人」** 代称；
  - 自然语言能力（LLM 回灌作答）也被约束：prompt 明确禁止输出真实姓名，统一用代称/星号。
- **示例**：用户问「帮我查一下张三的预算」，若张三为其下级 → 可答「你查的这个人（张\*）本年度预算为 X 元」，**不得**出现「张三的预算是 X 元」。

**落地**：姓名类字段在 `copilot-retrieval` 字段白名单中标记 `mask:true`，返回前脱敏；LLM 作答 prompt 注入脱敏指令；前端 Copilot 渲染层对任何姓名类字段强制星号（双重保险）。

## 5. 模块规格（解耦检查）

| 模块 | 职责（单一） | 依赖出 | 共享资源 | 目标耦合 |
|---|---|---|---|---|
| `ai-gateway.js` | 统一 LLM 调用入口 + 兜底 | 被 rules/copilot/ai-config 调用 | system_config（ai_gateway） | 松 |
| `ai-config` 接口+页 | AI 接入配置读写/测试 | 调 ai-gateway | system_config | 松 |
| `rules.extract` | 政策文本→规则卡草案 | 调 ai-gateway（可选） | budget_rule_version | 松 |
| `copilot/ask` | 问答：DSL 生成→白名单校验执行→作答 | 调 ai-gateway（可选）+ copilot-retrieval | 全量业务表（只读） | 松 |

遵循「模块结构纪律」：先定规格再写码；依赖方向单一（页面→driver→ai-gateway）；共享状态最小化（配置仅经 system_config 显式读写）。

## 6. 任务拆分（顺序：三→一→二）

1. **[模块三]** 后端：`system_config` 表 + `ai-gateway.js` 重构（chatCompletion 骨架+兜底）+ `/api/ai-config` 三接口 + AES 加密
2. **[模块三]** 前端：AI 配置页（provider/key/模型/测试/状态）+ 菜单入口（admin/finance）
3. **[模块一]** 后端：`/api/rule-versions/:id/extract` 增加 AI 分支（未配置走正则兜底）
4. **[模块一]** 验证：草案规则卡渲染（UI 已就绪）
5. **[模块二]** 后端：`copilot-retrieval.js`（白名单校验 + 参数化查询构建，受控动态 SQL）+ `/api/copilot/ask`（AI 生成 DSL→校验执行→回灌作答；未配置走 engine.js 兜底）
6. **[模块二]** 前端：Copilot 调用 `/api/copilot/ask`（未配置自动降级 engine.js）
7. 部署 + 真机验证（多角色）

## 7. 验收标准
- 配置页：未配 key 时全站 AI 功能走确定性兜底、不报错；配 key+测试连接成功后可切真 LLM。
- 模块一：上传政策文件「生成新的规则」产出草案卡（AI 或未配置均可用）。
- 模块二：Copilot 提问可检索全量业务数据作答（AI 或未配置均可用）。
- 不破坏既有编制/追踪/审批/调整流程。
