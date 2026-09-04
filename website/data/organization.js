/* ================================================================
 * data/organization.js — 组织/角色字典
 * 迁移自 data/data.js（原 1486 行上帝文件，2026-09-04 拆分）
 * 依赖：无（data 分层第一个加载）
 * 挂载 BM.DEMO_DATE/YEAR、ORGS/DEPTS/ROLES、
 *   COMPANIES/BUSINESS_UNITS/LEVEL1_DEPTS/ORG_TREE、
 *   ROLE_HINTS+fillRoleHints、
 *   SCOPE_LEVELS/FUNCTIONAL_CENTERS/BUSINESS_DIVISIONS/EXPENSE_TYPES
 * ================================================================ */

(function () {
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

window.BM = BM;
})();
