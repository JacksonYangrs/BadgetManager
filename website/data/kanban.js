/* ================================================================
 * data/kanban.js — 看板数据层
 * 迁移自 data/data.js（原 1486 行上帝文件，2026-09-04 拆分）
 * 依赖：organization.js、budget.js（本层最后一个加载）
 * 挂载 BM.orgTreeCache/loadOrgTree/userOrgCode/RESTRICTED_ROLES/visibleOrgCodes、
 *   periodMonths/loadKanbanData/sliceItem/kanbanAgg/orgChildren/orgCompanyCodes、
 *   baseMonthlyRatio/decomposeByRatio/parseBudgetIntent
 * ================================================================ */

(function () {
var BM = window.BM || {};

/* ================================================================
 * 预算看板数据层（2026-08-24 重构：三层时间 + 角色范围 + 双维度嵌套）
 * 纯前端确定性计算，复用既有 demo 数据：
 *   - 年度预算：BM.CATEGORIES[].budget（或 eventsData[].amount）
 *   - 已执行：BM.CATEGORIES[].monthly（前 9 月模拟实际，10~12 月为 0）
 *   - 组织范围：BM.orgTreeCache（/api/orgs/tree，无则回退扁平）
 * 不新增后端字段；上线接真实执行流水时只需替换 monthly 口径。
 * ================================================================ */

/* 组织树缓存（前端加载一次） */
BM.orgTreeCache = null;
BM.loadOrgTree = function () {
  if (BM.orgTreeCache) return Promise.resolve(BM.orgTreeCache);
  if (typeof fetch !== "function") return Promise.resolve(null);
  return BM.apiGet("/api/orgs/tree")
    .then((t) => { BM.orgTreeCache = t || []; return BM.orgTreeCache; })
    .catch(() => { BM.orgTreeCache = []; return []; });
};

/* 当前登录用户所属组织 code（用于受限角色初始定位 + 范围过滤）。
 * 真实环境来自 BM.state.user.org.code；无则返回 null（看全部根）。 */
BM.userOrgCode = function () {
  const u = BM.state && BM.state.user;
  return u && u.org && u.org.code ? u.org.code : null;
};

/* 受限角色（事业部/中心/公司/部门负责人）：看板只定位到自己组织子树，不能看全部。 */
BM.RESTRICTED_ROLES = new Set(["centerOwner", "legalHead", "companyBudgeter", "adminHead"]);

/* 角色 → 可见组织 code 集合（null = 全部）。
 * 入参 orgTree：/api/orgs/tree 结构（HQ→BU→U）。 */
BM.visibleOrgCodes = function (role, orgTree) {
  const uo = BM.USER_ORG[role];
  if (!uo) return null; /* 总经理/财务/管理员 = 全部 */
  const tree = orgTree || BM.orgTreeCache || [];
  if (uo.type === "center") {
    /* 管理中心：该 center 节点 + 其 managedCenterId 指向的单位 */
    const codes = [uo.code];
    const collectUnits = (nodes) => nodes.forEach((n) => {
      if (n.type === "unit" && n.managedCenterId === uo.code) codes.push(n.code);
      if (n.children) collectUnits(n.children);
    });
    collectUnits(tree);
    return codes;
  }
  /* 事业部：该 BU 及其子孙 code */
  const codes = [uo.code];
  const find = (nodes) => nodes.some((n) => {
    if (n.code === uo.code) { (function pushAll(x){ codes.push(x.code); (x.children||[]).forEach(pushAll); })(n); return true; }
    return n.children && find(n.children);
  });
  find(tree);
  return codes;
};

/* 周期切片：返回月度索引数组
 * period = { type:"year" } | { type:"quarter", q:1~4 } | { type:"month", m:1~12 } */
BM.periodMonths = function (period) {
  if (!period || period.type === "year") return [0,1,2,3,4,5,6,7,8,9,10,11];
  if (period.type === "quarter") { const s = (period.q - 1) * 3; return [s, s+1, s+2]; }
  if (period.type === "month") return [period.m - 1];
  return [0,1,2,3,4,5,6,7,8,9,10,11];
};

/* 看板真实数据层（2026-08-25 A+B 路径）：
 *   预算 = unit_budget.amount（真实，按 org 聚合）
 *   执行 = budget_execution 当期累计（真实）；无则 last_year×月度占比推算（标注 estimated）
 *   数据经 /api/unit-summary?orgs=&months= 一次性汇总返回。
 */

/* 拉取一组组织（org code 列表）的按事项汇总（含当期执行） */
BM.loadKanbanData = function (orgCodes, period) {
  if (!orgCodes || !orgCodes.length) return Promise.resolve([]);
  const months = BM.periodMonths(period).map((i) => i + 1); // 0-based → 1-based 月序
  const url = "/api/unit-summary?orgs=" + encodeURIComponent(orgCodes.join(",")) + "&months=" + months.join(",");
  return BM.apiGet(url).then((d) => d).catch(() => []);
};

/* 单事项当期切片聚合：预算 / 执行 / 偏差 / 执行率 / 预警（输入为真实汇总项） */
BM.sliceItem = function (cat, period) {
  const mIdx = BM.periodMonths(period); // 0-based 索引
  const monthly = cat.monthly && cat.monthly.length === 12 ? cat.monthly : new Array(12).fill(0);
  const budget = mIdx.reduce((a, i) => a + (monthly[i] || 0), 0);  // 当期预算累计
  const exec = cat.exec != null ? cat.exec : 0;                     // 当期执行累计（后端已按 months 切）
  const dev = exec - budget;
  const rate = budget ? (exec / budget) : (exec > 0 ? 1 : 0);
  let warn = "ok";
  if (rate > 1) warn = "danger";
  else if (rate >= 0.9) warn = "warn";
  return {
    budget: budget, exec: exec, dev: dev,
    rate: Math.round(rate * 1000) / 10,
    warn: warn, estimated: !!cat.execEstimated,
    devPct: budget ? Math.round((dev / budget) * 1000) / 10 : 0,
  };
};

/* 看板聚合：给定真实汇总事项列表 + 周期 + 维度，返回分组卡片数据
 * dim = "event"（按经济事项 cat）| "account"（按财务科目 acctCode） */
BM.kanbanAgg = function (list, period, dim) {
  const map = {};
  list.forEach((cat) => {
    const key = dim === "account" ? (cat.acctCode || "—") : cat.cat;
    if (!map[key]) map[key] = { key: key, items: [], budget: 0, exec: 0, estimated: false };
    const sl = BM.sliceItem(cat, period);
    map[key].items.push({ name: cat.cat, accountCode: cat.acctCode, slice: sl });
    map[key].budget += sl.budget;
    map[key].exec += sl.exec;
    if (cat.execEstimated) map[key].estimated = true;
  });
  return Object.keys(map).map((k) => {
    const g = map[k];
    const dev = g.exec - g.budget;
    const rate = g.budget ? (g.exec / g.budget) : (g.exec > 0 ? 1 : 0);
    let warn = "ok";
    if (rate > 1) warn = "danger"; else if (rate >= 0.9) warn = "warn";
    return {
      key: k, items: g.items, budget: g.budget, exec: g.exec, dev: dev,
      rate: Math.round(rate * 1000) / 10, estimated: g.estimated,
      warn: warn,
      devPct: g.budget ? Math.round((dev / g.budget) * 1000) / 10 : 0,
    };
  }).sort((a, b) => b.budget - a.budget);
};

/* 组织节点列表（用于看板"组织视角"下钻）：返回当前范围内可直接展示的节点
 * 入参 rootCode：当前所处组织节点 code（null = 根 HQ）；返回其直接子节点 + 汇总 */
BM.orgChildren = function (rootCode, orgTree) {
  const tree = orgTree || BM.orgTreeCache || [];
  if (!rootCode) return tree;
  let found = null;
  const find = (nodes) => nodes.some((n) => {
    if (n.code === rootCode) { found = n; return true; }
    return n.children && find(n.children);
  });
  find(tree);
  return found ? (found.children || []) : [];
};

/* 返回某组织节点下属全部"公司/单位"(type=unit) 的 code 列表（用于拉真实 unit_budget 汇总）
 * 规则：
 *   - group(HQ) / 无 rootCode：返回全部 company 单位（parent_id=1 的真实子公司）
 *   - 某 BU 节点：返回 buCode 命中的全部单位 code
 *   - 某 center 节点：返回 managedCenterId 命中的全部单位 code
 *   - 某 unit 公司自身：返回 [自己.code]
 *   - 其他（dept）：返回其子孙单位 code
 * 入参 rootCode：当前组织节点 code（null=HQ 全部） */
BM.orgCompanyCodes = function (rootCode, orgTree) {
  const tree = orgTree || BM.orgTreeCache || [];
  const flat = [];
  const walk = (nodes) => nodes.forEach((n) => { flat.push(n); if (n.children) walk(n.children); });
  walk(tree);
  if (!rootCode) {
    return flat.filter((n) => n.type === "unit").map((n) => n.code);
  }
  let node = null;
  const find = (nodes) => nodes.some((n) => { if (n.code === rootCode) { node = n; return true; } return n.children && find(n.children); });
  find(tree);
  if (!node) return [];
  if (node.type === "unit" && !/^(BU|MC)-/.test(node.code)) return [node.code];
  /* BU 节点：用其 code（BU-xx）匹配下属公司的 buCode 字段 */
  if (/^BU-/.test(node.code)) return flat.filter((n) => n.type === "unit" && n.buCode === node.code).map((n) => n.code);
  if (node.type === "center" || /^MC-/.test(node.code)) return flat.filter((n) => n.type === "unit" && n.managedCenterId === node.code).map((n) => n.code);
  /* dept 或其他：其子孙单位 */
  const subs = [];
  const collect = (n) => { if (n.type === "unit") subs.push(n.code); (n.children || []).forEach(collect); };
  collect(node);
  return subs;
};

/* ---------- 月度拆解：上年实际执行占比模式（确定性 mock，待费控导入真实月度） ---------- */
BM.baseMonthlyRatio = [0.07, 0.06, 0.08, 0.07, 0.08, 0.09, 0.08, 0.09, 0.1, 0.09, 0.1, 0.09]; /* 和 = 1.00 */
/* 按占比拆解总额，尾差冲正保证和 = 总额 */
BM.decomposeByRatio = function (total, ratio) {
  const base = ratio.map((p) => Math.round(total * p));
  const sum = base.reduce((a, b) => a + b, 0);
  base[11] += (total || 0) - sum;
  return base;
};

/* ---------- LLM 归类模拟（自上而下自由语言 → 结构化） ---------- */
/* 输入："车辆维修 120 万、IT 设备 80 万、显示器项目 7.8 万、办公用品 60 万"
 * 返回 [{ type: 'cat'|'project'|'material', id, name, amount }] */
BM.parseBudgetIntent = function (text) {
  const items = [];
  /* 按顿号/逗号/换行/句号分割子句 */
  const clauses = String(text).split(/[、，,。；;\n]+/).map((s) => s.trim()).filter(Boolean);

  clauses.forEach((clause) => {
    /* 提取金额：数字 + 万/万元/千元 */
    const m = clause.match(/(\d+(?:\.\d+)?)\s*(万元|万|千元|元|块)?/);
    if (!m) return;
    let amount = parseFloat(m[1]);
    const unit = m[2] || "";
    if (unit.indexOf("万") >= 0) amount *= 10000;
    else if (unit.indexOf("千") >= 0) amount *= 1000;
    amount = Math.round(amount);

    const rest = clause.replace(m[0], "").trim();

    /* 优先匹配物料名 */
    const mat = BM.MATERIALS.find((x) => rest.indexOf(x.name) >= 0);
    if (mat) {
      items.push({ type: "material", id: mat.id, name: mat.name, amount, catId: mat.catId, projectId: mat.projectId });
      return;
    }
    /* 其次匹配项目名 */
    const proj = BM.PROJECTS.find((x) => rest.indexOf(x.name) >= 0 || x.name.indexOf(rest) >= 0);
    if (proj) {
      items.push({ type: "project", id: proj.id, name: proj.name, amount, catId: proj.catId, deptId: proj.deptId });
      return;
    }
    /* 其次匹配科目 */
    const cat = BM.CATEGORIES.find((x) => rest.indexOf(x.name) >= 0 || x.name.indexOf(rest) >= 0);
    if (cat) {
      items.push({ type: "cat", id: cat.id, name: cat.name, amount });
      return;
    }
    /* 未识别 */
    items.push({ type: "unknown", id: null, name: rest || clause, amount, note: "未匹配到科目/项目/物料" });
  });

  return items;
};

window.BM = BM;
})();
