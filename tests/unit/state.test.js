/* ================================================================
 * state.test.js — Suite B：BM.state 业务规则 / 权限 / 派生 / 单据操作
 * 依赖 harness 加载的 BM（data+calc+state）。每个用例前 reset 隔离。
 * ================================================================ */
const assert = require("assert");
const { BM, check, suite, reset } = require("./harness");

function findCat(id) { return BM.CATEGORIES.find((c) => c.id === id); }

suite("Suite B · state.js 预算派生/权限/审批/采购/调整/报销", () => {

  /* ---------- 预算派生（考虑调剂） ---------- */
  check("getCatBudget 计入调入调剂", () => {
    reset();
    const base = BM.getCatBudget("it");
    BM.state.transfers = { "in:it": 50000 };
    assert.strictEqual(BM.getCatBudget("it"), base + 50000);
  });

  check("getCatBudget 扣除调出调剂", () => {
    reset();
    const base = BM.getCatBudget("it");
    BM.state.transfers = { "out:it": 30000 };
    assert.strictEqual(BM.getCatBudget("it"), base - 30000);
  });

  check("getCatRemain = 预算 - 已用 - 冻结（含调剂）", () => {
    reset();
    const cat = findCat("it");
    BM.state.transfers = { "in:it": 50000 };
    const expect = (cat.budget + 50000) - cat.used - cat.frozen;
    assert.strictEqual(BM.getCatRemain("it"), expect);
  });

  check("getCatExecRate 执行率公式", () => {
    reset();
    const cat = findCat("it");
    const expect = cat.budget ? Math.round((cat.used / cat.budget) * 1000) / 10 : 0;
    assert.strictEqual(BM.getCatExecRate("it"), expect);
  });

  /* ---------- 审批链计算 ---------- */
  check("getApprovalChain 各档金额边界", () => {
    assert.deepStrictEqual(BM.getApprovalChain(1000), ["部门负责人"]);
    assert.deepStrictEqual(BM.getApprovalChain(5000), ["部门负责人"]);
    assert.deepStrictEqual(BM.getApprovalChain(5001), ["部门负责人", "财务审批"]);
    assert.deepStrictEqual(BM.getApprovalChain(30000), ["部门负责人", "财务审批"]);
    assert.deepStrictEqual(BM.getApprovalChain(30001), ["部门负责人", "财务审批", "总经理"]);
    assert.deepStrictEqual(BM.getApprovalChain(1e12), ["部门负责人", "财务审批", "总经理"]);
  });

  /* ---------- 角色可见视图 ---------- */
  check("roleViews · admin 含 accounts + basedata", () => {
    reset();
    BM.state.role = "admin";
    const v = BM.roleViews();
    assert.ok(v.includes("accounts") && v.includes("basedata") && v.includes("compile"));
    assert.ok(v.includes("wb-home") && v.includes("kanban") && v.includes("rules"));
  });

  check("roleViews · boss 不含 accounts/basedata（非 BD 角色）", () => {
    reset();
    BM.state.role = "boss";
    const v = BM.roleViews();
    assert.ok(!v.includes("accounts"));
    assert.ok(!v.includes("basedata"));
    assert.ok(v.includes("compile"));
  });

  check("roleViews · staff = 基础四视图", () => {
    reset();
    BM.state.role = "staff";
    assert.deepStrictEqual(BM.roleViews(), ["wb-home", "compile", "kanban", "rules"]);
  });

  check("roleViews · 真实登录补 BASE 兜底（核心入口始终可见）", () => {
    reset();
    BM.state.role = "staff"; // 演示通道回退值，应被忽略
    BM.state.user = { roles: [{ code: "finance", views: ["wb-home", "rules"] }, { code: "centerOwner", views: ["basedata"] }] };
    const v = BM.roleViews();
    // 修复后真实登录分支兜底 BASE=[wb-home,compile,kanban,rules]，再并入角色 views 并集
    assert.ok(v.includes("wb-home") && v.includes("compile") && v.includes("kanban") && v.includes("rules"));
    assert.ok(v.includes("basedata")); // 角色 views 并集（centerOwner）并入
    assert.ok(!v.includes("accounts")); // finance 非 admin → 不应有 accounts
  });

  check("roleViews · 真实登录 admin 角色补 accounts + basedata", () => {
    reset();
    BM.state.user = { roles: [{ code: "admin", views: ["wb-home"] }] };
    const v = BM.roleViews();
    assert.ok(v.includes("accounts"));
    assert.ok(v.includes("basedata"));
    assert.ok(v.includes("compile") && v.includes("kanban") && v.includes("rules"));
  });

  /* ---------- 编辑权限闸门 ---------- */
  check("canEditBaseData · admin 可 / staff 不可", () => {
    reset();
    BM.state.role = "admin"; assert.strictEqual(BM.canEditBaseData(), true);
    BM.state.role = "staff"; assert.strictEqual(BM.canEditBaseData(), false);
  });
  check("canEditBaseData · 真实角色 finance 优先", () => {
    reset();
    BM.state.role = "staff";
    BM.state.user = { roles: [{ code: "finance" }] };
    assert.strictEqual(BM.canEditBaseData(), true);
  });

  check("canEditAccounts · ceo 可 / staff 不可", () => {
    reset();
    BM.state.role = "ceo"; assert.strictEqual(BM.canEditAccounts(), true);
    BM.state.role = "staff"; assert.strictEqual(BM.canEditAccounts(), false);
  });

  check("canEditOrg · admin 可 / finance 不可 / cooLead 可", () => {
    reset();
    BM.state.role = "admin"; assert.strictEqual(BM.canEditOrg(), true);
    BM.state.role = "finance"; assert.strictEqual(BM.canEditOrg(), false);
    BM.state.user = { roles: [{ code: "cooLead" }] };
    assert.strictEqual(BM.canEditOrg(), true);
  });

  check("canViewBenchmark · 集团层可见 / 部门经理不可", () => {
    reset();
    BM.state.role = "boss"; assert.strictEqual(BM.canViewBenchmark(), true);
    BM.state.role = "finance"; assert.strictEqual(BM.canViewBenchmark(), true);
    BM.state.role = "manager"; assert.strictEqual(BM.canViewBenchmark(), false);
  });

  /* ---------- 数据范围 ---------- */
  check("scopedData · 角色→层级映射", () => {
    reset();
    BM.state.role = "boss"; assert.strictEqual(BM.scopedData().level, "group");
    BM.state.role = "manager"; assert.strictEqual(BM.scopedData().level, "company");
    BM.state.role = "centerOwner"; BM.state.centerId = "hr";
    const c = BM.scopedData();
    assert.strictEqual(c.level, "center");
    assert.deepStrictEqual(c.subjectFilter, ["培训费"]);
    BM.state.role = "expense"; assert.strictEqual(BM.scopedData().level, "self");
  });

  check("scopedApprovals · 总经理全量 / 部门经理按部门", () => {
    reset();
    BM.state.role = "boss";
    assert.strictEqual(BM.scopedApprovals().length, BM.state.approvals.length);
    reset();
    BM.state.role = "manager"; BM.state.deptId = "admin";
    const mgr = BM.scopedApprovals();
    assert.ok(mgr.every((a) => a.deptName === "行政部" || !a.deptName));
  });

  check("scopedApprovals · 归口责任人仅见归口科目", () => {
    reset();
    BM.state.role = "centerOwner"; BM.state.centerId = "hr";
    BM.state.approvals.unshift({ id: "X1", title: "t", catName: "培训费", deptName: "人事部", amount: 1, status: "pending" });
    const c = BM.scopedApprovals();
    assert.ok(c.some((a) => a.id === "X1"));
    assert.ok(c.every((a) => a.catName === "培训费"));
  });

  check("scopedApprovals · 员工仅见本人发起（含 requester）", () => {
    reset();
    BM.state.role = "staff";
    BM.requestPurchase({ amount: 1 });
    const st = BM.scopedApprovals();
    assert.ok(st.some((a) => a.requester));
  });

  /* ---------- 规则拦截 ---------- */
  check("isPurchaseBlocked · 不允许超预算时拦截", () => {
    reset();
    BM.state.rules.allowOverBudget = false;
    assert.strictEqual(BM.isPurchaseBlocked(100, 200), true);
    assert.strictEqual(BM.isPurchaseBlocked(200, 100), false);
    BM.state.rules.allowOverBudget = true;
    assert.strictEqual(BM.isPurchaseBlocked(100, 200), false);
  });

  /* ---------- 建议采纳/忽略/撤回 ---------- */
  check("adoptSuggestion SUG001 · 写入 IT/培训 调剂并生效", () => {
    reset();
    const baseIt = findCat("it").budget;
    const r = BM.adoptSuggestion("SUG001");
    assert.ok(r && r.transfer && r.transfer.amount === 300000);
    assert.strictEqual(BM.state.transfers["in:it"], 300000);
    assert.strictEqual(BM.state.transfers["out:training"], 300000);
    assert.strictEqual(BM.getCatBudget("it"), baseIt + 300000);
    assert.strictEqual(BM.state.suggestions.find((s) => s.id === "SUG001").status, "adopted");
  });

  check("revertSuggestion SUG001 · 清理调剂并复位状态", () => {
    reset();
    BM.adoptSuggestion("SUG001");
    BM.revertSuggestion("SUG001");
    assert.strictEqual(BM.state.transfers["in:it"], undefined);
    assert.strictEqual(BM.state.suggestions.find((s) => s.id === "SUG001").status, "pending");
  });

  check("adoptSuggestion SUG002 · 生成框架协议单", () => {
    reset();
    BM.adoptSuggestion("SUG002");
    assert.ok(BM.state.approvals.some((d) => d.note && d.note.indexOf("AI 建议") >= 0));
    BM.revertSuggestion("SUG002");
    assert.ok(!BM.state.approvals.some((d) => d.note && d.note.indexOf("AI 建议") >= 0));
  });

  check("ignoreSuggestion · 状态置 ignored", () => {
    reset();
    BM.ignoreSuggestion("SUG003");
    assert.strictEqual(BM.state.suggestions.find((s) => s.id === "SUG003").status, "ignored");
  });

  /* ---------- 采购发起 ---------- */
  check("requestPurchase · 预算充足→ok（注入调剂使 IT 转正）", () => {
    reset();
    BM.state.transfers = { "in:it": 5000000 }; // 让 IT 可用预算为正，验证充足分支
    const r = BM.requestPurchase({ amount: 1 });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.doc.status, "pending");
  });
  check("requestPurchase · 巨额超预算→建议调剂", () => {
    reset();
    const r = BM.requestPurchase({ amount: 1e12 });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.transferId, "SUG001");
  });

  check("requestPurchaseForProject · 充足/不足两分支", () => {
    reset();
    const p = BM.PROJECTS[0];
    assert.strictEqual(BM.requestPurchaseForProject(p.id, { amount: 1 }).ok, true);
    const r2 = BM.requestPurchaseForProject(p.id, { amount: 1e12 });
    assert.strictEqual(r2.ok, false);
    assert.strictEqual(r2.suggestAdjust, true);
  });

  /* ---------- 预算调整 ---------- */
  check("createAdjustment + approveAdjustment · 追加生效", () => {
    reset();
    const p = BM.PROJECTS[0];
    const before = p.budget;
    const adj = BM.createAdjustment("add", p.id, 50000, "测试");
    assert.strictEqual(adj.status, "pending");
    BM.approveAdjustment(adj.id, "approve");
    assert.strictEqual(p.budget, before + 50000);
  });
  check("approveAdjustment · 调减生效", () => {
    reset();
    const p = BM.PROJECTS[0];
    const before = p.budget;
    const adj = BM.createAdjustment("cut", p.id, 10000, "测试");
    BM.approveAdjustment(adj.id, "approve");
    assert.strictEqual(p.budget, Math.max(0, before - 10000));
  });
  check("approveAdjustment · 驳回不改预算", () => {
    reset();
    const p = BM.PROJECTS[0];
    const before = p.budget;
    const adj = BM.createAdjustment("add", p.id, 50000, "测试");
    BM.approveAdjustment(adj.id, "reject");
    assert.strictEqual(p.budget, before);
  });

  /* ---------- 报销入账 ---------- */
  check("submitReimburse · 入账更新已用", () => {
    reset();
    const p = BM.PROJECTS[0];
    const usedBefore = p.used;
    const r = BM.submitReimburse({ projectId: p.id, amount: 1000, item: "差旅" });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(p.used, usedBefore + 1000);
    assert.strictEqual(r.doc.status, "已入账");
  });
  check("submitReimburse · 超预算检出", () => {
    reset();
    const p = BM.PROJECTS[0];
    p.budget = 100; p.used = 90; p.frozen = 0;
    const r = BM.submitReimburse({ projectId: p.id, amount: 50, item: "x" });
    assert.strictEqual(r.over, true);
    assert.ok(r.remainAfter < 0);
  });

});
