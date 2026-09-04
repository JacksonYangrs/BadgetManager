/* ================================================================
 * data/budget.js — 预算科目/项目/物料
 * 迁移自 data/data.js（原 1486 行上帝文件，2026-09-04 拆分）
 * 依赖：organization.js（先于本文件加载）
 * 挂载 BM.CATEGORIES(+used/usedFrozen)、SUMMARY、PROJECTS(+remain/execRate)、
 *   projectInfo/scopedProjects、MATERIALS、ADJUST_TYPES、DEFAULT_RULES、
 *   attachCatMeta、yearForecast/variance、buildPlanSuggestion/buildTopDownSuggestion
 * ================================================================ */

(function () {
var BM = window.BM || {};

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

/* ---------- 预算调整（财务经理专属） ---------- */
BM.ADJUST_TYPES = [
  { id: "transfer", name: "预算调剂", desc: "项目间转移预算额度" },
  { id: "add", name: "追加预算", desc: "给项目追加额度" },
  { id: "cut", name: "调减预算", desc: "收回项目未用额度" },
];

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

window.BM = BM;
})();
