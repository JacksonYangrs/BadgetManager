# 模块设计文档：notifications（消息推送）

## 一句话定位
系统的「通知中心」——审批待办、预算预警、公告，按角色精准推给该看的人。

## 业务说明
预算流程里有大量「该谁来看、该谁来处理」的信息：比如「某事项等你审批」「本月某科目快超了」。这个模块就是这些消息的收发站：

- 消息分两类：广播（按角色推给一类人）和个人定向（只给某个人）。
- 可见性控制：基层员工看不到「组织/账户/汇总」类消息，避免越权信息外泄。
- 谁会用到：系统自动发（审批、预警）；用户在「消息中心」查看、标记已读。
- 为什么存在：预算是多人协作，缺了消息流转，审批和预警就断链。

## 业务流程（业务视角）
1. 种子：系统预置一批演示消息（幂等）。
2. 创建：发一条消息——可以广播给某类角色，也可以只定向某人。
3. 可见性：基层角色看不到 org/account/summary 类消息。
4. 读取：用户查看自己的消息，单条或一键全部标记已读。

## 技术对口（速查）
- 文件：`server/modules/notifications.js`
- 数据库表：`notification`（user_id/role_scope/org_scope/type/title/body/view/ref_id/priority/read）
- 关键能力：`createNotification`、`listNotifications`、`markNotificationRead`、`markAllNotificationsRead`、`notifVisibleTo`、`isGrassroots`

## 依赖与解耦
- 依赖入：无（仅 db）。
- 依赖出：被 `auth.js`（种子）、前端「消息中心」调用。
- 共享资源：`notification` 表。
- 目标耦合度：松。解耦措施：角色敏感配置以常量显式化，避免散落硬编码。

## 关键决策规则
- 基层（expense/staff）不可见 type ∈ {org, account, summary}，防止越权。
- 可见性以「角色 + 范围」双维度控制，与 auth 的 scope 概念一致。
