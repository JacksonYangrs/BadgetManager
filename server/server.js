/* ================================================================
 * server.js — 经济事项编制模块 · Express 服务（单端口一体化）
 * 同时提供：静态前端（../website）+ JSON API
 * 启动：node --experimental-sqlite server/server.js   （默认 8300）
 * API：
 *   GET  /api/events            → 全量经济事项列表（8 列 + 派生偏差）
 *   GET  /api/events/:id        → 单条
 *   PUT  /api/events/:id/amount  {amount}   → 更新本年度预算值（联动重建默认月度）
 *   PUT  /api/events/:id/monthly {monthly:[12]} → 更新月度拆分（方案 B 保存）
 * ================================================================ */
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { execFile } = require("child_process");
const dbm = require("./db");

/* markitdown（default venv 已装）解析政策文档为文本 */
const MARKITDOWN = "/Users/yangjackson/.workbuddy/binaries/python/envs/default/bin/python";
const TEXT_EXT = new Set(["pdf", "docx", "xlsx", "pptx", "md", "txt", "csv", "doc"]);

const PORT = process.env.PORT || 8300;
const WEB_ROOT = path.join(__dirname, "..", "website");

const db = dbm.init();
dbm.initUnits(db);
dbm.initExecutions(db);
dbm.seedExecutions(db);
dbm.seedBuCodes(db);
dbm.initAuth(db);
const app = express();
app.use(express.json());

/* ---------- 认证中间件 ---------- */
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  const user = dbm.getUserByToken(db, token);
  if (!user) return res.status(401).json({ error: "未登录或会话已过期" });
  req.user = user;
  req.token = token;
  next();
}

/* 仅系统管理员 */
function requireAdmin(req, res, next) {
  if (!req.user.roles.some((r) => r.code === "admin")) return res.status(403).json({ error: "需要系统管理员权限" });
  next();
}

/* 组织维护权限：管理员 / 总经办负责人 / 总经办预算管理员（与前端 BM.canEditOrg 对齐） */
function requireOrgEditor(req, res, next) {
  if (!req.user.roles.some((r) => r.code === "admin" || r.code === "cooLead" || r.code === "cooAnalyst"))
    return res.status(403).json({ error: "需要组织维护权限（管理员 / 总经办）" });
  next();
}

/* ---------- API ---------- */
app.get("/api/health", (req, res) => res.json({ ok: true, service: "economic-event-module", db: dbm.DB_FILE }));

/* 调 markitdown 把文档解析为 markdown 文本（图片类本期不调，由路由层拦截提示） */
function parseWithMarkitdown(filePath) {
  return new Promise((resolve, reject) => {
    execFile(MARKITDOWN, ["-m", "markitdown", filePath], { maxBuffer: 64 * 1024 * 1024, timeout: 60000 },
      (err, stdout) => (err ? reject(err) : resolve(stdout || "")));
  });
}

/* ---------- 认证 ---------- */
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "缺少用户名或密码" });
  const r = dbm.loginUser(db, String(username), String(password));
  if (r.error) return res.status(401).json({ error: r.error });
  res.json(r);
});

app.post("/api/auth/logout", (req, res) => {
  const h = req.headers.authorization || "";
  dbm.logoutSession(db, h.startsWith("Bearer ") ? h.slice(7) : null);
  res.json({ ok: true });
});

app.get("/api/auth/me", auth, (req, res) => res.json(req.user));

/* ---------- 消息推送模块（D2） ---------- */
app.get("/api/notifications", auth, (req, res) => {
  const unreadOnly = req.query.unread === "1";
  res.json(dbm.listNotifications(db, req.user, { unreadOnly }));
});

app.post("/api/notifications/:id/read", auth, (req, res) => {
  const r = dbm.markNotificationRead(db, req.params.id, req.user);
  if (!r) return res.status(404).json({ error: "未找到或无权访问该消息" });
  res.json(r);
});

app.post("/api/notifications/read-all", auth, (req, res) => {
  const cnt = dbm.markAllNotificationsRead(db, req.user);
  res.json({ ok: true, marked: cnt });
});

app.post("/api/notifications", auth, requireAdmin, (req, res) => {
  const r = dbm.createNotification(db, req.body || {}, req.user);
  if (r.error) return res.status(400).json(r);
  res.status(201).json(r);
});

/* ---------- 预算规则版本化（D4） ---------- */
function requireRuleEditor(req, res, next) {
  const rs = (req.user.roles || []).map((r) => r.code);
  if (!rs.some((c) => c === "admin" || c === "finance")) return res.status(403).json({ error: "需要财务或管理员权限" });
  next();
}

