/* ================================================================
 * server/middleware/auth.js — 统一权限中间件（消除 server.js / expense-import / policy_rules 各自抄写）
 *
 * 设计：buildAuth(dbm, db) 生成一组 Express 中间件。
 *   - auth            ：基础鉴权（解析 Bearer token → req.user）；需要 db 解析会话。
 *   - requireXxx      ：仅依赖 req.user.roles，判断角色集合（与前端 BM.canEdit* 闸门对齐）。
 * 角色集合集中此处，避免散落多份口径漂移。
 *
 * 对应前端闸门（website/core/state.js）：
 *   canEditOrg        ↔ requireOrgEditor
 *   canEditBaseData  ↔ requireBaseDataEditor
 *   canEditAccounts  ↔ requireAccountsEditor
 *   （规则编辑/财务权限由 requireRuleEditor / requireFinance 约束）
 * ================================================================ */
function roleHas(user, codes) {
  const rs = (user && user.roles) || [];
  return rs.some((r) => codes.indexOf(r.code) >= 0);
}

function buildAuth(dbm, db) {
  function auth(req, res, next) {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    const user = dbm.getUserByToken ? dbm.getUserByToken(db, token) : null;
    if (!user) return res.status(401).json({ error: "未登录或会话已过期" });
    req.user = user;
    req.token = token;
    next();
  }

  /* 仅系统管理员 */
  function requireAdmin(req, res, next) {
    if (!roleHas(req.user, ["admin"]))
      return res.status(403).json({ error: "需要系统管理员权限" });
    next();
  }

  /* 组织维护权限：管理员 / 总经办负责人 / 总经办预算管理员（与前端 BM.canEditOrg 对齐） */
  function requireOrgEditor(req, res, next) {
    if (!roleHas(req.user, ["admin", "cooLead", "cooAnalyst"]))
      return res.status(403).json({ error: "需要组织维护权限（管理员 / 总经办）" });
    next();
  }

  /* 预算规则编辑 / 财务权限：管理员 / 财务 */
  function requireRuleEditor(req, res, next) {
    if (!roleHas(req.user, ["admin", "finance"]))
      return res.status(403).json({ error: "需要财务或管理员权限" });
    next();
  }

  /* 基础数据维护权限：管理员 / 财务 / 总经办 / 归口责任人（centerOwner） */
  function requireBaseDataEditor(req, res, next) {
    if (!roleHas(req.user, ["admin", "finance", "cooLead", "cooAnalyst", "centerOwner"]))
      return res.status(403).json({ error: "需要基础数据维护权限（管理员/财务/总经办/归口责任人）" });
    next();
  }

  /* 预算工作人员（用户账户）维护权限：管理员 / 财务 / 总经办 / 归口责任人 / 总经理(boss,ceo) */
  function requireAccountsEditor(req, res, next) {
    if (!roleHas(req.user, ["admin", "finance", "cooLead", "cooAnalyst", "centerOwner", "boss", "ceo"]))
      return res.status(403).json({ error: "需要预算工作人员管理权限（管理员/财务/总经办/归口责任人/总经理）" });
    next();
  }

  /* 财务 / 总经办权限（政策生成等） */
  function requireFinance(req,  res, next) {
    if (!roleHas(req.user, ["admin", "finance", "cooLead", "cooAnalyst"]))
      return res.status(403).json({ error: "需要财务 / 总经办权限" });
    next();
  }

  return { auth, requireAdmin, requireOrgEditor, requireRuleEditor, requireBaseDataEditor, requireAccountsEditor, requireFinance, resolveAllowedOrgIds };
}

/* ================================================================
 * 数据范围（scope）推导：返回该用户可访问的组织 id 集合；null 表示不受限（all/group）。
 * 语义（来自 server/modules/auth.js 的 ROLE_SEEDS.scope，由模型设计阶段定义）：
 *   all / group → 全域（null）
 *   company     → 本人所属公司（向上找 level=company 的祖先【含自身】）及其全部下级
 *   center      → 本人归属的职能中心 managed_center_id 对应的所有组织
 *   dept / self → 本人所属组织 org_id
 * 这是后端授权（verifier），前端 scopedData 仅作体验裁剪，不可替代本函数。
 * ================================================================ */
function resolveAllowedOrgIds(dbm, db, user) {
  if (!user) return null;
  const scopes = (user.roles || []).map((r) => r.scope);
  if (scopes.indexOf("all") >= 0 || scopes.indexOf("group") >= 0) return null;
  const nodes = dbm.listOrgs ? dbm.listOrgs(db) : [];
  const myId = user.org && user.org.id;
  const allowed = new Set();
  const addDescendants = (id) => {
    allowed.add(id);
    nodes.filter((n) => n.parent_id === id).forEach((c) => addDescendants(c.id));
  };
  for (const s of scopes) {
    if (s === "company") {
      let cur = nodes.find((n) => n.id === myId);
      while (cur && cur.level !== "company" && cur.parent_id) cur = nodes.find((n) => n.id === cur.parent_id);
      if (cur) addDescendants(cur.id);
    } else if (s === "center") {
      let mc = null;
      if (myId) { const row = db.prepare("SELECT managed_center_id FROM organization WHERE id = ?").get(myId); mc = row && row.managed_center_id; }
      nodes.forEach((n) => { if (n.managed_center_id === mc) allowed.add(n.id); });
    } else { // dept / self
      if (myId) allowed.add(myId);
    }
  }
  return [...allowed];
}

module.exports = { buildAuth, roleHas, resolveAllowedOrgIds };
