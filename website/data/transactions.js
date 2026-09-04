/* ================================================================
 * data/transactions.js — 单据/审批/建议/风险流水
 * 迁移自 data/data.js（原 1486 行上帝文件，2026-09-04 拆分）
 * 依赖：organization.js、budget.js（buildDocs 读 CATEGORIES/YEAR）
 * 挂载 BM.DOCS(buildDocs)、APPROVAL_RULES/APPROVALS、
 *   SUGGESTIONS/SUGGESTED_QUESTIONS/RISKS、RISK_SCREENING
 * ================================================================ */

(function () {
var BM = window.BM || {};

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

/* ================================================================
 * v0.13 增量（本期新增前端界面所需数据）
 *  - BM.RISK_SCREENING：M7 AI 风险筛查结果（mock，提示非判定）
 *  金额/规则与既有 demo 同源；风险数据脱敏，仅典型子集。
 * ================================================================ */

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

window.BM = BM;
})();
