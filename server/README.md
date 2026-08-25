# 经济事项编制模块（前端 + API + SQLite）

三安光电 AI 费用预决算 · 经济事项编制表的前后台一体模块。

## 启动（单端口一体化：页面 + API）

```bash
cd server
NODE_PATH=<node_workspace>/node_modules node --experimental-sqlite server.js
```

- 默认端口 **8300**（`PORT` 环境变量可改）
- 浏览器访问 `http://127.0.0.1:8300/?as=expense#compile` 即编制表页面
- 首次启动自动建库 `server/economic_event.db` 并写入 6 条种子经济事项

> 说明：本项目使用 Node 22 内置 `node:sqlite`（需 `--experimental-sqlite`），无额外原生依赖；
> Express 已安装于本机 node workspace。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/health` | 健康检查 |
| GET  | `/api/events` | 全量经济事项列表（8 列 + 派生偏差） |
| GET  | `/api/events/:id` | 单条 |
| PUT  | `/api/events/:id/amount` | 更新本年度预算值（联动重建默认月度） |
| PUT  | `/api/events/:id/monthly` | 更新月度拆分（12 元数组，方案 B 保存） |
| GET  | `/api/orgs` | 组织结构（上级部门 + 下级单位，数量按组织结构自动确定） |
| GET  | `/api/unit-budgets?org=<code>` | 某单位预算（与编制表同结构 + 压降/注释） |
| GET  | `/api/unit-summary?orgs=a,b` | 按事项汇总多单位（部门级汇总 + 较上年 ±%） |
| PUT  | `/api/unit-budgets/:id/reduction` | 压降处理（reduceRatio/reduceAmount）+ 注释（因素分析，存库） |

## 数据库表

### `economic_event`（编制表）
| 字段 | 说明 |
|------|------|
| id | 主键 |
| cat | 经济事项（如食堂费用） |
| acct_code | 会计科目编码 |
| amount | 本年度预算值 |
| monthly | 月度拆分 JSON（12 元） |
| last_budget | 上年预算（年初下达） |
| last_year | 上年决算（实际执行） |
| method | 预算控制方法（上级定义） |
| ai | AI 建议 JSON（lo/hi/mid + 依据） |
| sort_no | 排序 |

### `organization` + `unit_budget`（部门汇总模块二）
- `organization`：单位树（parent_id 层级，下级单位数量按组织结构自动确定；level: group/company/dept）
- `unit_budget`：单位 × 经济事项 预算（amount/monthly/last_budget/last_year/method/ai）
  + `reduce_ratio`/`reduce_amount`（压降处理）+ `note`（注释 = 因素分析，存库）

偏差 = 上年决算 − 上年预算（查询时计算，不落库）。

## 模块三：组织架构 + 用户账户 + 角色权限（2026-08-23）

**正式客户项目基础模块**。覆盖：

- **组织架构**：organization 三级树（集团 HQ → 二级公司 → 三级部门）
- **用户账户**：user 表 + scrypt 密码哈希 + 会话表（token 持久化）
- **角色系统**：role 表（13 角色 + 视图白名单 views + 数据范围 scope）+ user_role 多对多
- **认证**：Bearer token 鉴权中间件 + requireAdmin 权限中间件

### API 速查（模块三新增）

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | `/api/auth/login` | — | 账号密码登录，返回 token + user |
| POST | `/api/auth/logout` | Bearer | 登出（删除 session） |
| GET  | `/api/auth/me` | Bearer | 当前登录用户（含角色 + 组织） |
| GET  | `/api/roles` | — | 角色字典（views / scope） |
| GET  | `/api/orgs/tree` | Bearer | 组织三级树（含每节点人员） |
| GET  | `/api/users` | Bearer + admin | 账户列表 |
| POST | `/api/users` | Bearer + admin | 新建账户 |
| PUT  | `/api/users/:id` | Bearer + admin | 编辑 / 改角色 / 重置密码 / 启停用 |

### 数据库表（模块三新增）

| 表 | 关键字段 | 说明 |
|----|----------|------|
| `role` | code PK / name / desc / views JSON / scope | 13 角色（含 admin/ceo/cooLead/cooAnalyst/finance/legalHead/adminHead/companyBudgeter/centerOwner/expense/manager/staff/boss） |
| `user` | id / username UNIQUE / password（scrypt 哈希）/ real_name / org_id / active | 种子 12 用户，统一初始密码 `Admin@2026`（正式部署须改） |
| `user_role` | user_id + role_code（联合主键） | 一人可多角色，切换器只列已分配角色 |
| `session` | token PK / user_id / created_at / expires_at | 会话有效期 24h，DB 持久化（重启不失效） |

### 演示账号（统一密码 `Admin@2026`）· 按组织层级

**集团层**（含上下级部门示例：集团财务部（上级）→ 一公司财务部（下级））

| 账号 | 姓名 | 角色 | 组织 |
|------|------|------|------|
| admin | 系统管理员 | admin | HQ |
| zhangmy | 张明远 | ceo + boss（总经理） | HQ |
| xujing | 徐静 | cooLead（总经办负责人） | 总经办 |
| lijing | 李静 | finance + cooAnalyst（集团财务部·上级） | 集团财务部 |
| zhoufang | 周芳 | centerOwner（职能中心归口责任人） | 行政服务中心 |

**事业部层**

| 账号 | 姓名 | 角色 | 组织 |
|------|------|------|------|
| sunyue | 孙悦 | buHead（事业部负责人） | 行政服务事业部 |

**公司 / 部门层**

| 账号 | 姓名 | 角色 | 组织 |
|------|------|------|------|
| wangmin | 王敏 | manager（一公司财务部·下级） | 一公司 · 财务部 |
| chenkai | 陈凯 | adminHead（行政归口负责人） | 二公司 |
| liuyang | 刘洋 | companyBudgeter（公司预算员） | 四公司 |

**基层层**

| 账号 | 姓名 | 角色 | 组织 |
|------|------|------|------|
| zhaolei | 赵磊 | expense（基层费用责任岗） | 一公司 · 后勤保障部 |
| duanwei | 段伟 | expense（基层费用责任岗） | 二公司 · 后勤保障部 |
| zhangwei | 张伟 | staff（员工） | 一公司 · 综合办公室 |

### 组织树（事业部管辖公司）

```
集团总部 HQ
├── 行政服务事业部（business）· 孙悦
│   ├── 一公司 2010 → 综合办公室 / 财务部 / 后勤保障部
│   ├── 二公司 2020 → 综合办公室 / 财务部 / 后勤保障部
│   ├── 三公司 2170 → 综合办公室 / 财务部 / 后勤保障部
│   └── 四公司 3050 → 综合办公室 / 财务部 / 后勤保障部
├── 集团财务部（dept·职能）· 李静  ← 上级部门
├── 总经办（dept·职能）· 徐静
└── 行政服务中心（dept·职能）· 周芳
```

上下级部门示例：**集团财务部（李静，上级）→ 一公司财务部（王敏，下级）**

### 前端登录约定

- **正式登录**：账号 + 密码 → POST /api/auth/login
- **演示通道**：下拉选择角色直接进入（?as=xxx 等价，不经后端，仅开发/演示期）
- **token 存储**：localStorage（state.token），刷新页面后保持登录
- **会话校验**：进入后静默调 GET /api/auth/me，过期自动回登录页
- **退出登录**：顶栏「退出登录」按钮

## 前端数据源

`website/views/compile.js` 启动时请求 `/api/events`：
- 在线（后端可达）→ 8 列编制表渲染 + 改动实时 PUT 保存
- 离线（后端未启动）→ 回退本地样例数据（顶部显示"数据源 · 离线"，改动存本地草稿）
