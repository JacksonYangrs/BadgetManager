/* ================================================================
 * data.js — Mock 数据（有故事的模拟企业）
 * 模拟企业：约 300 人规模，演示时点 = 2026 年 9 月
 * ================================================================ */

var BM = window.BM || {};
BM.DEMO_DATE = "2026-09-15"; // 演示时点：9 月中旬
BM.YEAR = 2026;

/* ---------- 二级组织架构（v0.5） ---------- */
/* 一级中心 → 二级部门（多级部门递归，demo 做二级） */
BM.ORGS = [
  { id: "O1", name: "行政中心", parentId: null },
  { id: "O2", name: "业务中心", parentId: null },
];

/* ---------- 部门（挂一级中心 orgId） ---------- */
BM.DEPTS = [
  { id: "admin", name: "行政部", head: "王敏", orgId: "O1" },
  { id: "it", name: "IT 部", head: "陈凯", orgId: "O1" },
  { id: "finance", name: "财务部", head: "李静", orgId: "O1" },
  { id: "market", name: "市场部", head: "赵磊", orgId: "O2" },
  { id: "sales", name: "销售部", head: "孙悦", orgId: "O2" },
  { id: "hr", name: "人事部", head: "周芳", orgId: "O2" },
];

/* ---------- 角色 ---------- */
BM.ROLES = {
  boss: {
    id: "boss",
    name: "总经理",
    title: "张明远",
    desc: "全局决策 · 审批 · 决算",
    scope: "all",
  },
  manager: {
    id: "manager",
    name: "部门经理",
    title: "王敏（行政部）",
    desc: "本部门编制 · 追踪 · 审批",
    scope: "dept",
  },
  staff: {
    id: "staff",
    name: "员工",
    title: "张伟（IT 部）",
    desc: "负责采购项目 · 发起采购 / 报销",
    scope: "self",
  },
  finance: {
    id: "finance",
    name: "财务经理",
    title: "李静",
    desc: "预算总控 · 汇总 · 调整 · 决算",
    scope: "all",
  },
};

/* ---------- 预算科目（年度预算单位：元） ---------- */
/* monthly = 1-9 月已执行金额；已用 = 月度求和 */
BM.CATEGORIES = [
  {
    id: "vehicle",
    name: "车辆维修",
    budget: 1200000,
    monthly: [88000, 92000, 95000, 98000, 102000, 118000, 128000, 135000, 132000],
    frozen: 0,
    suppliers: ["路通汽修", "鑫源汽配"],
    forecast: { status: "danger", label: "预计 11 月超支 18%", detail: "近 3 月出现 2 笔大额维修单，维修单价环比 +9%，按当前趋势预计 11 月执行率破 100%，年底超支约 18%。" },
  },
  {
    id: "it",
    name: "IT 设备",
    budget: 800000,
    monthly: [50000, 44000, 56000, 60000, 64000, 70000, 116000, 96000, 82000],
    frozen: 380000, // 服务器扩容 22 万 + 网络设备升级 16 万（在途）
    suppliers: ["华联电子", "未来数码"],
    forecast: { status: "danger", label: "预计超支 35%", detail: "已用 + 冻结 101.8 万已超年度预算 27%；8 月集中采购服务器并新增网络设备升级，含在途 38 万，按现有申请预计超支 35%。" },
  },
  {
    id: "office",
    name: "办公用品",
    budget: 700000,
    monthly: [48000, 51000, 54000, 57000, 59000, 61000, 63000, 66000, 67000],
    frozen: 0,
    suppliers: ["晨光办公", "得力办公"],
    forecast: { status: "ok", label: "同比 +22%，属合理增长", detail: "员工 +28%、打印量 +41%、会议 +35% 驱动，预计全年贴近预算，无超支风险。" },
  },
  {
    id: "property",
    name: "物业费",
    budget: 2000000,
    monthly: [146000, 147000, 147000, 148000, 147000, 147000, 148000, 146000, 147000],
    frozen: 0,
    suppliers: ["恒信物业"],
    forecast: { status: "ok", label: "预计节余 12%", detail: "全年执行平稳，预计年底节余约 24 万元（12%），可作调剂储备。" },
  },
  {
    id: "training",
    name: "培训费",
    budget: 1000000,
    monthly: [98000, 86000, 90000, 82000, 56000, 48000, 42000, 41000, 37000],
    frozen: 0,
    suppliers: ["智学教育", "领航咨询"],
    forecast: { status: "warn", label: "预计节余 30%，执行偏低", detail: "下半年培训计划放缓，预计全年执行率约 70%，节余约 30 万元，具备调剂空间。" },
  },
  {
    id: "travel",
    name: "差旅费",
    budget: 500000,
    monthly: [42000, 38000, 45000, 41000, 44000, 47000, 43000, 41000, 39000],
    frozen: 0,
    suppliers: ["携程商旅"],
    forecast: { status: "ok", label: "预计正常结余", detail: "执行节奏平稳，预计全年执行率约 92%。" },
  },
  {
    id: "utility",
    name: "水电费",
    budget: 360000,
    monthly: [27000, 28000, 29000, 31000, 33000, 36000, 37000, 35000, 30000],
    frozen: 0,
    suppliers: ["市供电局", "市水务集团"],
    forecast: { status: "ok", label: "预计正常结余", detail: "夏季高峰已过，预计全年执行率约 93%。" },
  },
  {
    id: "entertain",
    name: "业务招待",
    budget: 400000,
    monthly: [33000, 35000, 34000, 36000, 35000, 37000, 36000, 34000, 33000],
    frozen: 0,
    suppliers: ["粤香楼", "半岛酒店"],
    forecast: { status: "ok", label: "预计正常结余", detail: "执行平稳，预计全年执行率约 91%。" },
  },
];

