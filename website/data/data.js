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
  admin: {
    id: "admin",
    name: "系统管理员",
    title: "平台管理员",
    desc: "账户 / 组织 / 角色管理 · 平台运维",
    scope: "all",
  },

  /* ================= V2 标准 9 角色（设计文档 2026-09-02） =================
   * scope 语义：group=集团全量 / company=本公司+下属 / center=归口科目跨公司 / self=仅本人项目。
   */
  ceo: {
    id: "ceo",
    name: "集团 CEO",
    title: "集团管理层",
    desc: "集团总额 · 压降目标 · 重大争议决策",
    scope: "group",
  },
  cooLead: {
    id: "cooLead",
    name: "总经办负责人",
    title: "总经办",
    desc: "组织审核 · 牵头协商 · 推动压降下达",
    scope: "group",
  },
  cooAnalyst: {
    id: "cooAnalyst",
    name: "总经办预算管理员",
    title: "总经办",
    desc: "汇总 · 规则引擎 · 导入核对 · 跟踪",
    scope: "group",
  },
  legalHead: {
    id: "legalHead",
    name: "法人公司负责人",
    title: "厦门三安（法人）",
    desc: "审核本公司预算 · 参与协商 · 重大调整",
    scope: "company",
  },
  adminHead: {
    id: "adminHead",
    name: "公司行政负责人",
    title: "厦门三安·行政",
    desc: "组织编制 · 解释差异 · 落实压降",
    scope: "company",
  },
  companyBudgeter: {
    id: "companyBudgeter",
    name: "公司预算管理员",
    title: "厦门三安·财务",
    desc: "汇总校验 · 规则校验 · 提交 · 导入",
    scope: "company",
  },
  centerOwner: {
    id: "centerOwner",
    name: "归口责任人",
    title: "职能中心（参数化）",
    desc: "归口科目专业标准 · 跨公司查看",
    scope: "center",
  },
  expense: {
    id: "expense",
    name: "基层费用责任岗",
    title: "费用责任人员（参数化）",
    desc: "本人负责项目 · 一次填报 · 双派生视角",
    scope: "self",
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
  { id: "P001", name: "办公电脑更换（30 台）", deptId: "it", catId: "it", budget: 300000, used: 0, frozen: 0, owner: "张伟", ownerRole: "expense", status: "执行中", desc: "按年度更换老旧办公电脑" },
  { id: "P002", name: "显示器批量采购（10 台）", deptId: "it", catId: "it", budget: 78000, used: 42000, frozen: 12000, owner: "张伟", ownerRole: "expense", status: "执行中", desc: "新员工办公显示器补充" },
  { id: "P003", name: "服务器扩容采购", deptId: "it", catId: "it", budget: 220000, used: 0, frozen: 220000, owner: "陈凯", ownerRole: "adminHead", status: "审批中", desc: "业务系统扩容" },
  { id: "P004", name: "网络设备升级", deptId: "it", catId: "it", budget: 160000, used: 0, frozen: 160000, owner: "陈凯", ownerRole: "adminHead", status: "审批中", desc: "办公网络升级改造" },
  { id: "P005", name: "公务车维修保养", deptId: "admin", catId: "vehicle", budget: 300000, used: 186000, frozen: 0, owner: "王敏", ownerRole: "adminHead", status: "执行中", desc: "6 辆公务车年度维保" },
  { id: "P006", name: "季度办公用品集采", deptId: "admin", catId: "office", budget: 250000, used: 148000, frozen: 0, owner: "王敏", ownerRole: "adminHead", status: "执行中", desc: "办公耗材季度框架采购" },
  { id: "P007", name: "年度培训计划", deptId: "hr", catId: "training", budget: 350000, used: 210000, frozen: 0, owner: "周芳", ownerRole: "adminHead", status: "执行中", desc: "全员技能与管理培训" },
  { id: "P008", name: "管理干部集训营", deptId: "hr", catId: "training", budget: 150000, used: 62000, frozen: 0, owner: "周芳", ownerRole: "adminHead", status: "执行中", desc: "中层管理能力提升" },
  { id: "P009", name: "办公环境物业维护", deptId: "admin", catId: "property", budget: 2000000, used: 1323000, frozen: 0, owner: "王敏", ownerRole: "adminHead", status: "执行中", desc: "办公楼物业与保洁服务" },
  { id: "P010", name: "市场推广物料制作", deptId: "market", catId: "office", budget: 80000, used: 45000, frozen: 0, owner: "赵磊", ownerRole: "adminHead", status: "执行中", desc: "展会与活动物料" },
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
  /* 数据范围统一由 BM.scopedData（公司/中心/本人项目）承担；项目清单全量返回，视图层再裁剪。 */
  return BM.PROJECTS;
};