app.get("/api/rule-versions", auth, (req, res) => res.json(dbm.listRuleVersions(db)));

app.post("/api/rule-versions", auth, requireRuleEditor, (req, res) => {
  const r = dbm.cloneRuleVersion(db, req.body || {});
  if (r.error) return res.status(400).json(r);
  res.status(201).json(r);
});

app.put("/api/rule-versions/:id/items", auth, requireRuleEditor, (req, res) => {
  const r = dbm.updateRuleItems(db, Number(req.params.id), (req.body || {}).items);
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

app.post("/api/rule-versions/:id/publish", auth, requireRuleEditor, (req, res) => {
  const r = dbm.publishRuleVersion(db, Number(req.params.id), req.body || {});
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

app.post("/api/rule-versions/:id/extract", auth, requireRuleEditor, (req, res) => {
  const text = (req.body || {}).text || "";
  res.json({ proposals: dbm.extractRuleProposals(db, text) });
});

/* 上传并解析政策文件：前端以 base64 JSON 传 {filename, content}，避开 multer 依赖；
 * 写 runtime/uploads 临时文件 → 调 markitdown 转文本 → 返回 {text}；图片类拦截提示（OCR 后续补） */
app.post("/api/policy-upload", auth, requireRuleEditor, (req, res) => {
  const body = req.body || {};
  const filename = body.filename || "";
  const content = body.content || "";
  if (!filename || !content) return res.status(400).json({ error: "缺少 filename 或 content" });
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (!TEXT_EXT.has(ext))
    return res.json({ text: "", note: "暂仅支持文本类文档（PDF/Word/Excel/Markdown/TXT/CSV），图片 OCR 后续补", filename });
  const safe = filename.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_");
  const tmp = path.join(__dirname, "..", "runtime", "uploads", Date.now() + "_" + safe);
  try {
    fs.writeFileSync(tmp, Buffer.from(content, "base64"));
  } catch (e) {
    return res.status(400).json({ error: "文件写入失败：" + (e && e.message ? e.message : String(e)) });
  }
  parseWithMarkitdown(tmp).then((text) => {
    try { fs.unlinkSync(tmp); } catch (_) {}
    res.json({ text: text || "", filename });
  }).catch((e) => {
    try { fs.unlinkSync(tmp); } catch (_) {}
    res.status(500).json({ error: "政策文件解析失败：" + (e && e.message ? e.message : String(e)) });
  });
});

/* 留存政策文件文本（AI 生成依据，可追溯），关联生成的版本（草案/发布后回填 version_id） */
app.post("/api/policy-document", auth, requireRuleEditor, (req, res) => {
  const r = dbm.savePolicyDocument(db, req.body || {});
  if (r.error) return res.status(400).json(r);
  res.status(201).json(r);
});

/* 删除版本：active 拦截，draft/archived 事务删除（三 Tab·Tab2） */
app.delete("/api/rule-versions/:id", auth, requireRuleEditor, (req, res) => {
  const r = dbm.deleteRuleVersion(db, Number(req.params.id));
  if (r.error) return res.status(r.code === "ACTIVE" ? 400 : 400).json(r);
  res.json(r);
});

/* 适用经济事项映射：按规则卡关联科目主数据（三 Tab·Tab3） */
app.get("/api/rule-versions/:id/event-map", auth, (req, res) => {
  const r = dbm.getEventMap(db, Number(req.params.id));
  if (r.error) return res.status(404).json(r);
  res.json(r);
});

app.put("/api/rule-versions/:id/event-map", auth, requireRuleEditor, (req, res) => {
  const r = dbm.putEventMap(db, Number(req.params.id), req.body);
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

/* ---------- 角色 / 组织 ---------- */
app.get("/api/roles", (req, res) => res.json(dbm.listRoles(db)));

/* 组织树（集团 / 单位 / 部门 / 管理中心），含 type 与归口管理中心 */
app.get("/api/orgs/tree", (req, res) => {
  const tree = dbm.buildOrgTree(db);
  const withUsers = (nodes) => nodes.map((n) => ({
    id: n.id, code: n.code, name: n.name, level: n.level, type: n.type, managedCenterId: n.managedCenterId || null, buCode: n.buCode || null,
    users: dbm.listOrgUsers(db, n.id).map((u) => ({ id: u.id, username: u.username, realName: u.realName, roles: u.roles.map((r) => r.name) })),
    children: withUsers(n.children),
  }));
  res.json(withUsers(tree));
});

/* ---------- 用户管理（预算工作人员：管理员/财务/总经办/归口责任人） ---------- */
app.get("/api/users", auth, requireAccountsEditor, (req, res) => res.json(dbm.listUsers(db)));

app.post("/api/users", auth, requireAccountsEditor, (req, res) => {
  const r = dbm.createUser(db, req.body || {});
  if (r.error) return res.status(400).json({ error: r.error });
  res.status(201).json(r);
});

app.put("/api/users/:id", auth, requireAccountsEditor, (req, res) => {
  const u = dbm.updateUser(db, Number(req.params.id), req.body || {});
  if (!u) return res.status(404).json({ error: "未找到用户" });
  res.json(u);
});

app.get("/api/events", (req, res) => res.json(dbm.listEvents(db)));

app.get("/api/events/:id", (req, res) => {
  const ev = dbm.getEvent(db, Number(req.params.id));
  if (!ev) return res.status(404).json({ error: "未找到经济事项" });
  res.json(ev);
});

app.put("/api/events/:id/amount", (req, res) => {
  const { amount } = req.body || {};
  if (amount == null) return res.status(400).json({ error: "缺少 amount" });
  const ev = dbm.updateAmount(db, Number(req.params.id), Number(amount));
  if (!ev) return res.status(404).json({ error: "未找到经济事项" });
  res.json(ev);
});

app.put("/api/events/:id/monthly", (req, res) => {
  const { monthly } = req.body || {};
  const result = dbm.updateMonthly(db, Number(req.params.id), monthly);
  if (result && result.error) return res.status(400).json(result);
  if (!result) return res.status(404).json({ error: "未找到经济事项" });
  res.json(result);
});

/* ---------- 基础数据管理（B）：会计科目 + 经济事项 CRUD ---------- */
/* 基础数据维护权限：admin/finance/cooLead/cooAnalyst 直通；centerOwner 放行（center 隔离为后续增强） */
function requireBaseDataEditor(req, res, next) {
  const rs = (req.user.roles || []).map((r) => r.code);
  if (!rs.some((c) => c === "admin" || c === "finance" || c === "cooLead" || c === "cooAnalyst" || c === "centerOwner"))
    return res.status(403).json({ error: "需要基础数据维护权限（管理员/财务/总经办/归口责任人）" });
  next();
}

/* 预算工作人员（用户账户）维护权限：管理员 / 财务 / 总经办 / 归口责任人 / 总经理(boss,ceo) */
function requireAccountsEditor(req, res, next) {
  const rs = (req.user.roles || []).map((r) => r.code);
  if (!rs.some((c) => c === "admin" || c === "finance" || c === "cooLead" || c === "cooAnalyst" || c === "centerOwner" || c === "boss" || c === "ceo"))
    return res.status(403).json({ error: "需要预算工作人员管理权限（管理员/财务/总经办/归口责任人/总经理）" });
  next();
}

/* 会计科目主数据 */
app.get("/api/subjects", auth, (req, res) => {
  const { center, method } = req.query;
  res.json(dbm.listSubjects(db, { center: center || undefined, method: method || undefined }));
});

app.get("/api/subjects/:id", auth, (req, res) => {
  const s = dbm.getSubject(db, Number(req.params.id));
  if (!s) return res.status(404).json({ error: "未找到科目" });
  res.json(s);
});

app.post("/api/subjects", auth, requireBaseDataEditor, (req, res) => {
  const r = dbm.createSubject(db, req.body || {});
  if (r.error) return res.status(400).json(r);
  res.status(201).json(r);
});

app.put("/api/subjects/:id", auth, requireBaseDataEditor, (req, res) => {
  const r = dbm.updateSubject(db, Number(req.params.id), req.body || {});
  if (!r) return res.status(404).json({ error: "未找到科目" });
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

app.delete("/api/subjects/:id", auth, requireBaseDataEditor, (req, res) => {
  const r = dbm.deleteSubject(db, Number(req.params.id));
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

/* 经济事项本体 CRUD */
app.post("/api/events", auth, requireBaseDataEditor, (req, res) => {
  const r = dbm.createEvent(db, req.body || {});
  if (r.error) return res.status(400).json(r);
  res.status(201).json(r);
});

app.put("/api/events/:id", auth, requireBaseDataEditor, (req, res) => {
  const r = dbm.updateEvent(db, Number(req.params.id), req.body || {});
  if (!r) return res.status(404).json({ error: "未找到经济事项" });
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

app.delete("/api/events/:id", auth, requireBaseDataEditor, (req, res) => {
  const r = dbm.deleteEvent(db, Number(req.params.id));
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

/* ---------- 上级部门汇总 API（模块二） ---------- */
/* 组织结构：上级部门 + 下级单位（数量按组织结构自动确定；公司挂事业部之下，按 level 取） */
app.get("/api/orgs", (req, res) => {
  const orgs = dbm.listOrgs(db);
  const root = orgs.find((o) => o.code === "HQ") || orgs[0];
  const units = orgs.filter((o) => o.level === "company");
  res.json({ root, units });
});

/* 组织结构 可编辑写接口（2026-08-24 C1）：仅管理员 / 总经办 */
app.post("/api/orgs", auth, requireOrgEditor, (req, res) => {
  const r = dbm.createOrg(db, req.body || {});
  if (r.error) return res.status(400).json(r);
  res.status(201).json(r);
});
app.put("/api/orgs/:id", auth, requireOrgEditor, (req, res) => {
  const r = dbm.updateOrg(db, Number(req.params.id), req.body || {});
  if (!r) return res.status(404).json({ error: "未找到组织" });
  if (r.error) return res.status(400).json(r);
  res.json(r);
});
app.delete("/api/orgs/:id", auth, requireOrgEditor, (req, res) => {
  const r = dbm.deleteOrg(db, Number(req.params.id));
  if (r.error) return res.status(400).json(r);
  res.json(r);
});

/* 某单位预算（与编制表同结构，含压降/注释） */
app.get("/api/unit-budgets", (req, res) => {
  const { org } = req.query;
  if (!org) return res.status(400).json({ error: "缺少 org" });
  res.json(dbm.listUnitBudgets(db, org));
});

/* 按事项汇总多单位（部门级预算汇总，含当期执行） */
app.get("/api/unit-summary", auth, (req, res) => {
  const { orgs, months } = req.query;
  if (!orgs) return res.status(400).json({ error: "缺少 orgs" });
  const ms = months ? String(months).split(",").map((s) => parseInt(s, 10)).filter((n) => n >= 1 && n <= 12) : null;
  res.json(dbm.summaryByCat(db, String(orgs).split(",").map((s) => s.trim()).filter(Boolean), ms));
});

/* 压降处理 + 注释（原因分析，保存到数据库） */
app.put("/api/unit-budgets/:id/reduction", (req, res) => {
  const { reduceRatio, reduceAmount, note } = req.body || {};
  const ev = dbm.updateUnitBudgetReduction(db, Number(req.params.id), { reduceRatio, reduceAmount, note });
  if (!ev) return res.status(404).json({ error: "未找到单位预算" });
  res.json(ev);
});

/* 逐月执行流水（B 路径）：查询 + 单点 upsert（财务真实导入/修正） */
app.get("/api/executions", auth, (req, res) => {
  const { org, months } = req.query;
  let orgId = null;
  if (org) {
    const o = dbm.orgByCode ? dbm.orgByCode(db, org) : db.prepare("SELECT id FROM organization WHERE code = ?").get(org);
    if (!o) return res.status(404).json({ error: "组织不存在" });
    orgId = o.id;
  }
  const ms = months ? String(months).split(",").map((s) => parseInt(s, 10)).filter((n) => n >= 1 && n <= 12) : null;
  res.json(dbm.listExecutions(db, { orgId, months: ms }));
});
app.put("/api/executions", auth, requireBaseDataEditor, (req, res) => {
  const { org, cat, month, amount } = req.body || {};
  if (!org || !cat || !month) return res.status(400).json({ error: "缺少 org/cat/month" });
  const o = dbm.orgByCode ? dbm.orgByCode(db, org) : db.prepare("SELECT id FROM organization WHERE code = ?").get(org);
  if (!o) return res.status(404).json({ error: "组织不存在" });
  const rec = dbm.upsertExecution(db, o.id, cat, parseInt(month, 10), amount);
  res.json(rec);
});

/* ---------- 静态前端 ---------- */
app.use(express.static(WEB_ROOT));

app.listen(PORT, () => {
  console.log("[economic-event-module] 服务已启动");
  console.log("  前端+API（单端口一体化）: http://127.0.0.1:" + PORT + "/");
  console.log("  API 健康检查: http://127.0.0.1:" + PORT + "/api/health");
  console.log("  认证: POST /api/auth/login | GET /api/auth/me | POST /api/auth/logout");
  console.log("  组织/角色/用户: GET /api/orgs/tree | GET /api/roles | GET|POST /api/users | PUT /api/users/:id");
  console.log("  上级部门汇总: /api/orgs | /api/unit-budgets | /api/unit-summary | /api/unit-budgets/:id/reduction");
});
