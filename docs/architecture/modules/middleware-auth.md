# 模块设计文档：middleware-auth（接口权限中间件 · 统一收敛）

## 一句话定位
系统的「门禁」——每一道防线说「这个接口，这个人能不能调」。

## 业务说明
前面讲了 auth 管「身份 + 菜单」，但具体到「调某个接口」还要再卡一道：比如「只有财务能改规则」「只有基础数据编辑者能导入」。原本这些判断散落在 server、policy_rules、import 三处各抄一份，容易漂移。这个模块把门禁统一收口：

- 一套守卫：admin / 组织编辑 / 规则编辑 / 基础数据编辑 / 账户编辑 / 财务，各对应一组允许的角色。
- 谁会用到：所有后台接口；任何需要「只有某类人能干」的地方，只声明守卫即可。
- 为什么存在：权限逻辑集中一处，改角色名单只改一处，杜绝三处不一致。

## 业务流程（业务视角）
1. 身份：解析请求里的登录令牌 → 认出当前用户及其角色。
2. 判定：按「角色白名单」判断有没有资格；没资格直接拒绝（403）。

## 技术对口（速查）
- 文件：`server/middleware/auth.js`
- 依赖：`dbm.getUserByToken`（来自 auth.js）
- 关键能力：`buildAuth(dbm, db)` → `auth` + `requireAdmin` / `requireOrgEditor` / `requireRuleEditor` / `requireBaseDataEditor` / `requireAccountsEditor` / `requireFinance`

## 依赖与解耦
- 依赖入：`dbm.getUserByToken`。
- 依赖出：`server.js`、`policy_rules.js`、`expense-import.js`。
- 共享资源：复用 auth 的 token/session 机制。
- 目标耦合度：松（横切，零业务依赖）。解耦措施：把散落 3 处的权限集中到单一工厂，角色白名单显式定义。

## 关键决策规则
- 角色集合与 auth 的 ROLE_SEEDS（scope/views）语义一致：scope 管「看哪些数据」，requireXxx 管「能调哪些接口」。
