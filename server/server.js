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
const buildImportModule = require("./modules/expense-import");
const buildPolicyRules = require("./policy_rules");
const { buildAuth } = require("./middleware/auth");
const aiGateway = require("./modules/ai-gateway");

/* markitdown（default venv 已装）解析政策文档为文本；优先用环境变量，回退到本机默认值，最后回退 python3 */
const MARKITDOWN = process.env.MARKITDOWN_BIN || "/Users/yangjackson/.workbuddy/binaries/python/envs/default/bin/python";
const TEXT_EXT = new Set(["pdf", "docx", "xlsx", "pptx", "md", "txt", "csv", "doc"]);

const PORT = process.env.PORT || 8300;
const WEB_ROOT = path.join(__dirname, "..", "website");

const db = dbm.init();
dbm.initUnits(db);
dbm.initExecutions(db);
dbm.seedExecutions(db);
dbm.initAuth(db); /* 必须早于 seedBuCodes：migrateOrgTypeAndCenters 会补全 organization.type 列 */
dbm.seedBuCodes(db);
const app = express();
app.use(express.json());

/* 统一权限中间件（定义见 server/middleware/auth.js，由 db 注入 token  -解析） */
const { auth, requireAdmin, requireOrgEditor, requireRuleEditor, requireBaseDataEditor, requireAccountsEditor, resolveAllowedOrgIds } = buildAuth(dbm, db);
const copilot = require("./modules/copilot");

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

app.post("/api/rule-versions/:id/extract", auth, requireRuleEditor, async (req, res) => {
  const text = (req.body || {}).text || "";
  try {
    const proposals = await dbm.extractRuleProposals(db, text);
    res.json({ proposals });
  } catch (e) {
    // 双保险：任何意外都返回空草案，保证页面不崩溃（前端提示手动录入）
    res.status(500).json({ proposals: [], error: "提取失败，请重试或手动录入" });
  }
});

/* ---------- AI 配置（模块三 · admin/finance） ---------- */
app.get("/api/ai-config", auth, requireRuleEditor, (req, res) => {
  res.json(dbm.getAiConfig(db));
});

app.put("/api/ai-config", auth, requireRuleEditor, (req, res) => {
  const r = dbm.saveAiConfig(db, req.body || {});
  res.json(r);
});

app.post("/api/ai-config/test", auth, requireRuleEditor, async (req, res) => {
  const body = req.body || {};
  /* 优先用本次提交的凭据；未填 key 则回退到已保存配置 */
  let creds = { provider: body.provider, apiKey: body.apiKey, model: body.model, baseUrl: body.baseUrl };
  if (!creds.apiKey) {
    const saved = dbm.getActiveCredentials(db);
    if (saved) {
      // 未填 key → 用已保存 key；但若本次填了 baseUrl/model 则优先用本次的（便于测试代理端点）
      creds = {
        provider: creds.provider || saved.provider,
        apiKey: saved.apiKey,
        model: creds.model || saved.model,
        baseUrl: creds.baseUrl || saved.baseUrl,
      };
    }
  }
  if (!creds.provider || !creds.apiKey)
    return res.status(400).json({ ok: false, error: "缺少 provider 或 apiKey（请先填写或保存配置）" });
  try {
    const r = await aiGateway.testConnection(creds);
    res.json(r);
  } catch (e) {
    res.json({ ok: false, error: e && e.message ? e.message : String(e) });
  }
});

