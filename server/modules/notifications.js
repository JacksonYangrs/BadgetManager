/** notifications module (auto-extracted from db.js) */


const GRASSROOTS = new Set(["expense"]);

const UPPER_ROLES = new Set(["admin", "ceo", "cooLead", "cooAnalyst", "legalHead", "adminHead", "companyBudgeter", "centerOwner"]);

function isGrassroots(roles) {
  return roles.length > 0 && roles.every((r) => GRASSROOTS.has(r));
}

/* 消息是否对当前用户可见 */

function notifVisibleTo(n, roles, userId) {
  /* 个人定向：只给指定用户 */
  if (n.user_id != null) return n.user_id === userId;
  /* 广播：角色范围 */
  if (n.role_scope && n.role_scope !== "all") {
    const scopes = n.role_scope.split(",").map((s) => s.trim());
    if (!roles.some((r) => scopes.includes(r))) return false;
  }
  /* 基层排他：组织 / 账户 / 汇总类对基层不可见 */
  if (isGrassroots(roles) && ["org", "account", "summary"].includes(n.type)) return false;
  return true;
}

function notifRowToDto(row) {
  return {
    id: row.id, type: row.type, title: row.title, body: row.body,
    view: row.view, refId: row.ref_id, priority: row.priority,
    read: !!row.read, createdAt: row.created_at,
  };
}

function seedNotifications(db) {
  if (db.prepare("SELECT COUNT(*) AS c FROM notification").get().c > 0) return;
  const ins = db.prepare(
    "INSERT INTO notification (user_id, role_scope, org_scope, type, title, body, view, ref_id, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const uid = (un) => { const r = db.prepare("SELECT id FROM user WHERE username = ?").get(un); return r ? r.id : null; };
  const seeds = [
    [null, "all", null, "compile", "2026 年度预算编制工作已启动", "请各预算编制人于 9 月 30 日前完成编制提交，逾期将影响集团汇总。", "compile", null, "normal"],
    [null, "all", null, "compile", "预算编制模板（V2）已发布", "请使用最新版《2026 年费控系统预算数据收集模板》填报，旧模板作废。", "compile", null, "normal"],
    [null, "cooAnalyst,adminHead,ceo", null, "execution", "总办·食堂费用 执行预警", "本年累计执行已达年度预算 92%，请关注并控制后续支出。", "kanban", null, "danger"],
    [null, "cooAnalyst,ceo", null, "deviation", "8 项经济事项预算偏差超 5%", "偏差事项待财务复核确认，请在预算系统中逐条核对。", "kanban", null, "danger"],
    [null, "cooAnalyst,ceo", null, "summary", "厦门市三安光电科技有限公司 预算汇总完成", "该公司预算汇总已编制完成，请上级审核并下达压降目标。", "unitInbox", null, "normal"],
    [null, "admin", null, "org", "组织架构更新", "新增安徽科技事业部，相关预算归口部门已同步至组织树。", "basedata", null, "normal"],
    [null, "admin", null, "account", "账户与角色变更", "新增 2 名预算编制人账号，权限已分配。", "accounts", null, "normal"],
    [uid("wangmin"), null, null, "execution", "您负责的 2010 公司·宿舍费用 执行预警", "请于本周内说明超支原因并提交整改计划。", "kanban", null, "danger"],
    [null, "centerOwner", null, "compile", "IT 职能中心归口科目编制指南", "IT 归口科目编制口径已下发，请中心归口责任人按指南填报。", "compile", null, "normal"],
  ];
  seeds.forEach((s) => ins.run(...s));
  console.log("[seed] notification 种子写入 " + seeds.length + " 条");
}

function listNotifications(db, user, opts) {
  opts = opts || {};
  const roles = (user.roles || []).map((r) => r.code);
  const rows = db.prepare("SELECT * FROM notification ORDER BY created_at DESC, id DESC").all();
  let items = rows.filter((n) => notifVisibleTo(n, roles, user.id)).map(notifRowToDto);
  const unread = items.filter((i) => !i.read).length;
  if (opts.unreadOnly) items = items.filter((i) => !i.read);
  return { items, unread };
}

function markNotificationRead(db, id, user) {
  const roles = (user.roles || []).map((r) => r.code);
  const n = db.prepare("SELECT * FROM notification WHERE id = ?").get(Number(id));
  if (!n) return null;
  if (!notifVisibleTo(n, roles, user.id)) return null;
  db.prepare("UPDATE notification SET read = 1 WHERE id = ?").run(Number(id));
  return notifRowToDto(db.prepare("SELECT * FROM notification WHERE id = ?").get(Number(id)));
}

function markAllNotificationsRead(db, user) {
  const roles = (user.roles || []).map((r) => r.code);
  const rows = db.prepare("SELECT * FROM notification").all();
  let cnt = 0;
  rows.forEach((n) => {
    if (notifVisibleTo(n, roles, user.id) && !n.read) {
      db.prepare("UPDATE notification SET read = 1 WHERE id = ?").run(n.id);
      cnt++;
    }
  });
  return cnt;
}

function createNotification(db, body, user) {
  const { user_id, role_scope, org_scope, type, title, body: b, view, ref_id, priority } = body || {};
  if (!title || !type) return { error: "缺少 title 或 type" };
  const r = db.prepare(
    "INSERT INTO notification (user_id, role_scope, org_scope, type, title, body, view, ref_id, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    user_id != null ? Number(user_id) : null,
    role_scope || null, org_scope || null, type, title, b || null, view || null,
    ref_id != null ? String(ref_id) : null, priority || "normal"
  );
  return notifRowToDto(db.prepare("SELECT * FROM notification WHERE id = ?").get(r.lastInsertRowid));
}

/* ================================================================
 * 预算规则版本化管理（D4：混合生成 · 数据库可配置）
 *  - budget_rule_version：版本集（draft / active / archived）
 *  - budget_rule_item：版本下规则条目（baseline 控制基线比例 / flow 财务流程规则）
 *  - 初始版本 v2026.0 由硬编码 applyRuleBase 映射 + 财务流程默认规则迁移而来
 *  - 发布新版本后 loadActiveFactors 刷新，compileBaseline / aiSuggestion 全系统同步
 * ================================================================ */

module.exports = {
  GRASSROOTS,
  UPPER_ROLES,
  createNotification,
  isGrassroots,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notifRowToDto,
  notifVisibleTo,
  seedNotifications,
};