/* 角色说明条文案 */
BM.ROLE_HINTS = {
  "wb-home": {
    admin: "这是您的工作台：账户、组织与角色管理，平台运维。",
    ceo: "这是您的工作台：今日待办与 AI 主动推送的风险，您负责拍板。",
    cooLead: "这是您的工作台：组织审核、牵头协商、推动压降下达。",
    cooAnalyst: "这是您的工作台：预算总控与调整入口，您负责把控资金口径。",
    legalHead: "这是您的工作台：审核本公司预算、参与协商、重大调整。",
    adminHead: "这是您的工作台：本公司预算与项目执行，您负责把控支出。",
    companyBudgeter: "这是您的工作台：汇总校验、规则校验、提交、导入。",
    centerOwner: "这是您的工作台：归口科目专业标准、跨公司查看。",
    expense: "这是您的工作台：您负责的采购项目与申请进度。",
  },
  dashboard: {
    ceo: "全局预算执行与风险，您是最终决策人。",
    cooAnalyst: "预算口径与执行总控，超支科目需您审核调整。",
    adminHead: "仅显示本部门口径，偏差科目需您说明原因。",
    expense: "全局预算仅供了解，您的工作重点是负责的项目。",
  },
  projects: {
    ceo: "全局采购项目总览，重点项目需您关注。",
    cooAnalyst: "所有采购项目的预算约束，超约束项目需您介入。",
    adminHead: "本部门采购项目与预算约束，负责把控执行。",
    expense: "您负责的采购项目，管理项目预算与申请。",
  },
  approval: {
    ceo: "终审决策：AI 初审供参考，最终由您批准。",
    cooAnalyst: "财务环节审核：AI 已做预算与合规初审。",
    adminHead: "部门内单据审批，把控部门支出。",
    expense: "您发起的申请进度查看（无审批权限）。",
  },
  decisions: {
    ceo: "AI 优化建议，采纳即自动执行，您可回滚。",
    cooAnalyst: "AI 优化建议，采纳即自动执行，体现总控价值。",
    adminHead: "仅查看，建议执行由总经理/财务决定。",
    expense: "",
  },
  plan: {
    ceo: "年度预算编制，您可自上而下分解并最终批准。",
    cooAnalyst: "编制汇总与审核，把控全局口径。",
    adminHead: "填报本部门预算与项目额度。",
    expense: "项目负责人在此填报所负责项目的预算。",
  },
  track: {
    ceo: "全局月度执行追踪，偏差一目了然。",
    cooAnalyst: "执行追踪与偏差归因，用于控制与调整。",
    adminHead: "本部门执行追踪，偏差需及时说明。",
    expense: "",
  },
  final: {
    ceo: "年度决算：审批结余/超支处理方案。",
    cooAnalyst: "决算收口：核对全年口径，生成处理建议。",
    adminHead: "",
    expense: "",
  },
  adjust: {
    ceo: "预算调整审批：调剂/追加/调减需您批准。",
    cooAnalyst: "预算调整中心：您发起或审核项目级调整。",
    adminHead: "",
    expense: "",
  },
  rules: {
    ceo: "",
    cooAnalyst: "预算规划由您制定：编制/追踪/余量/超预算策略，影响全系统行为。（预算规则是预算规划的核心内容）",
    adminHead: "",
    expense: "",
  },
  collisionTune: {
    ceo: "拖动滑块试算压降：调申报额 / 压降比率 / 压降幅度，右侧实时看差异与对标，边调边谈。",
    cooAnalyst: "用即时反馈试算压降方案，确认后回写争议项并留痕。",
    adminHead: "试算本部门反馈方案：调整申报额与可接受的压降，直观看到与集团建议的差距。",
    expense: "",
  },
  compile: {
    ceo: "编制工作台：您定总额与规则，AI 按九法预填建议，部门在约束内分解。",
    cooAnalyst: "编制工作台：汇总各部门编制、把控规则基线、复核偏离原因。",
    adminHead: "编制工作台：在本部门额度内按项目/物料填报，九法任选，月度分解。",
    expense: "编制工作台：按您负责的项目填报预算，九法任选，保存草稿。",
  },
  importView: {
    ceo: "费控导入：查看全集团实际执行导入与对账结果。",
    cooAnalyst: "费控导入：负责模板下发、上传解析、映射对账与错误修正。",
    adminHead: "费控导入：导入本部门费控实际，进入执行跟踪对账。",
    expense: "",
  },
  riskView: {
    ceo: "AI 风险筛查：全局高风险对象一目了然，您决定采纳或驳回。",
    cooAnalyst: "AI 风险筛查：核对异常金额/费用转移，给出复核结论并留痕。",
    adminHead: "AI 风险筛查：关注本部门相关风险，配合总部核查。",
    expense: "AI 风险筛查：可查看风险提示（无复核权限）。",
  },
};

/* 为 9 标准角色补齐各视图说明（缺省沿用总经办预算管理员/CEO 视角，关键视图差异化覆盖）
 * 避免 BM.renderRoleHint 在缺省时取空；真实文案后续可按角色细化。 */
(function fillRoleHints() {
  const newRoles = ["ceo", "cooLead", "cooAnalyst", "legalHead", "adminHead", "companyBudgeter", "centerOwner", "expense"];
  Object.keys(BM.ROLE_HINTS).forEach(function (view) {
    const h = BM.ROLE_HINTS[view];
    newRoles.forEach(function (rid) {
      if (h[rid] === undefined) h[rid] = h.cooAnalyst || h.ceo || "";
    });
  });
  /* 关键视图差异化文案 */
  BM.ROLE_HINTS.dashboard.centerOwner = "归口维度：仅看您归口的职能中心科目，跨公司聚合。";
  BM.ROLE_HINTS.dashboard.expense = "全局仅供了解，您的工作重点是本人负责项目。";
  BM.ROLE_HINTS.compile.expense = "单数据源·双派生视角：同一经济事项一次填报（唯一真值），系统派生财务线（会计口径）与管理线（指标派生）视图，管理线不另存第二份数据。";
  BM.ROLE_HINTS.compile.centerOwner = "归口科目的预算控制方法由上级统一下发，管理口径基线在此预填（基层不可更改方法）。";
  BM.ROLE_HINTS.compile.adminHead = "在本公司额度内组织各部门据实填报，预算控制方法由上级统一下发（基层不自选），月度分解。";
  BM.ROLE_HINTS.compile.companyBudgeter = "汇总校验各部门填报，对照上级控制的预算方法校验偏离后提交公司预算。";
  BM.ROLE_HINTS.collisionTune.legalHead = "试算本公司反馈方案：调整申报额与可接受的压降，直观看到与集团建议差距。";
  BM.ROLE_HINTS.collisionTune.cooLead = "用即时反馈试算压降方案，确认后回写争议项并留痕。";
  BM.ROLE_HINTS.riskView.centerOwner = "AI 风险筛查：关注您归口科目的相关风险（密级受限项已过滤）。";
  BM.ROLE_HINTS.riskView.legalHead = "AI 风险筛查：关注本公司相关风险，配合总部核查。";
})();

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
 * v0.5 增量：物料 / 预算规则 / LLM 归类模拟
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

/* ---------- 预算规则（财务经理可设置，影响行为） ---------- */
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

/* ================================================================
 * v0.6 增量：客户真实组织字典 + 客户规则引擎 + 对标 + 碰撞
 * 数据来源：客户三份业务资料（公司/事业部/生产单元/一级部门对照表 + 预算逻辑 + 汇总表）
 * 金额脱敏，仅典型子集；规则模拟，不接真实模型
 * ================================================================ */

/* ---------- 公司（文件3 公司代码对照表，典型子集，金额脱敏） ---------- */
BM.COMPANIES = [
  { code: "1000", name: "三安光电股份" },
  { code: "2010", name: "厦门三安" },
  { code: "2020", name: "天津三安" },
  { code: "2030", name: "安徽三安" },
  { code: "2170", name: "泉州三安" },
  { code: "2180", name: "湖北三安" },
  { code: "3050", name: "湖南三安" },
  { code: "3200", name: "重庆三安" },
];

/* ---------- 事业部 / 生产单元（文件3，典型） ---------- */
BM.BUSINESS_UNITS = [
  { id: "BU1", name: "氮化镓", unit: "厦门生产单元" },
  { id: "BU2", name: "砷化镓", unit: "南安生产单元(GaAs)" },
  { id: "BU3", name: "特种应用", unit: "南安生产单元(衬底)" },
  { id: "BU5", name: "射频", unit: "安溪生产单元" },
  { id: "BU6", name: "电力电子", unit: "芜湖生产单元" },
];

/* ---------- 一级部门（文件3，典型） ---------- */
BM.LEVEL1_DEPTS = [
  { code: "0", name: "总经理室" },
  { code: "1", name: "研发/技术" },
  { code: "2", name: "运营" },
  { code: "6", name: "总经办" },
  { code: "7", name: "人资" },
  { code: "8", name: "财务" },
  { code: "23", name: "封装/封测" },
  { code: "25", name: "销售" },
];