/* ---------- Copilot 智能问答（模块二 · 受控动态 SQL） ---------- */
const { CopilotReject } = require("./modules/copilot-retrieval");
app.post("/api/copilot/ask", auth, async (req, res) => {
  const { question } = req.body || {};
  if (!question || !String(question).trim()) return res.status(400).json({ error: "缺少问题" });
  const creds = dbm.getActiveCredentials(db);
  const allowedOrgIds = resolveAllowedOrgIds(dbm, db, req.user); // null = 全域
  if (!creds) {
    // 未配置 AI → 前端走本地 engine.js 确定性兜底（见 task #33）
    return res.json({ aiEnabled: false, answer: "AI 未启用，已切换本地关键词匹配。", evidence: [] });
  }
  try {
    const r = await copilot.askCopilot(db, { question: String(question), allowedOrgIds, creds });
    res.json({ aiEnabled: true, answer: r.answer, evidence: r.evidence, source: "ok" });
  } catch (e) {
    // 分类回包：白名单拒绝 / AI 解析失败 / 网关失败 / 未知，各自文案 + source，不再统一伪装成"权限拒绝"
    const reason = e && e.reasons ? JSON.stringify(e.reasons) : (e && e.message ? e.message : String(e));
    console.error("[copilot] /api/copilot/ask 异常 | question=" + JSON.stringify(question) + " | 用户=" + (req.user ? req.user.username : "?") + " | 原因=" + reason);
    if (e && e.stack) console.error("[copilot] stack:", e.stack.split("\n").slice(0, 6).join("\n"));
    if (e instanceof CopilotReject) {
      return res.json({ aiEnabled: true, answer: "该查询未通过系统校验（超出可查询范围），已拦截未执行。可换更具体的问法，或联系管理员。", evidence: [], source: "reject", reason });
    }
    const msg = e && e.message ? e.message : String(e);
    if (/AI 未返回合法 DSL/.test(msg)) {
      return res.json({ aiEnabled: true, answer: "AI 未能生成有效的查询条件，请换个说法再试（如「去年食堂费用是多少」）。", evidence: [], source: "dsl_parse", reason: msg });
    }
    if (/AI 请求超时|AI 网络请求失败|AI 调用失败|AI 返回为空/.test(msg)) {
      return res.json({ aiEnabled: true, answer: "AI 服务暂时不可用（模型调用失败），请检查 AI 配置或稍后重试。", evidence: [], source: "gateway", reason: msg });
    }
    res.json({ aiEnabled: true, answer: "抱歉，暂时无法回答该问题，请稍后重试或联系管理员。", evidence: [], source: "fallback", reason: msg });
  }
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
  const uploadDir = path.join(__dirname, "..", "runtime", "uploads");
  fs.mkdirSync(uploadDir, { recursive: true }); /* 干净环境 runtime/ 可能不存在，先建目录防止写入失败 */
  const tmp = path.join(uploadDir, Date.now() + "_" + safe);
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
app.get("/api/roles", auth, (req, res) => res.json(dbm.listRoles(db)));

/* 组织树（集团 / 单位 / 部门 / 管理中心），含 type 与归口管理中心 */
app.get("/api/orgs/tree", auth, (req, res) => {
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

app.get("/api/events", auth, (req, res) => res.json(dbm.listEvents(db)));

app.get("/api/events/:id", auth, (req, res) => {
  const ev = dbm.getEvent(db, Number(req.params.id));
  if (!ev) return res.status(404).json({ error: "未找到经济事项" });
  res.json(ev);
});

app.put("/api/events/:id/amount", auth, requireBaseDataEditor, (req, res) => {
  const { amount } = req.body || {};
  if (amount == null) return res.status(400).json({ error: "缺少 amount" });
  const ev = dbm.updateAmount(db, Number(req.params.id), Number(amount));
  if (!ev) return res.status(404).json({ error: "未找到经济事项" });
  res.json(ev);
});

app.put("/api/events/:id/monthly", auth, requireBaseDataEditor, (req, res) => {
  const { monthly } = req.body || {};
  const result = dbm.updateMonthly(db, Number(req.params.id), monthly);
  if (result && result.error) return res.status(400).json(result);
  if (!result) return res.status(404).json({ error: "未找到经济事项" });
  res.json(result);
});

/* ---------- 基础数据管理（B）：会计科目 + 经济事项 CRUD ---------- */
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
app.get("/api/orgs", auth, (req, res) => {
  const orgs = dbm.listOrgs(db);
  const allowed = resolveAllowedOrgIds(dbm, db, req.user); // null = 全域
  const root = orgs.find((o) => o.code === "HQ") || orgs[0];
  let units = orgs.filter((o) => o.level === "company");
  if (allowed) units = units.filter((u) => allowed.indexOf(u.id) >= 0);
  const flags = dbm.orgBudgetFlags(db); // org_id → 记录数（收件箱无数据灰标）
  units = units.map((u) => Object.assign({}, u, { hasBudget: !!flags[u.id] }));
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
app.get("/api/unit-budgets", auth, (req, res) => {
  const { org } = req.query;
  if (!org) return res.status(400).json({ error: "缺少 org" });
  const allowed = resolveAllowedOrgIds(dbm, db, req.user);
  if (allowed) {
    const o = dbm.listOrgs(db).find((n) => n.code === org);
    if (!o || allowed.indexOf(o.id) < 0) return res.status(403).json({ error: "无权访问该组织数据" });
  }
  res.json(dbm.listUnitBudgets(db, org));
});

/* 按事项汇总多单位（部门级预算汇总，含当期执行） */
app.get("/api/unit-summary", auth, (req, res) => {
  const { orgs, months } = req.query;
  if (!orgs) return res.status(400).json({ error: "缺少 orgs" });
  const allowed = resolveAllowedOrgIds(dbm, db, req.user);
  const orgList = String(orgs).split(",").map((s) => s.trim()).filter(Boolean);
  if (allowed) {
    const allowedCodes = new Set(dbm.listOrgs(db).filter((n) => allowed.indexOf(n.id) >= 0).map((n) => n.code));
    const filtered = orgList.filter((c) => allowedCodes.has(c));
    if (filtered.length === 0) return res.status(403).json({ error: "无权访问所请求的组织数据" });
    orgList.length = 0; orgList.push(...filtered);
  }
  const ms = months ? String(months).split(",").map((s) => parseInt(s, 10)).filter((n) => n >= 1 && n <= 12) : null;
  res.json(dbm.summaryByCat(db, orgList, ms));
});

/* 压降处理 + 注释（原因分析，保存到数据库） */
app.put("/api/unit-budgets/:id/reduction", auth, requireBaseDataEditor, (req, res) => {
  const { reduceRatio, reduceAmount, note } = req.body || {};
  const ev = dbm.updateUnitBudgetReduction(db, Number(req.params.id), { reduceRatio, reduceAmount, note });
  if (!ev) return res.status(404).json({ error: "未找到单位预算" });
  res.json(ev);
});

/* 逐月执行流水（B 路径）：查询 + 单点 upsert（财务真实导入/修正） */
app.get("/api/executions", auth, (req, res) => {
  const { org, months } = req.query;
  const allowed = resolveAllowedOrgIds(dbm, db, req.user);
  let orgId = null;
  if (org) {
    const o = dbm.orgByCode ? dbm.orgByCode(db, org) : db.prepare("SELECT id FROM organization WHERE code = ?").get(org);
    if (!o) return res.status(404).json({ error: "组织不存在" });
    if (allowed && allowed.indexOf(o.id) < 0) return res.status(403).json({ error: "无权访问该组织数据" });
    orgId = o.id;
  }
  const ms = months ? String(months).split(",").map((s) => parseInt(s, 10)).filter((n) => n >= 1 && n <= 12) : null;
  let rows = dbm.listExecutions(db, { orgId, months: ms });
  if (allowed && !org) rows = rows.filter((r) => allowed.indexOf(r.org_id) >= 0);
  res.json(rows);
});
app.put("/api/executions", auth, requireBaseDataEditor, (req, res) => {
  const { org, cat, month, amount } = req.body || {};
  if (!org || !cat || !month) return res.status(400).json({ error: "缺少 org/cat/month" });
  const monthNum = parseInt(month, 10);
  if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) return res.status(400).json({ error: "month 必须为 1–12 的整数" });
  if (typeof amount !== "number" || Number.isNaN(amount) || amount < 0) return res.status(400).json({ error: "amount 必须为非负数字" });
  const allowed = resolveAllowedOrgIds(dbm, db, req.user);
  const o = dbm.orgByCode ? dbm.orgByCode(db, org) : db.prepare("SELECT id FROM organization WHERE code = ?").get(org);
  if (!o) return res.status(404).json({ error: "组织不存在" });
  if (allowed && allowed.indexOf(o.id) < 0) return res.status(403).json({ error: "无权访问该组织数据" });
  const rec = dbm.upsertExecution(db, o.id, String(cat), monthNum, amount);
  res.json(rec);
});

/* ---------- 独立模块：费控导入（M8）/ 预算政策生成 ---------- */
buildImportModule(dbm).attach(app, db);
buildPolicyRules(dbm).attach(app, db);

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
