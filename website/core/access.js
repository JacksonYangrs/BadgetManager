/* ================================================================
 * core/access.js — 查询与权限
 * 迁移自 core/state.js（原 803 行上帝文件，2026-09-04 拆分）
 * 依赖：core/state.js（先于本文件加载）
 * 职责：getCatBudget/getCatUsed/getCatFrozen/getCatRemain/getCatExecRate、
 *   scopeDeptIds/scopedDocs/scopedData/scopedApprovals、
 *   roleViews/canEditBaseData/canEditAccounts/canEditOrg/canViewBenchmark/NAV_LABELS、
 *   login/curRole/getApprovalChain
 * 说明：本文件不重绑 state 变量，仅读写 BM.state 属性（loadState/resetState 保证 BM.state 恒指向当前状态对象）。
 * ================================================================ */

(function () {
var BM = window.BM || {};

/* ================= 预算访问（考虑调剂） ================= */

/* 返回科目当前可用预算（原预算 + 调入 - 调出） */
BM.getCatBudget = function (catId) {
  const cat = BM.CATEGORIES.find((c) => c.id === catId);
  if (!cat) return 0;
  let adj = 0;
  Object.keys(BM.state.transfers).forEach((k) => {
    if (k.startsWith("in:" + catId)) adj += BM.state.transfers[k];
    if (k.startsWith("out:" + catId)) adj -= BM.state.transfers[k];
  });
  return cat.budget + adj;
};

BM.getCatUsed = function (catId) {
  const cat = BM.CATEGORIES.find((c) => c.id === catId);
  return cat ? cat.used : 0;
};

BM.getCatFrozen = function (catId) {
  const cat = BM.CATEGORIES.find((c) => c.id === catId);
  return cat ? cat.frozen : 0;
};

BM.getCatRemain = function (catId) {
  return BM.getCatBudget(catId) - BM.getCatUsed(catId) - BM.getCatFrozen(catId);
};

BM.getCatExecRate = function (catId) {
  const b = BM.getCatBudget(catId);
  return b ? Math.round((BM.getCatUsed(catId) / b) * 1000) / 10 : 0;
};

/* ================= 审批链计算 ================= */
BM.getApprovalChain = function (amount) {
  const rule = BM.APPROVAL_RULES.find((r) => amount <= r.max);
  return rule ? rule.chain : BM.APPROVAL_RULES[BM.APPROVAL_RULES.length - 1].chain;
};

/* ================================================================
 * v0.2：角色 / 权限 / 编制 / 决算
 * ================================================================ */

/* ---------- 登录 ---------- */
/* 演示/快捷通道：不经过后端认证，直接以指定角色进入（?as= 参数、开发期演示）。
 * 构造一个本地 user 对象，让 roleViews 等按用户角色逻辑一致工作。 */
BM.login = function (roleId, deptId) {
  BM.state.role = roleId;
  BM.state.deptId = deptId || "admin";
  const r = BM.ROLES[roleId] || {};
  BM.state.user = {
    id: 0,
    username: "demo:" + roleId,
    realName: r.title || r.name || roleId,
    org: null,
    roles: [{ code: roleId, name: r.name || roleId, desc: r.desc || "", views: ["wb-home", "compile", "kanban", "rules"], scope: r.scope || "all" }],
  };
  BM.state.token = null;
  BM.state.loggedIn = true;
  BM.saveState();
};

/* 认证与统一请求层（apiLogin / apiFetch / apiGet / apiSend / handleSessionExpired / logout）
 * 已抽取到 core/api.js（共享内核，桌面端与移动端复用），保持单一真源。 */

/* 当前角色信息 */
BM.curRole = function () {
  return BM.ROLES[BM.state.role] || BM.ROLES.ceo;
};

/* ---------- 可见页面（按角色） ---------- */
/* v0.4：采购项目并入预算总览双视图，不再单独菜单
 * 阶段一：扩展真实角色视图集合（映射文档 §3）。视图 key 复用现有 14 视图；
 *   masterData/归口责任工作台/压降下达/协商谈判区/auditTrail/copilot 为待建（Stage 1 不实现）。
 * 导航收敛（2026-08-23 Sponsor 定稿，2026-08-24 移除组织架构菜单项）：全角色仅 3 个核心功能 + 工作台首页：
 *   1. 预算编制（compile） 2. 预算跟踪（kanban） 3. 预算规划（rules，规则为其内容）。
 *   费控导入（importView）不作为菜单项，改为「预算跟踪」页右上角按钮弹出的二级子页面。
 *   系统管理员（admin）额外：预算工作人员（accounts）。
 *   组织架构图保留在「基础数据」页第 3 个 Tab（可编辑，admin/总经办），不再作为独立菜单项。
 * 模块三（2026-08-23）：真实登录用户按其角色 views 白名单取并集；演示通道（无 user）回退默认集合。 */
/* 导航固定顺序（ roleViews 返回的数组按此排序，确保「预算调整」紧跟「预算编制」之后）。 */
const NAV_ORDER = ["wb-home", "dashboard", "compile", "balance", "kanban", "rules", "track", "final", "adjust", "basedata", "accounts", "ai-config", "benchmark", "collision", "collisionTune", "importView", "riskView"];

BM.roleViews = function (roleId) {
  /* 汇总平衡：仅集团管理层可见（能看 balance）。
   * 上级集合与 canViewBenchmark 一致：ceo/cooLead/cooAnalyst。 */
  const UPPER = ["ceo", "cooLead", "cooAnalyst"];
  /* 基础数据维护角色（真实登录与演示通道共用，提升到函数作用域供下方两分支引用） */
  const BD_ROLES = ["admin", "cooAnalyst", "cooLead", "centerOwner"];
  /* 真实登录：取该用户全部角色的视图并集（views 来自后端 role 表，含 basedata 迁移），
   * 并兜底基础视图集合 BASE，确保 compile/kanban/rules 始终可见（与演示通道行为一致）。 */
  if (BM.state.user && BM.state.user.roles && BM.state.user.roles.length && !roleId) {
    const BASE = ["wb-home", "compile", "kanban", "rules"];
    const set = new Set(BASE);
    BM.state.user.roles.forEach((r) => (r.views || []).forEach((v) => set.add(v)));
    if (BM.state.user.roles.some((r) => BD_ROLES.includes(r.code))) set.add("basedata");
    if (BM.state.user.roles.some((r) => r.code === "admin")) set.add("accounts");
    if (BM.state.user.roles.some((r) => ["admin", "cooAnalyst"].includes(r.code))) set.add("ai-config");
    if (BM.state.user.roles.some((r) => UPPER.includes(r.code))) set.add("balance");
    return Array.from(set).sort((a, b) => NAV_ORDER.indexOf(a) - NAV_ORDER.indexOf(b));
  }
  /* 演示通道 / 显式指定角色：按角色 code 回退（与后端 role.views 对齐）。
   * importView（费控导入）不作为菜单项（见上方注释），仅经「预算跟踪」页按钮二级弹窗进入，故不入 BASE。 */
  const rid = roleId || BM.state.role;
  const extra = BD_ROLES.includes(rid) ? ["basedata"] : [];
  if (UPPER.includes(rid) && rid !== "admin") {
    const arr = ["wb-home", "compile", "balance", "kanban", "rules"].concat(extra);
    if (rid === "cooAnalyst") arr.push("ai-config");
    return arr;
  }
  if (rid === "admin") return ["wb-home", "compile", "kanban", "rules", "accounts", "ai-config"].concat(extra);
  return ["wb-home", "compile", "kanban", "rules"].concat(extra);
};

/* 基础数据维护权限（前端闸门，与后端 requireBaseDataEditor 对齐）：
 * 管理员 / 总经办预算管理员 / 总经办负责人 / 职能中心归口责任人 可编辑。 */
BM.canEditBaseData = function () {
  const BD = ["admin", "cooAnalyst", "cooLead", "centerOwner"];
  if (BM.state.user && BM.state.user.roles && BM.state.user.roles.length) {
    return BM.state.user.roles.some((r) => BD.includes(r.code));
  }
  return BD.includes(BM.state.role);
};

/* 预算工作人员（用户账户）维护权限闸门：管理员 / 总经办 / 归口责任人 / 集团 CEO（与后端 requireAccountsEditor 对齐） */
BM.canEditAccounts = function () {
  const AC = ["admin", "cooAnalyst", "cooLead", "centerOwner", "ceo"];
  if (BM.state.user && BM.state.user.roles && BM.state.user.roles.length) {
    return BM.state.user.roles.some((r) => AC.includes(r.code));
  }
  return AC.includes(BM.state.role);
};

/* 组织架构维护权限（前端闸门，与后端 requireOrgEditor 对齐）：
 * 管理员 / 总经办负责人 / 总经办预算管理员 可编辑；财务经理 / 归口责任人仅查看。 */
BM.canEditOrg = function () {
  const ORG = ["admin", "cooLead", "cooAnalyst"];
  if (BM.state.user && BM.state.user.roles && BM.state.user.roles.length) {
    return BM.state.user.roles.some((r) => ORG.includes(r.code));
  }
  return ORG.includes(BM.state.role);
};

/* 横向对标（benchmark）可见性：仅集团层（直接上级）可见；同级（兄弟单位）/ 下级不得查看。
 * 对应 Sponsor 约束「横向比较 功能只能给更高一级的领导或部门」。看板·总揽面板据此显隐对标子面板。 */
BM.canViewBenchmark = function (roleId) {
  const r = roleId || BM.state.role;
  return r === "ceo" || r === "cooLead" || r === "cooAnalyst";
};

/* 导航标签 */
BM.NAV_LABELS = {
  "wb-home": "工作台首页",
  dashboard: "预算总览",
  /* details 已移除（v0.6） */
  approval: "审批中心",
  decisions: "决策中心",
  track: "预算追踪",
  final: "决算",
  adjust: "预算调整",
  rules: "预算规划",
  basedata: "基础数据",
  accounts: "预算工作人员",
  "ai-config": "AI 配置",
  benchmark: "对标",
  collision: "碰撞",
  collisionTune: "碰撞调参",
  compile: "预算编制",
  balance: "预算调整",
  kanban: "预算跟踪",
  importView: "费控导入",
  riskView: "AI 风险",
};

/* ---------- 数据范围过滤 ---------- */
/* 当前角色可见的部门 id 集合（null = 全部；范围统一由 BM.scopedData 承担） */
BM.scopeDeptIds = function () {
  /* 数据范围走 BM.scopedData（按公司/中心/本人项目），部门维度返回 null（全局）作为保守默认。 */
  return null;
};

/* 可见单据：范围过滤 */
BM.scopedDocs = function () {
  const depts = BM.scopeDeptIds();
  if (!depts) return BM.DOCS;
  return BM.DOCS.filter((d) => depts.indexOf(d.deptId) >= 0);
};

/* ================================================================
 * 阶段一：数据范围描述（V2 §2.2 权限原则）
 * 返回 { level, companyId, centerId, expenseType, subjectFilter }
 *   group=集团全量；company=本公司+下属；center=归口科目跨公司；self=仅本人项目
 * 供 dashboard 维度切换 / compile 双轨 / 各视图按角色裁剪数据使用。
 * ================================================================ */
BM.scopedData = function () {
  const r = BM.state.role;
  const level = (BM.SCOPE_LEVELS && BM.SCOPE_LEVELS[r]) || "group";
  const out = { level: level, companyId: null, centerId: null, expenseType: null, subjectFilter: null };
  if (level === "company") {
    out.companyId = BM.state.scopeCompany || "2010";
  } else if (level === "center") {
    out.centerId = BM.state.centerId || "hr";
    out.center = (BM.FUNCTIONAL_CENTERS || []).find((c) => c.id === out.centerId);
    out.subjectFilter = out.center ? out.center.subjects : null;
  } else if (level === "self") {
    out.expenseType = BM.state.expenseType || "canteen";
    const et = (BM.EXPENSE_TYPES || []).find((x) => x.id === out.expenseType);
    out.subjectFilter = et ? et.subjects : null;
  }
  return out;
};

/* 可见审批单：按角色范围过滤
 * 集团层=全量；法人公司层=本公司（TODO 多公司隔离，mock 暂全量）；
 * 归口=仅归口科目（TODO 按 subjectFilter 过滤 catName）；基层=本人发起。 */
BM.scopedApprovals = function () {
  const r = BM.state.role;
  if (r === "ceo" || r === "cooLead" || r === "cooAnalyst") return BM.state.approvals;
  if (r === "legalHead" || r === "adminHead" || r === "companyBudgeter") {
    /* TODO（V2 §8-14）：法人公司数据是否可被横向查看未确认；mock 暂全量，后续按 scopeCompany 过滤 */
    return BM.state.approvals;
  }
  if (r === "centerOwner") {
    const subs = BM.scopedData().subjectFilter || [];
    if (!subs.length) return BM.state.approvals;
    return BM.state.approvals.filter((a) => subs.indexOf(a.catName) >= 0);
  }
  if (r === "expense") {
    return BM.state.approvals.filter((a) => a.requester);
  }
  return BM.state.approvals;
};

window.BM = BM;
})();