/* ---------- 组织树：公司 → 事业部 → 生产单元 → 部门（四级） ---------- */
/* 典型组合（demo 主用 厦门三安 2010） */
BM.ORG_TREE = [
  { company: "2010", bu: "BU1", unit: "厦门生产单元", dept: "6" },
  { company: "2010", bu: "BU1", unit: "厦门生产单元", dept: "7" },
  { company: "2010", bu: "BU1", unit: "厦门生产单元", dept: "8" },
  { company: "2010", bu: "BU2", unit: "南安生产单元(GaAs)", dept: "6" },
  { company: "2010", bu: "BU3", unit: "南安生产单元(衬底)", dept: "6" },
  { company: "2010", bu: "BU5", unit: "安溪生产单元", dept: "1" },
  { company: "2020", bu: "BU6", unit: "芜湖生产单元", dept: "6" },
  { company: "2020", bu: "BU6", unit: "芜湖生产单元", dept: "8" },
  { company: "1000", bu: "BU1", unit: "厦门生产单元", dept: "0" },
  { company: "1000", bu: "BU1", unit: "厦门生产单元", dept: "8" },
];

/* ---------- 客户规则引擎（文件1 预算逻辑提炼，V2 §5.10） ---------- */
/* requireReason: 偏离基线必须填原因（规则治理） */
BM.RULES = [
  { id: "R01", cat: "总办办公费", type: "down5",   expr: "较 2025 实际下降 5%", requireReason: true, lastBudget: 1320000, acctCode: "6602.11", lastYear: 1200000, desc: "总经办归口，刚性压降" },
  { id: "R02", cat: "食堂费用",   type: "canteen", expr: "人均成本 7 元/餐 ±3%，>7.5 须降 ≥5%", requireReason: true, lastBudget: 3960000, acctCode: "6602.12", lastYear: 3600000, desc: "按人数核定，超线压降" },
  { id: "R03", cat: "宿舍费用",   type: "dorm",    expr: "月人均<13.5 不降；13.5~18 降≥10%；≥20 降≥15%", requireReason: true, lastBudget: 2310000, acctCode: "6602.13", lastYear: 2100000, desc: "阶梯压降" },
  { id: "R04", cat: "差旅费",     type: "revenue", expr: "营收比 ≤ 千分之4，费用增幅 ≤ 营收增幅 50%", requireReason: true, lastBudget: 1980000, acctCode: "6602.14", lastYear: 1800000, desc: "挂钩营收" },
  { id: "R05", cat: "绿化费",     type: "green",   expr: "管养单价 3~3.5 降≥5%；>3.5 降≥10%", requireReason: true, lastBudget: 528000, acctCode: "6602.15", lastYear: 480000, desc: "单价挂钩" },
  { id: "R06", cat: "按实际预算类", type: "actual", expr: "据实预算，须详细说明依据", requireReason: true, lastBudget: null, acctCode: "6602.99", lastYear: null, desc: "据实申报" },
];

/* 规则基线计算：输入科目名 + 2025 实际，返回建议/基线金额 */
BM.applyRule = function (catName, lastYearActual) {
  const r = BM.RULES.find((x) => x.cat === catName);
  if (!r) return { ok: false, baseline: null };
  if (r.type === "down5") return { ok: true, type: r.type, baseline: Math.round(lastYearActual * 0.95) };
  if (r.type === "canteen") return { ok: true, type: r.type, baseline: Math.round(lastYearActual * 0.97) };
  if (r.type === "dorm")    return { ok: true, type: r.type, baseline: Math.round(lastYearActual * 0.90) };
  if (r.type === "revenue") return { ok: true, type: r.type, baseline: Math.round(lastYearActual * 0.98) };
  if (r.type === "green")   return { ok: true, type: r.type, baseline: Math.round(lastYearActual * 0.92) };
  if (r.type === "actual")  return { ok: true, type: r.type, baseline: lastYearActual };
  return { ok: false, baseline: null };
};

/* 偏离判定：|输入-基线| / 基线 > 阈值（默认 1%） */
BM.isDeviated = function (input, baseline, threshold) {
  if (!baseline) return false;
  threshold = threshold === undefined ? 0.01 : threshold;
  return Math.abs(input - baseline) / baseline > threshold;
};

/* ---------- 经济事项负责人归属（demo 分配；真实 ~390 项依赖主数据导入后按组织挂责） ---------- */
BM.RULE_OWNERS = {
  "总办办公费": "ceo",
  "食堂费用": "expense",
  "宿舍费用": "expense",
  "差旅费": "expense",
  "绿化费": "expense",
  "按实际预算类": "adminHead",
};
/* 当前角色负责的经济事项（编制页「我负责的」筛选）；无归属则回退全部 */
BM.myRules = function (roleId) {
  const r = roleId || BM.state.role;
  const mine = BM.RULES.filter((x) => BM.RULE_OWNERS[x.cat] === r);
  return mine.length ? mine : BM.RULES;
};

/* ---------- 看板 · 人员视图：经济事项 → 责任人（demo 分配，待主数据导入真实人员归属） ---------- */
BM.EVENT_OWNERS = {
  "总办办公费": "李静",
  "食堂费用": "王敏",
  "宿舍费用": "王敏",
  "差旅费": "张伟",
  "绿化费": "赵磊",
  "按实际预算类": "周芳",
};
BM.PEOPLE = ["李静", "王敏", "张伟", "赵磊", "周芳"];
/* 按责任人聚合（同一份预算数据，人员维度） */
BM.aggByOwner = function (list) {
  const map = {};
  (list || []).forEach((d) => {
    const owner = BM.EVENT_OWNERS[d.cat] || "未分配";
    if (!map[owner]) map[owner] = { owner: owner, events: 0, amount: 0 };
    map[owner].events += 1;
    map[owner].amount += (d.amount || 0);
  });
  return BM.PEOPLE.map((p) => map[p] || { owner: p, events: 0, amount: 0 });
};

/* ---------- AI 建议（正式页面：规则引擎 + AI 读取政策/往年/执行；此处确定性推导，待接 AI 网关） ---------- */
BM.aiSuggestion = function (catName) {
  const r = BM.RULES.find((x) => x.cat === catName);
  if (!r) return null;
  const ar = BM.applyRule(catName, r.lastYear);
  const base = ar.ok ? ar.baseline : (r.lastYear || 0);
  const lo = Math.round(base * 0.9);
  const hi = Math.round(base * 1.05);
  const execRate = r.lastYear ? ({ down5: 0.95, canteen: 0.97, dorm: 0.9, revenue: 0.98, green: 0.92, actual: 1 })[r.type] || 1 : null;
  return {
    lo: lo,
    hi: hi,
    mid: Math.round((lo + hi) / 2),
    policy: "预算政策：" + r.expr,
    basis: r.lastYear ? "往年预算：" + BM.money(r.lastYear) + "（2025 实际）" : "往年预算：无历史（据实申报）",
    exec: execRate != null ? "上年执行：全年执行率约 " + Math.round(execRate * 100) + "%" : "上年执行：—",
  };
};