/* 计算各科目已用金额 */
BM.CATEGORIES.forEach((c) => {
  c.used = c.monthly.reduce((a, b) => a + b, 0);
  c.usedFrozen = c.used + c.frozen;
});

/* ---------- 单据流水（1-9 月，确定性生成 ~190 条） ---------- */
(function buildDocs() {
  const docs = [];
  let seq = 1;
  const deptPool = {
    vehicle: ["admin", "sales", "market"],
    it: ["it", "finance", "sales"],
    office: ["admin", "hr", "finance", "market", "sales"],
    property: ["admin"],
    training: ["hr", "admin", "it", "market"],
    travel: ["sales", "market", "admin", "it", "finance"],
    utility: ["admin", "finance", "it"],
    entertain: ["market", "sales", "admin"],
  };
  const descPool = {
    vehicle: ["车辆保养", "轮胎更换", "发动机维修", "保险杠修复", "变速箱检修", "制动系统维修"],
    it: ["显示器采购", "笔记本电脑采购", "服务器扩容", "办公电脑更换", "网络设备升级", "打印机耗材"],
    office: ["打印纸采购", "办公文具采购", "硒鼓墨盒", "会议用品", "办公耗材", "前台物料"],
    property: ["物业管理费", "保洁服务费", "安保服务费", "绿化维护费"],
    training: ["内训课程", "管理培训", "专业技能认证", "团建拓展", "外部讲师费"],
    travel: ["机票", "高铁票", "酒店住宿", "出差补贴"],
    utility: ["电费", "水费", "燃气费"],
    entertain: ["客户宴请", "商务茶歇", "合作方接待"],
  };
  const typePool = ["报销", "采购", "合同付款"];
  const statusPool = ["已付款", "已付款", "已付款", "已付款", "审批中"];

  BM.CATEGORIES.forEach((cat) => {
    const pool = deptPool[cat.id] || ["admin"];
    const descs = descPool[cat.id] || [cat.name];
    cat.monthly.forEach((target, idx) => {
      const month = idx + 1;
      const nParts = month % 3 === 0 ? 3 : 2; // 每月 2-3 笔
      const ratios = nParts === 2 ? [0.55, 0.45] : [0.4, 0.33, 0.27];
      ratios.forEach((ratio, j) => {
        const amount = Math.round((target * ratio) / 100) * 100;
        const day = (month * 7 + j * 11 + 3) % 28 + 1;
        docs.push({
          id: "DOC" + String(seq++).padStart(4, "0"),
          date: `${BM.YEAR}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          type: typePool[(seq + j) % typePool.length],
          catId: cat.id,
          catName: cat.name,
          deptId: pool[(seq + month) % pool.length],
          supplier: cat.suppliers[(seq + j) % cat.suppliers.length],
          amount,
          desc: descs[(seq + j) % descs.length],
          status: statusPool[(seq + month + j) % statusPool.length],
        });
      });
    });
  });
  BM.DOCS = docs;
})();

/* ---------- 审批路由规则（AI 自动判断审批人） ---------- */
BM.APPROVAL_RULES = [
  { max: 5000, chain: ["部门负责人"] },
  { max: 30000, chain: ["部门负责人", "财务审批"] },
  { max: Infinity, chain: ["部门负责人", "财务审批", "总经理"] },
];

/* ---------- 预置审批单（审批中心初始数据） ---------- */
BM.APPROVALS = [
  {
    id: "APR001",
    title: "服务器扩容采购",
    catName: "IT 设备",
    deptName: "IT 部",
    supplier: "华联电子",
    amount: 220000,
    date: "2026-09-02",
    status: "pending", // pending 审批中 / approved / rejected
    ai: {
      verdict: "review", // pass / reject / review
      text: "预算检查：IT 设备已用 + 冻结超出年度预算，本次采购建议人工复核预算调剂方案后再放行；供应商为历史常用供应商，价格与市场持平。",
    },
  },
  {
    id: "APR002",
    title: "网络设备升级采购",
    catName: "IT 设备",
    deptName: "IT 部",
    supplier: "未来数码",
    amount: 160000,
    date: "2026-09-08",
    status: "pending",
    ai: {
      verdict: "review",
      text: "预算检查：超出年度预算。AI 建议先从培训费调剂 30 万元至 IT 设备预算，调剂完成后再执行本单；供应商为历史供应商，价格低于市场均价 4%。",
    },
  },
  {
    id: "APR003",
    title: "季度办公用品集中采购",
    catName: "办公用品",
    deptName: "行政部",
    supplier: "晨光办公",
    amount: 68000,
    date: "2026-09-10",
    status: "pending",
    ai: {
      verdict: "pass",
      text: "预算充足（剩余 17.4 万）；供应商为季度框架供应商，价格较上季度 +0.8%；符合采购频次，建议通过。",
    },
  },
  {
    id: "APR004",
    title: "异地团建住宿费报销",
    catName: "培训费",
    deptName: "人事部",
    supplier: "半岛酒店",
    amount: 26000,
    date: "2026-09-12",
    status: "pending",
    ai: {
      verdict: "reject",
      text: "住宿标准超差旅标准 1.4 倍，且未附审批单。建议驳回并提示补交『外出活动审批单』，按标准限额 1.5 万重报。",
    },
  },
  /* v0.4：员工（张伟）发起的申请，保证员工审批中心非空 */
  {
    id: "APR005",
    title: "显示器采购申请（10 台）",
    catName: "IT 设备",
    deptName: "IT 部",
    supplier: "未来数码",
    amount: 78000,
    date: "2026-09-10",
    status: "pending",
    requester: "员工 · 张伟",
    projectName: "显示器批量采购（10 台）",
    ai: {
      verdict: "pass",
      text: "项目「显示器批量采购」预算充足（剩余 2.4 万 + 待调剂 30 万），供应商价格低于市场均价 4%，AI 建议通过。",
    },
  },
  {
    id: "APR006",
    title: "办公椅报销申请",
    catName: "办公用品",
    deptName: "IT 部",
    supplier: "晨光办公",
    amount: 1800,
    date: "2026-09-13",
    status: "pending",
    requester: "员工 · 张伟",
    projectName: "办公电脑更换（30 台）",
    ai: {
      verdict: "pass",
      text: "金额 1800 元，小额报销走快速通道；办公用品预算充足，AI 建议通过。",
    },
  },
];

/* ---------- 预置 AI 建议（决策中心初始数据） ---------- */
BM.SUGGESTIONS = [
  {
    id: "SUG001",
    type: "调剂",
    typeLabel: "预算调剂",
    title: "培训费调剂 30 万元至 IT 设备预算",
    desc: "培训费预计节余 30%（约 30 万），IT 设备已用 + 冻结超预算 35%。建议调剂后缓解 IT 采购缺口，且不影响培训核心课程。",
    impact: [{ text: "IT 设备超支从 35% 降至 4%", cls: "ok" }, { text: "培训核心课程覆盖率保持 90%", cls: "warn" }],
    status: "pending", // pending / adopted / ignored
    source: "AI 主动发现 · 2026-09-14",
  },
  {
    id: "SUG002",
    type: "集采",
    typeLabel: "统一供应商",
    title: "办公用品统一为晨光办公框架供应商",
    desc: "当前办公用品分散在 2 家供应商，统一后按年度用量可获阶梯折扣，预计降低采购成本 8%。",
    impact: [{ text: "预计年降本约 4.8 万元", cls: "ok" }, { text: "需签订年度框架协议", cls: "warn" }],
    status: "pending",
    source: "AI 成本分析 · 2026-09-13",
  },
  {
    id: "SUG003",
    type: "周期",
    typeLabel: "采购周期优化",
    title: "打印纸采购周期由每周一次调整为每月一次",
    desc: "打印纸用量稳定，周采购导致配送成本与库存重复占用。调整为月度采购后，预计物流与采购管理成本下降。",
    impact: [{ text: "采购管理成本 -15%", cls: "ok" }],
    status: "pending",
    source: "AI 采购行为分析 · 2026-09-12",
  },
  {
    id: "SUG004",
    type: "比价",
    typeLabel: "供应商比价",
    title: "车辆维修引入第三家供应商比价",
    desc: "近 3 月维修单价环比 +9%，建议引入备选供应商比价，重点核查大额维修单（制动系统、变速箱）。",
    impact: [{ text: "预计维修单价回落 6-9%", cls: "ok" }, { text: "需行政部 2 周内完成比价", cls: "warn" }],
    status: "ignored",
    source: "AI 成本监控 · 2026-09-10",
  },
];

/* ---------- 预置剧本（推荐问题） ---------- */
BM.SUGGESTED_QUESTIONS = [
  "哪个部门今年最容易超预算？",
  "我负责的项目还剩多少预算？",
  "我要采购 10 台显示器",
];

/* ---------- 今日风险（欢迎态主动推送） ---------- */
BM.RISKS = [
  { catId: "it", text: "IT 设备已用 + 冻结超出年度预算，预计超支 35%", sub: "8 月集中采购所致 · 含在途 40 万", level: "danger" },
  { catId: "vehicle", text: "车辆维修按当前趋势预计 11 月超支 18%", sub: "维修单价环比 +9% · 2 笔大额维修单", level: "danger" },
  { catId: "training", text: "培训费执行偏低，预计节余 30%（约 30 万）", sub: "可调剂给 IT 设备等紧张科目", level: "warn" },
  { catId: "office", text: "办公用品同比 +22%：员工 +28% / 打印 +41% / 会议 +35%", sub: "AI 判定为合理增长", level: "info" },
];

/* ---------- 概览统计 ---------- */
BM.SUMMARY = (function () {
  const totalBudget = BM.CATEGORIES.reduce((a, c) => a + c.budget, 0);
  const totalUsed = BM.CATEGORIES.reduce((a, c) => a + c.used, 0);
  const totalFrozen = BM.CATEGORIES.reduce((a, c) => a + c.frozen, 0);
  const totalRemain = totalBudget - totalUsed - totalFrozen;
  return {
    totalBudget,
    totalUsed,
    totalFrozen,
    totalRemain,
    execRate: Math.round((totalUsed / totalBudget) * 1000) / 10,
  };
})();

/* ================================================================
 * v0.3 增量：采购项目颗粒度 / 预算调整 / 角色说明
 * ================================================================ */

/* ---------- 采购项目（预算最小颗粒度） ---------- */
/* owner: 负责人姓名；ownerRole: 负责人角色 */
BM.PROJECTS = [
  { id: "P001", name: "办公电脑更换（30 台）", deptId: "it", catId: "it", budget: 300000, used: 0, frozen: 0, owner: "张伟", ownerRole: "staff", status: "执行中", desc: "按年度更换老旧办公电脑" },
  { id: "P002", name: "显示器批量采购（10 台）", deptId: "it", catId: "it", budget: 78000, used: 42000, frozen: 12000, owner: "张伟", ownerRole: "staff", status: "执行中", desc: "新员工办公显示器补充" },
  { id: "P003", name: "服务器扩容采购", deptId: "it", catId: "it", budget: 220000, used: 0, frozen: 220000, owner: "陈凯", ownerRole: "manager", status: "审批中", desc: "业务系统扩容" },
  { id: "P004", name: "网络设备升级", deptId: "it", catId: "it", budget: 160000, used: 0, frozen: 160000, owner: "陈凯", ownerRole: "manager", status: "审批中", desc: "办公网络升级改造" },
  { id: "P005", name: "公务车维修保养", deptId: "admin", catId: "vehicle", budget: 300000, used: 186000, frozen: 0, owner: "王敏", ownerRole: "manager", status: "执行中", desc: "6 辆公务车年度维保" },
  { id: "P006", name: "季度办公用品集采", deptId: "admin", catId: "office", budget: 250000, used: 148000, frozen: 0, owner: "王敏", ownerRole: "manager", status: "执行中", desc: "办公耗材季度框架采购" },
  { id: "P007", name: "年度培训计划", deptId: "hr", catId: "training", budget: 350000, used: 210000, frozen: 0, owner: "周芳", ownerRole: "manager", status: "执行中", desc: "全员技能与管理培训" },
  { id: "P008", name: "管理干部集训营", deptId: "hr", catId: "training", budget: 150000, used: 62000, frozen: 0, owner: "周芳", ownerRole: "manager", status: "执行中", desc: "中层管理能力提升" },
  { id: "P009", name: "办公环境物业维护", deptId: "admin", catId: "property", budget: 2000000, used: 1323000, frozen: 0, owner: "王敏", ownerRole: "manager", status: "执行中", desc: "办公楼物业与保洁服务" },
  { id: "P010", name: "市场推广物料制作", deptId: "market", catId: "office", budget: 80000, used: 45000, frozen: 0, owner: "赵磊", ownerRole: "manager", status: "执行中", desc: "展会与活动物料" },
];

/* 计算项目已用/冻结（与单据流水关联：按项目 desc/名称匹配太脆，直接用预置值） */
BM.PROJECTS.forEach((p) => {
  p.remain = p.budget - p.used - p.frozen;
  p.execRate = p.budget ? Math.round((p.used / p.budget) * 1000) / 10 : 0;
});

/* 项目 → 部门/科目名 */
BM.projectInfo = function (p) {
  const dept = BM.DEPTS.find((d) => d.id === p.deptId) || {};
  const cat = BM.CATEGORIES.find((c) => c.id === p.catId) || {};
  return { deptName: dept.name || "-", catName: cat.name || "-" };
};

/* 当前角色可见的项目 */
BM.scopedProjects = function () {
  const r = BM.state.role;
  if (r === "boss" || r === "finance") return BM.PROJECTS;
  if (r === "manager") return BM.PROJECTS.filter((p) => p.deptId === BM.state.deptId);
  if (r === "staff") return BM.PROJECTS.filter((p) => p.owner === "张伟" && p.ownerRole === "staff");
  return BM.PROJECTS;
};

/* 角色说明条文案 */
BM.ROLE_HINTS = {
  "wb-home": {
    boss: "这是您的工作台：今日待办与 AI 主动推送的风险，您负责拍板。",
    finance: "这是您的工作台：预算总控与调整入口，您负责把控资金口径。",
    manager: "这是您的工作台：本部门预算与项目执行，您负责把控部门支出。",
    staff: "这是您的工作台：您负责的采购项目与申请进度。",
  },
  dashboard: {
    boss: "全局预算执行与风险，您是最终决策人。",
    finance: "预算口径与执行总控，超支科目需您审核调整。",
    manager: "仅显示本部门口径，偏差科目需您说明原因。",
    staff: "全局预算仅供了解，您的工作重点是负责的项目。",
  },
  projects: {
    boss: "全局采购项目总览，重点项目需您关注。",
    finance: "所有采购项目的预算约束，超约束项目需您介入。",
    manager: "本部门采购项目与预算约束，负责把控执行。",
    staff: "您负责的采购项目，管理项目预算与申请。",
  },
  approval: {
    boss: "终审决策：AI 初审供参考，最终由您批准。",
    finance: "财务环节审核：AI 已做预算与合规初审。",
    manager: "部门内单据审批，把控部门支出。",
    staff: "您发起的申请进度查看（无审批权限）。",
  },
  decisions: {
    boss: "AI 优化建议，采纳即自动执行，您可回滚。",
    finance: "AI 优化建议，采纳即自动执行，体现总控价值。",
    manager: "仅查看，建议执行由总经理/财务决定。",
    staff: "",
  },
  plan: {
    boss: "年度预算编制，您可自上而下分解并最终批准。",
    finance: "编制汇总与审核，把控全局口径。",
    manager: "填报本部门预算与项目额度。",
    staff: "项目负责人在此填报所负责项目的预算。",
  },
  track: {
    boss: "全局月度执行追踪，偏差一目了然。",
    finance: "执行追踪与偏差归因，用于控制与调整。",
    manager: "本部门执行追踪，偏差需及时说明。",
    staff: "",
  },
  final: {
    boss: "年度决算：审批结余/超支处理方案。",
    finance: "决算收口：核对全年口径，生成处理建议。",
    manager: "",
    staff: "",
  },
  adjust: {
    boss: "预算调整审批：调剂/追加/调减需您批准。",
    finance: "预算调整中心：您发起或审核项目级调整。",
    manager: "",
    staff: "",
  },
  rules: {
    boss: "",
    finance: "财务规则由您制定：编制/追踪/余量/超预算策略，影响全系统行为。",
    manager: "",
    staff: "",
  },
};

/* ---------- 预算调整（财务经理专属） ---------- */
BM.ADJUST_TYPES = [
  { id: "transfer", name: "预算调剂", desc: "项目间转移预算额度" },
  { id: "add", name: "追加预算", desc: "给项目追加额度" },
  { id: "cut", name: "调减预算", desc: "收回项目未用额度" },
];

window.BM = BM;

/* ---------- 部门预算基数（自上而下分解的初始建议） ---------- */
/* 基于 1-9 月已执行年化 + 编制系数，生成各部门 × 科目建议预算 */
BM.buildPlanSuggestion = function (deptId) {
  const rows = {};
  BM.CATEGORIES.forEach((c) => {
    const docs = BM.DOCS.filter((d) => d.catId === c.id && d.deptId === deptId);
    const used = docs.reduce((a, d) => a + d.amount, 0);
    /* 年化：已用 / 9 月 × 12，再乘编制系数 1.08（留缓冲） */
    const annual = Math.round((used / 9) * 12 * 1.08 / 10000) * 10000;
    if (annual > 0) rows[c.id] = annual;
  });
  return rows;
};

/* 自上而下：总经理给定总额，AI 按历史占比分配 */
BM.buildTopDownSuggestion = function (totalBudget) {
  /* 各部门历史费用占比（1-9 月） */
  const deptUsed = {};
  BM.DEPTS.forEach((d) => (deptUsed[d.id] = 0));
  BM.DOCS.forEach((d) => (deptUsed[d.deptId] += d.amount));
  const grand = BM.DEPTS.reduce((a, d) => a + deptUsed[d.id], 0);
  const rows = {};
  BM.DEPTS.forEach((d) => {
    const share = grand ? deptUsed[d.id] / grand : 1 / BM.DEPTS.length;
    rows[d.id] = Math.round((totalBudget * share) / 10000) * 10000;
  });
  return rows;
};

/* ---------- 决算（1-9 实际 vs 全年预算，预测到年底） ---------- */
BM.CATEGORIES.forEach((c) => {
  /* 预计年底：实际 + 剩余月按近 3 月均值外推 */
  const last3 = c.monthly.slice(-3);
  const avg = last3.reduce((a, b) => a + b, 0) / last3.length;
  c.yearForecast = c.used + avg * 3;
  c.variance = c.yearForecast - c.budget;
});

/* ================================================================
 * v0.5 增量：物料 / 财务规则 / LLM 归类模拟
 * ================================================================ */

/* ---------- 物料清单（挂科目 + 项目） ---------- */
BM.MATERIALS = [
  { id: "M001", name: "显示器", catId: "it", projectId: "P002", budget: 78000, used: 42000, unit: "台", spec: "27 寸 4K" },
  { id: "M002", name: "办公电脑", catId: "it", projectId: "P001", budget: 300000, used: 0, unit: "台", spec: "标准办公配置" },
  { id: "M003", name: "服务器", catId: "it", projectId: "P003", budget: 220000, used: 0, unit: "台", spec: "机架式 2U" },
  { id: "M004", name: "网络设备", catId: "it", projectId: "P004", budget: 160000, used: 0, unit: "套", spec: "交换机/AP" },
  { id: "M005", name: "公务车维保", catId: "vehicle", projectId: "P005", budget: 300000, used: 186000, unit: "次", spec: "6 辆商务车" },
  { id: "M006", name: "打印纸", catId: "office", projectId: "P006", budget: 60000, used: 38000, unit: "箱", spec: "A4 80g" },
  { id: "M007", name: "办公文具", catId: "office", projectId: "P006", budget: 90000, used: 52000, unit: "批", spec: "常用文具" },
  { id: "M008", name: "硒鼓墨盒", catId: "office", projectId: "P006", budget: 100000, used: 58000, unit: "个", spec: "兼容原装" },
  { id: "M009", name: "物业保洁服务", catId: "property", projectId: "P009", budget: 2000000, used: 1323000, unit: "年", spec: "办公楼服务" },
  { id: "M010", name: "内训课程", catId: "training", projectId: "P007", budget: 200000, used: 120000, unit: "门", spec: "技能类课程" },
  { id: "M011", name: "管理培训", catId: "training", projectId: "P008", budget: 150000, used: 62000, unit: "期", spec: "中层干部" },
  { id: "M012", name: "推广物料", catId: "office", projectId: "P010", budget: 80000, used: 45000, unit: "批", spec: "展会物料" },
];

/* ---------- 财务规则（财务经理可设置，影响行为） ---------- */
BM.DEFAULT_RULES = {
  planMode: "bottomup", // topdown 自上而下 / bottomup 自下而上
  trackMode: "reimburse", // reimburse 实际报销为主 / advance 申请单预跟踪
  surplusAction: "suspend", // reclaim 收回 / suspend 挂起 / carry 结转
  allowOverBudget: true, // 是否允许超预算（false → 走追加流程）
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