/* ---------- 动态编制建议（松哥 2026-08-24 方法论原型）
 * 不写死规则，而是根据「这一项最适合哪条预算规则」动态给出编制建议：
 *   - 适配规则（8 类规则之一）
 *   - 该参照什么（去年实际 / 合同 / 业务量变化 / 事件拆分 …）
 *   - 建议区间（复用 aiSuggestion）
 *   - 实时偏离（编制人填的值 vs 区间）
 * 让编制人每编一项都"心里踏实"；上级再用平衡原则（规则4/5/6）做汇总平衡。
 * ---------------------------------------------------------------------- */

/* 控制方法 → 8 类规则适配元数据（method 由上级定义，见 CTRL_METHOD_ASSIGN） */
BM.RULE_ADVICE_MAP = {
  history:   { rule: "R1", ruleName: "历史基准", kind: "历史基准型",   ref: "参照近 1–3 年实际均值（优先历史实际，而非去年预算，避免基数虚高）", devHint: "检查去年是否报高，若去年实际 < 去年预算，应以实际为基数" },
  yoy:       { rule: "R1/R2", ruleName: "历史基准+趋势", kind: "趋势型", ref: "参照去年实际 × 业务量系数 × 价格系数（看 3 年 CAGR，不只看上一年）", devHint: "申报增长若超历史趋势 15 个百分点，需补充业务驱动因素" },
  fixed:     { rule: "R4", ruleName: "弹性·刚性", kind: "刚性合同型",   ref: "直接读取合同/固定额，不要按历史比例涨（房租涨 30% 若合同如此则合理）", devHint: "刚性费用不套用增长率模型，核对合同即可" },
  perCapita: { rule: "R3", ruleName: "业务驱动", kind: "业务驱动型",   ref: "参照人数 × 人均标准（人数变了才变，否则不该涨）", devHint: "预算增长 % 与人数增长 % 不匹配时，系统会质询" },
  volume:    { rule: "R3", ruleName: "业务驱动", kind: "业务驱动型",   ref: "参照业务量 × 单位成本（如差旅按营收比，业务量没涨就不该涨）", devHint: "预算增长与营收/产量增长背离时，需说明" },
  manageStd: { rule: "R4/R1", ruleName: "弹性·管理标准", kind: "管理标准型", ref: "参照上级下达的管理基线（如降 5% / 人均 7 元），属半刚性压降", devHint: "已含集团压降目标，申报高于基线须说明管理改善未达标" },
  keyEvent:  { rule: "R8", ruleName: "重大事件", kind: "事件型",       ref: "拆成 BAU（正常经营）+ Event（新增事件），只报正常部分同比", devHint: "Event 占比 > 20% 必须拆分填报并附事件说明" },
  manual:    { rule: "R1", ruleName: "据实申报", kind: "据实型",       ref: "据实申报，必须附业务依据（无历史基线，纯说明驱动）", devHint: "无历史可参照，重点在依据完整性与合理性" },
};

/* 主函数：给定经济事项 r，返回动态编制建议对象 + AI 规则应用分析 */
BM.budgetAdvice = function (r) {
  if (!r) return null;
  const method = r.method || BM.CTRL_METHOD_ASSIGN[r.cat] || "history";
  const meta = BM.RULE_ADVICE_MAP[method] || BM.RULE_ADVICE_MAP.history;
  let sug = BM.aiSuggestion(r.cat) || null;
  /* 回退基线（规则1 历史基准）：事项未匹配规则字典时，用上年实际 × 系数给区间，
   * 避免建议区间为空（原型阶段让每一项都有可参照的动态建议）。 */
  if (!sug || sug.lo == null) {
    const base = r.lastYear || r.lastBudget || 0;
    sug = { lo: Math.round(base * 0.9), hi: Math.round(base * 1.05), mid: Math.round(base * 0.975) };
  }
  /* 历史实际可得性（规则1核心：优先历史实际而非去年预算） */
  const hasActual = r.lastYear != null && r.lastYear > 0;
  const hasBudget = r.lastBudget != null && r.lastBudget > 0;
  let basisNote = "无历史数据，据实申报";
  if (hasActual && hasBudget) {
    const inflate = r.lastBudget > r.lastYear ? "（注意：去年预算高于实际，建议以实际为基数避免虚高）" : "";
    basisNote = "历史实际 " + BM.money(r.lastYear) + " / 去年预算 " + BM.money(r.lastBudget) + inflate;
  } else if (hasActual) {
    basisNote = "历史实际 " + BM.money(r.lastYear) + "（无去年预算，以实际为基数）";
  } else if (hasBudget) {
    basisNote = "去年预算 " + BM.money(r.lastBudget) + "（无实际，谨慎参照）";
  }

  /* ========== AI 规则应用分析（确定性规则引擎 + 自然语言生成） ========== */
  const analysis = buildRuleAnalysis(r, method, sug);

  return {
    method: method,
    rule: meta.rule,
    ruleName: meta.ruleName,
    kind: meta.kind,
    ref: meta.ref,
    devHint: meta.devHint,
    basisNote: basisNote,
    lo: sug.lo, hi: sug.hi, mid: sug.mid,
    analysis: analysis,
  };
};

/* 构建"AI 对预算规则在本经济事项上的应用分析" */
function buildRuleAnalysis(r, method, sug) {
  const amount = r.amount || 0;
  const lastYear = r.lastYear || 0;
  const lastBudget = r.lastBudget || 0;
  const ruleDef = BM.RULES.find((x) => x.cat === r.cat);

  /* 1. 本项数据画像 */
  const execRate = lastBudget ? Math.round((lastYear / lastBudget) * 1000) / 10 : null;
  const elasticityKey = { history: "semi", yoy: "elastic", fixed: "fixed", perCapita: "semi", volume: "elastic", manageStd: "semi", keyEvent: "event", manual: "elastic" }[method] || "elastic";
  const elasticityName = { fixed: "刚性", semi: "半刚性", elastic: "弹性", event: "项目型" }[elasticityKey];
  const elasticity = elasticityName;

  /* 2. 规则逐条应用 */
  const steps = [];

  // R1 历史基准
  if (lastYear > 0) {
    const baseLine = BM.applyRule(r.cat, lastYear);
    const base = baseLine.ok ? baseLine.baseline : Math.round(lastYear * 0.95);
    steps.push({
      rule: "R1 历史基准",
      conclusion: "以 2025 实际 " + BM.money(lastYear) + " 为基数，规则计算基线约 " + BM.money(base) + "。",
      why: lastBudget > lastYear ? "去年预算" + BM.money(lastBudget) + "高于实际，若沿用预算基数会虚高 " + Math.round((lastBudget - lastYear) / lastYear * 100) + "%。" : "历史实际可靠，优先于去年预算。",
    });
  } else {
    steps.push({ rule: "R1 历史基准", conclusion: "无历史实际，无法使用历史基准法，须据实说明。", why: "" });
  }

  // R2 趋势（单年变多年：这里只有一年，给出方向性判断）
  if (lastYear > 0 && lastBudget > 0) {
    const trend = Math.round((lastYear - lastBudget) / lastBudget * 1000) / 10;
    steps.push({
      rule: "R2 趋势",
      conclusion: "去年实际较预算" + (trend <= 0 ? "节约 " + Math.abs(trend) + "%" : "超支 " + trend + "%") + "。",
      why: trend < -5 ? "存在节约空间，今年可在此基础上压降。" : trend > 5 ? "执行偏差大，今年申报须解释原因。" : "执行相对平稳。",
    });
  }

  // R3 业务驱动
  if (["perCapita", "volume"].includes(method)) {
    steps.push({
      rule: "R3 业务驱动",
      conclusion: "本项按" + (method === "perCapita" ? "人数 × 人均标准" : "业务量 × 单位成本") + "驱动。",
      why: "预算增长应与业务指标同向；若业务指标未涨而预算涨，系统自动质询。",
    });
  }

  // R4 弹性分类
  steps.push({
    rule: "R4 弹性分类",
    conclusion: "本项归为「" + elasticityName + "」费用。",
    why: { fixed: "合同/固定驱动，不套用增长率模型。", semi: "与人数/业务量弱相关，可适度压降。", elastic: "与业务强相关，优先审核增长合理性。", event: "须拆分 BAU 与事件增量。" }[elasticityKey],
  });

  // R5 横向对标（用 BM.BENCHMARK）
  const bench = BM.BENCHMARK[r.cat];
  if (bench && lastYear > 0) {
    const vals = Object.values(bench).filter((v) => v > 0);
    const median = vals.length ? vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)] : 0;
    const cmp = median ? Math.round((lastYear - median) / median * 1000) / 10 : 0;
    steps.push({
      rule: "R5 横向对标",
      conclusion: "集团同类公司该科目中位数约 " + BM.money(median) + "，本公司去年实际 " + BM.money(lastYear) + "（" + (cmp >= 0 ? "高 " + cmp : "低 " + Math.abs(cmp)) + "%）。",
      why: Math.abs(cmp) > 20 ? "偏离中位数超过 20%，今年申报建议补充横向差异说明。" : "处于同类公司合理区间。",
    });
  }

  // R6 总量约束（用建议区间占总额比例，这里总额未知，用申报额反向提示）
  steps.push({
    rule: "R6 总量约束",
    conclusion: "建议区间 " + BM.money(sug.lo) + " ~ " + BM.money(sug.hi) + " 已含规则压降/管理目标。",
    why: "超出上限须说明不可压缩因素；低于下限须确认是否漏项。",
  });

  // R7 准确性
  if (execRate != null) {
    steps.push({
      rule: "R7 预算准确性",
      conclusion: "去年执行率约 " + execRate + "%。",
      why: execRate < 85 ? "执行率偏低，本年预算可信度下调，建议从严审核。" : execRate > 105 ? "执行率超预算，基数可能偏低。" : "执行率正常，可接受。",
    });
  }

  // R8 事件拆分
  if (method === "keyEvent") {
    steps.push({
      rule: "R8 重大事件",
      conclusion: "须将总预算拆为 BAU + Event。",
      why: "Event 占比超过 20% 必须单独列示事件依据，否则同比会失真。",
    });
  }

  /* 3. 区间推导说明 */
  const rangeReasoning = lastYear > 0
    ? "建议区间 = 规则基线（" + BM.money(sug.mid) + "）× [0.9, 1.05]，覆盖正常波动与价格因素。"
    : "建议区间 = 去年预算（" + BM.money(lastBudget) + "）× [0.9, 1.05]，因无历史实际，区间偏宽。";

  /* 4. 偏离归因（基于当前申报额） */
  let deviation = null;
  if (amount > 0 && sug.lo != null) {
    if (amount > sug.hi) {
      const overPct = Math.round((amount - sug.hi) / sug.mid * 100);
      deviation = {
        status: "偏高",
        possibleCauses: [
          lastYear > 0 && amount > lastYear ? "申报额高于去年实际 " + Math.round((amount - lastYear) / lastYear * 100) + "%" : null,
          bench && lastYear > 0 ? "去年实际已高于集团中位数" : null,
          elasticity === "fixed" ? "刚性合同涨价" : null,
          method === "keyEvent" ? "含未拆分的事件增量" : null,
        ].filter(Boolean),
      };
    } else if (amount < sug.lo) {
      const underPct = Math.round((sug.lo - amount) / sug.mid * 100);
      deviation = {
        status: "偏低",
        possibleCauses: ["申报额低于建议下限，可能漏项或压降过度", lastBudget > amount ? "低于去年预算，需确认业务变化" : null].filter(Boolean),
      };
    } else {
      deviation = { status: "合理", possibleCauses: [] };
    }
  }

  /* 5. AI 追问 */
  const questions = [];
  if (method === "perCapita" || method === "volume") questions.push("请确认本年度" + (method === "perCapita" ? "人数/人均标准" : "业务量/单价") + "变化。");
  if (lastBudget > lastYear) questions.push("去年预算高于实际，请说明今年为何不能按实际基数继续压降。");
  if (deviation && deviation.status === "偏高") questions.push("申报额高于建议区间，请补充业务驱动因素或事件说明。");
  if (method === "keyEvent") questions.push("请拆分 BAU 预算与 Event 增量，并附事件清单。");
  if (questions.length === 0) questions.push("请确认上述规则假设与业务实际一致。");

  return {
    profile: {
      lastYear: lastYear, lastBudget: lastBudget, execRate: execRate,
      elasticity: elasticity, elasticityName: elasticity,
    },
    steps: steps,
    rangeReasoning: rangeReasoning,
    deviation: deviation,
    questions: questions,
  };
}

/* 实时偏离判定：编制人填的值 vs 建议区间 */
BM.adviceDeviation = function (advice, amount) {
  if (!advice || advice.lo == null) return { inRange: null, pct: null, label: "—" };
  const inRange = amount >= advice.lo && amount <= advice.hi;
  const pct = advice.mid ? Math.round((amount - advice.mid) / advice.mid * 100) : null;
  let label = "在建议区间内";
  if (amount < advice.lo) label = "低于建议区间 " + Math.round((advice.lo - amount) / (advice.mid || 1) * 100) + "%（偏低，确认是否漏项）";
  else if (amount > advice.hi) label = "高于建议区间 " + Math.round((amount - advice.hi) / (advice.mid || 1) * 100) + "%（偏高，须补依据）";
  return { inRange: inRange, pct: pct, label: label };
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

/* ---------- 预算碰撞/争议（V2 §5.2；申报值 vs 集团建议值） ---------- */
BM.collisionItems = [
  { id: "C01", cat: "总办办公费", company: "2010", apply: 1140000, lastYear: 1200000, note: "", evidence: "", status: "待协商" },
  { id: "C02", cat: "食堂费用",   company: "2010", apply: 3720000, lastYear: 3600000, note: "", evidence: "", status: "待协商" },
  { id: "C03", cat: "宿舍费用",   company: "2020", apply: 1980000, lastYear: 2100000, note: "", evidence: "", status: "待协商" },
  { id: "C04", cat: "差旅费",     company: "2010", apply: 1760000, lastYear: 1800000, note: "", evidence: "", status: "已共识" },
  { id: "C05", cat: "绿化费",     company: "2170", apply: 520000,  lastYear: 480000,  note: "", evidence: "", status: "待协商" },
];
BM.collisionItems.forEach((c) => {
  const ar = BM.applyRule(c.cat, c.lastYear);
  c.suggest = ar.ok ? ar.baseline : c.lastYear;
  c.diff = c.apply - c.suggest;
  c.diffPct = c.suggest ? Math.round((c.diff / c.suggest) * 1000) / 10 : 0;
});

/* ---------- 对标数据：多公司同科目预算（脱敏 mock，用于横向对标视角） ---------- */
BM.BENCHMARK = {
  "总办办公费": { "1000": 1320000, "2010": 1140000, "2020": 980000, "2030": 1050000, "2170": 760000, "2180": 820000, "3050": 690000, "3200": 710000 },
  "食堂费用":   { "1000": 4200000, "2010": 3720000, "2020": 3100000, "2030": 3400000, "2170": 2600000, "2180": 2800000, "3050": 2300000, "3200": 2500000 },
  "宿舍费用":   { "1000": 2400000, "2020": 1980000, "2030": 1700000, "2170": 1450000, "2180": 1560000, "3050": 1320000, "3200": 1400000 },
  "差旅费":     { "1000": 2100000, "2010": 1760000, "2020": 1500000, "2030": 1620000, "2170": 1240000, "2180": 1330000, "3050": 1120000, "3200": 1190000 },
  "绿化费":     { "1000": 560000, "2010": 520000, "2020": 440000, "2030": 470000, "2170": 360000, "2180": 390000, "3050": 330000, "3200": 350000 },
};

/* ---------- CATEGORIES 增 会计科目编码 + 归口部门（V2 §3.3 客户数据字典） ---------- */
(function attachCatMeta() {
  const meta = {
    vehicle:   { accountCode: "6602.01", ownerDept: "总经办" },
    it:        { accountCode: "6602.02", ownerDept: "IT 部" },
    office:    { accountCode: "6602.03", ownerDept: "行政部" },
    property:  { accountCode: "6602.04", ownerDept: "行政部" },
    training:  { accountCode: "6602.05", ownerDept: "人资" },
    travel:    { accountCode: "6602.06", ownerDept: "销售部" },
    utility:   { accountCode: "6602.07", ownerDept: "行政部" },
    entertain: { accountCode: "6602.08", ownerDept: "市场部" },
  };
  BM.CATEGORIES.forEach((c) => {
    const m = meta[c.id];
    if (m) { c.accountCode = m.accountCode; c.ownerDept = m.ownerDept; }
  });
})();

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

/* ================================================================
 * v0.13 增量（本期新增前端界面所需数据）
 *  - BM.BUDGET_CONTROL_METHODS：M3 预算控制的方法定义（自上而下定义 · 产品经理稿 §M3）
 *  - BM.RISK_SCREENING：M7 AI 风险筛查结果（mock，提示非判定）
 *  金额/规则与既有 demo 同源；风险数据脱敏，仅典型子集。
 * ================================================================ */

/* ---------- M3 · 预算控制的方法（自上而下定义，非基层自选） ---------- */
/* 注意：这些方法由上面（管理层/集团/中心负责人）统一定义并挂到各经济事项上，
 *       基层只据实申报，系统按上级定义的方法生成「控制基线」并比对偏离；基层不得自选方法。 */
BM.BUDGET_CONTROL_METHODS = [
  { id: "history",   name: "历史参考", desc: "取近 1-3 年同科目实际均值，作为基线" },
  { id: "yoy",       name: "同比",     desc: "去年实际 × 同比系数（默认 +5%）" },
  { id: "fixed",     name: "固定",     desc: "取固定预算额（取整到万元）" },
  { id: "qtyPrice",  name: "数量×单价", desc: "业务数量 × 单价，逐项汇总" },
  { id: "perCapita", name: "人均标准", desc: "在编人数 × 人均标准（如食堂/宿舍）" },
  { id: "volume",    name: "业务量",   desc: "业务量 × 单位成本（如差旅按营收比）" },
  { id: "manageStd", name: "管理标准", desc: "按客户规则引擎基线（如降 5% / 人均 7 元）" },
  { id: "keyEvent",  name: "关键事件", desc: "去年实际 + 关键事件增量（扩产/新项目）" },
  { id: "manual",    name: "人工",     desc: "人工直接录入，不自动预填（需附依据）" },
];

/* 各经济事项由上面统一定义的预算控制方法（上级下发，只读，基层不可改） */
BM.CTRL_METHOD_ASSIGN = {
  vehicle:  "manageStd",   /* 车辆维修：按管理标准（规则引擎基线，降档） */
  it:       "history",     /* IT 设备：历史参考 */
  office:   "perCapita",   /* 办公用品：人均标准 */
  property: "yoy",         /* 物业费：同比 */
  training: "manageStd",   /* 培训费：管理标准 */
  travel:   "volume",      /* 差旅费：业务量驱动 */
  utility:  "fixed",       /* 水电费：固定 */
  entertain: "keyEvent",   /* 业务招待：关键事件 */
  /* 规则经济事项（客户规则字典 · 上级定义控制方法） */
  "总办办公费": "manageStd", /* 刚性压降 5% → 管理标准（规则基线） */
  "食堂费用":   "manageStd", /* 人均成本 7 元/餐 → 管理标准（规则基线） */
  "宿舍费用":   "manageStd", /* 阶梯压降 → 管理标准（规则基线） */
  "差旅费":     "volume",    /* 营收比 → 业务量驱动 */
  "绿化费":     "qtyPrice",  /* 管养单价 → 数量×单价 */
  "按实际预算类": "manual",  /* 据实申报 → 人工 */
};

/* ---------- 预算规则 → 适用经济事项 映射（规则页「规则-事项」对照表数据源）
 * 把后端生效版本的 baseline scopeKey 与全部经济事项（BM.CTRL_METHOD_ASSIGN）串联：
 *   - scopeKey：后端规则代号（down5/canteen/dorm/revenue/green/actual/volume/qtyPrice/history/manual）
 *   - typeLabel：规则类型（刚性/半刚性/弹性/项目型），用于平衡预览弹性分类对齐
 *   - events：适用经济事项名（来自 CTRL_METHOD_ASSIGN 中 method === scopeKey 的事项）
 *   - policy：政策表述（复用 BM.RULES 的 expr/desc，无则取通用说明）
 * 注意：本映射是"规则 → 事项"的**展示层串联**，不改动规则引擎计算逻辑（applyRule/budgetAdvice）。
 */
BM.RULE_EVENT_MAP = (function () {
  /* 后端权威规则字典（BM.RULES）：6 条客户规则，type 即 scopeKey，含 canteen/dorm/revenue/green */
  const GENERIC = {
    down5:    { expr: "较 2025 实际下降 5%", desc: "刚性压降", typeLabel: "半刚性" },
    canteen:  { expr: "人均成本 7 元/餐 ±3%，超线须降", desc: "按人数核定", typeLabel: "半刚性" },
    dorm:     { expr: "阶梯压降（人均越高降越多）", desc: "阶梯压降", typeLabel: "半刚性" },
    revenue:  { expr: "营收比 ≤ 千分之4，费用增幅 ≤ 营收增幅 50%", desc: "挂钩营收", typeLabel: "弹性" },
    green:    { expr: "管养单价挂钩，超线降 ≥5~10%", desc: "单价挂钩", typeLabel: "半刚性" },
    actual:   { expr: "据实预算，须详细说明依据", desc: "据实申报", typeLabel: "项目型" },
    volume:   { expr: "按业务量 × 单位成本核定", desc: "业务量驱动", typeLabel: "弹性" },
    qtyPrice: { expr: "数量 × 单价联动核定", desc: "量价联动", typeLabel: "弹性" },
    history:  { expr: "参照历史实际，同比持平", desc: "历史基准", typeLabel: "弹性" },
    manual:   { expr: "据实申报，附业务依据", desc: "人工核定", typeLabel: "项目型" },
  };
  /* 以 BM.RULES 客户规则为权威主干（保留 canteen/dorm/revenue/green 等规则真实表述） */
  const map = {};
  (BM.RULES || []).forEach((r) => {
    const g = GENERIC[r.type] || { expr: r.expr, desc: r.desc, typeLabel: "弹性" };
    map[r.type] = { scopeKey: r.type, typeLabel: g.typeLabel, policy: r.expr, desc: r.desc || "", events: [r.cat] };
  });
  /* 高层控制方法（CTRL_METHOD_ASSIGN 的 value）→ 后端规则 scopeKey 桥接。
   * 前端 method 是语义层（manageStd/perCapita/yoy/fixed/keyEvent），
   * 后端 baseline 用具体规则代号。例如：车辆维修 method=manageStd → 套 down5（降 5%）。 */
  const METHOD_TO_SCOPE = {
    manageStd: "down5", perCapita: "actual", yoy: "history", fixed: "actual",
    keyEvent: "actual", history: "history", volume: "volume", qtyPrice: "qtyPrice",
    revenue: "revenue", green: "green", canteen: "canteen", dorm: "dorm",
    actual: "actual", manual: "manual",
  };
  /* 反查：把 CTRL_METHOD_ASSIGN 全部事项挂到对应 scopeKey（去重，避免与 RULES.cat 重复） */
  /* 英文名 → 中文名：CATEGORIES 里 id/name；没有则原样显示 */
  const catNameMap = {};
  (BM.CATEGORIES || []).forEach((c) => { catNameMap[c.id] = c.name; });
  function displayName(evt) { return catNameMap[evt] || evt; }
  const assign = BM.CTRL_METHOD_ASSIGN || {};
  Object.keys(assign).forEach((evt) => {
    const scope = METHOD_TO_SCOPE[assign[evt]] || assign[evt];
    if (!map[scope]) {
      const g = GENERIC[scope] || { expr: scope, desc: "", typeLabel: "弹性" };
      map[scope] = { scopeKey: scope, typeLabel: g.typeLabel, policy: g.expr, desc: g.desc || "", events: [] };
    }
    const name = displayName(evt);
    if (map[scope].events.indexOf(name) < 0) map[scope].events.push(name);
  });
  return Object.keys(map).map((k) => map[k]);
})();

/* ---------- M7 · AI 风险筛查结果（提示非判定） ---------- */
/* 每个风险项：
 *   id / cat（科目）/ company（公司） / type（异常类型）
 *   reason（原因）/ suggestAmount（建议金额，确定性计算给出）
 *   baseline（基线/原值，确定性）/ confidence（置信度 0~1，模型给出）
 *   level（风险等级：高/中/低，由置信度+金额推导）/ evidence（可追溯证据）
 *   status（pending 待复核 / adopt 采纳 / reject 驳回）
 */
BM.RISK_SCREENING = [
  {
    id: "RK01", cat: "车辆维修", company: "2010", type: "异常金额",
    reason: "近 3 月出现 2 笔大额维修单（制动系统/变速箱），单价环比 +9%，疑似非计划性大修集中发生。",
    baseline: 1200000, suggestAmount: 980000,
    confidence: 0.86,
    evidence: ["数据来源：2026 年 1-9 月车辆维修单据 18 笔", "对比：2025 同期同类维修 9 笔，金额低 31%", "特征：单笔 >8 万占比由 11% 升至 28%"],
  },
  {
    id: "RK02", cat: "办公用品", company: "2010", type: "结构异常",
    reason: "打印纸张用量同比 +41%，但会议次数仅 +35%，纸张增速高于会议增速，疑似非必要打印或浪费。",
    baseline: 700000, suggestAmount: 640000,
    confidence: 0.72,
    evidence: ["数据来源：打印系统 + 采购流水", "关联：员工 +28% 但纸张 +41%，弹性偏高", "口径：与同规模公司人均纸张成本对比"],
  },
  {
    id: "RK03", cat: "差旅费", company: "2020", type: "费用转移",
    reason: "差旅费中多笔住宿费高于差旅标准 1.4 倍，且集中在同一供应商，疑似将招待费转入差旅列支。",
    baseline: 1800000, suggestAmount: 1620000,
    confidence: 0.81,
    evidence: ["数据来源：费控导出住宿单据 23 笔", "对比：标准限额 1.5 万，超标准 16 笔", "特征：供应商集中度 62% 高于正常 30%"],
  },
  {
    id: "RK04", cat: "业务招待", company: "2010", type: "疑似错科目",
    reason: "业务招待出现多笔「客户接待宴请」却走办公用品科目报销，疑似错科目，导致业务招待实际被低估。",
    baseline: 400000, suggestAmount: 520000,
    confidence: 0.78,
    evidence: ["数据来源：费控导出 2026 年报销明细", "特征：办公用品科目含餐饮类发票 31 张", "映射：应归口业务招待（会计科目 6602.08）"],
  },
  {
    id: "RK05", cat: "食堂费用", company: "2020", type: "单位差异",
    reason: "食堂人均成本 7.6 元/餐，高于管理标准 7 元/餐上限，按规则须降 ≥5%，且夜间餐次占比异常偏高。",
    baseline: 3600000, suggestAmount: 3420000,
    confidence: 0.69,
    evidence: ["数据来源：食堂系统人均成本月报", "对比：集团均值 6.8 元/餐", "规则：R02 人均 7 元 ±3%"],
  },
  {
    id: "RK06", cat: "培训费", company: "1000", type: "高风险单位",
    reason: "该单位培训费执行率仅 52%，远低于集团均值 78%，疑似预算虚高或计划未落地，挤占可调剂空间。",
    baseline: 1000000, suggestAmount: 720000,
    confidence: 0.64,
    evidence: ["数据来源：2026 年 1-9 月培训执行", "对比：集团同口径执行率 78%", "特征：计划课程完成率 61%"],
  },
];

/* ================================================================
 * 阶段一：组织/角色范围模型（V2 §2.0 / §2.2；映射文档 §1、§2）
 * 全 mock、不接后端；敏感/待确认项以占位 + TODO 标注，不硬编码假设。
 * ================================================================ */

/* 角色 → 数据范围层级（V2 §2.2 权限原则）
 *   group=集团全量 / company=本公司+下属 / center=归口科目跨公司 / self=仅本人项目 */
BM.SCOPE_LEVELS = {
  ceo: "group", cooLead: "group", cooAnalyst: "group",
  legalHead: "company", adminHead: "company", companyBudgeter: "company",
  centerOwner: "center", expense: "self",
};

/* 11 职能中心（管理维度主体，跨法人公司）
 * TODO（V2 §8-15 / 设计稿 §8.2-1）：11 中心完整清单与「中心×科目归口矩阵」尚未客户确认，
 *   此处先用命名占位 + 部分科目映射样例，待确认后替换。subjects 引用 BM.RULES.cat / BM.CATEGORIES.name。 */
BM.FUNCTIONAL_CENTERS = [
  { id: "hr",      name: "人资中心",   owner: "人资",     subjects: ["培训费"] },
  { id: "office",  name: "办公室",     owner: "总经办",   subjects: ["总办办公费", "办公用品"] },
  { id: "qc",      name: "品管中心",   owner: "品管",     subjects: [] },
  { id: "strategy",name: "战略运营中心", owner: "战略运营", subjects: [] },
  { id: "fin",     name: "财务中心",   owner: "财务",     subjects: ["差旅费"] },
  { id: "itc",     name: "信息化中心", owner: "信息化",   subjects: ["IT 设备"] },
  { id: "prop",    name: "物业中心",   owner: "行政",     subjects: ["绿化费"] },
  { id: "rd",      name: "研发中心",   owner: "研发",     subjects: [] },
  { id: "buy",     name: "采购中心",   owner: "采购",     subjects: [] },
  { id: "risk",    name: "风控中心",   owner: "风控",     subjects: [] },
  { id: "mfg",     name: "运营中心",   owner: "运营",     subjects: [] },
];

/* 事业部 ↔ 法人公司归属（老板「事业部维度」聚合所需）
 * TODO（V2 §8-17 / 设计稿 §8.2-3）：真实归属清单尚未客户确认，此处为占位样例。
 * 完整口径（含海外日本/欧洲/香港）待确认后替换。 */
BM.BUSINESS_DIVISIONS = [
  { id: "bd_led",   name: "LED 事业部",     companies: ["2010", "2020", "2030"] },
  { id: "bd_chip",  name: "集成电路事业部", companies: ["2170", "2180"] },
  { id: "bd_opto",  name: "光电子事业部",   companies: ["3050", "3200"] },
  // TODO: 其余事业部与公司代码（含海外）待客户确认补充
];

/* 基层 7 类费用责任岗位（统一为 expense 角色 + etype 区分） */
BM.EXPENSE_TYPES = [
  { id: "canteen",  name: "食堂管理", subjects: ["食堂费用"] },
  { id: "vehicle",  name: "车辆管理", subjects: ["车辆维修"] },
  { id: "property", name: "物业管理", subjects: ["绿化费"] },
  { id: "dorm",     name: "宿舍管理", subjects: ["宿舍费用"] },
  { id: "travel",   name: "差旅管理", subjects: ["差旅费"] },
  { id: "welfare",  name: "福利管理", subjects: ["培训费"] },
  { id: "other",    name: "其他费用", subjects: ["总办办公费"] },
];

/* 单数据源·双派生视角：同一经济事项为唯一事实源（~390 经济事项，V2 §3.4.10）
 * 财务聚合视图（会计口径，按 BM.CATEGORIES 会计科目归集）vs 管理指标视图（管理口径，按职能中心归集），均派生自同一份数据。
 * TODO（V2 §8-16 / 设计稿 §8.2-2）：财务(~220) vs 管理(~390) 科目映射与差异归因规则未确认；
 *   此处仅取现有 6 个 RULES 科目作派生样例，全量 ~390 待后端/主数据接入。
 * 两条线金额由同一 lastYear 经确定性规则派生，体现「同一份数据、双派生视角（财务聚合/管理指标）」；管理线非独立填报口。 */
BM.DUAL_TRACK = BM.RULES.map(function (r) {
  const fin = r.lastYear != null ? r.lastYear : 0;
  /* 管理口径：按中心标准再降一档（样例：管理口径通常更细、更强调降本） */
  const mgt = r.lastYear != null ? Math.round(r.lastYear * 0.93) : 0;
  const center = (BM.FUNCTIONAL_CENTERS.find(function (c) { return c.subjects.indexOf(r.cat) >= 0; }) || {}).name || "—";
  const acct = (BM.CATEGORIES.find(function (c) { return c.name === r.cat; }) || {}).accountCode || "—";
  return {
    event: r.cat,
    lastYear: r.lastYear,
    finLine: { amount: fin, accountCode: acct, caliber: "财务口径（会计规则归集）" },
    mgtLine: { amount: mgt, center: center, caliber: "管理口径（职能中心归集）" },
    /* 错位双归属标签（V2 §2.0 / 设计稿 §6.4）；样例：劳动关系在 2010，预算在总部 */
    costOwnerOrg: "2010",
    budgetOwnerOrg: "HQ",
  };
});

window.BM = BM;
