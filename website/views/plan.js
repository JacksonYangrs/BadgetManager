/* ================================================================
 * plan.js — 预算编制页
 * 双模式：自上而下分解（总经理定总额 → AI 分配） /
 *         自下而上填报（部门经理填报 → 财务汇总 → 总经理批）
 * AI 编制助手：按历史执行年化预填建议额度
 * ================================================================ */

var BM = window.BM || {};



/* 编制流程状态机 */
/* 流程状态（v0.12：按编制模式区分） */
/* mode: 'topdown' 自上而下 | 'bottomup' 自下而上 */
function flowNodes(status, mode) {
  if (mode === "topdown") {
    /* 自上而下：总经理定总额 → 部门分解 → 个人分解 → 财务汇总 → 批准 */
    if (status === "draft") {
      return [
        { label: "总经理定总额", state: "current" },
        { label: "部门分解", state: "" },
        { label: "个人分解", state: "" },
        { label: "财务汇总", state: "" },
        { label: "总经理批准", state: "" },
      ];
    }
    if (status === "submitted") {
      return [
        { label: "总经理定总额", state: "done" },
        { label: "部门分解", state: "done" },
        { label: "个人分解", state: "current" },
        { label: "财务汇总", state: "" },
        { label: "总经理批准", state: "" },
      ];
    }
    if (status === "finance_approved") {
      return [
        { label: "总经理定总额", state: "done" },
        { label: "部门分解", state: "done" },
        { label: "个人分解", state: "done" },
        { label: "财务汇总", state: "done" },
        { label: "总经理批准", state: "current" },
      ];
    }
    if (status === "approved") {
      return [
        { label: "总经理定总额", state: "done" },
        { label: "部门分解", state: "done" },
        { label: "个人分解", state: "done" },
        { label: "财务汇总", state: "done" },
        { label: "总经理批准", state: "done" },
      ];
    }
    if (status === "rejected") {
      return [
        { label: "总经理定总额", state: "done" },
        { label: "部门分解", state: "current" },
        { label: "个人分解", state: "" },
        { label: "财务汇总", state: "" },
        { label: "总经理批准", state: "" },
      ];
    }
    return [];
  }

  /* 自下而上：个人提报 → 部门汇总 → 财务汇总 → 总经理批准 */
  if (status === "draft") {
    return [
      { label: "个人提报", state: "current" },
      { label: "部门汇总", state: "" },
      { label: "财务汇总", state: "" },
      { label: "总经理批准", state: "" },
    ];
  }
  if (status === "submitted") {
    return [
      { label: "个人提报", state: "done" },
      { label: "部门汇总", state: "current" },
      { label: "财务汇总", state: "" },
      { label: "总经理批准", state: "" },
    ];
  }
  if (status === "finance_approved") {
    return [
      { label: "个人提报", state: "done" },
      { label: "部门汇总", state: "done" },
      { label: "财务汇总", state: "done" },
      { label: "总经理批准", state: "current" },
    ];
  }
  if (status === "approved") {
    return [
      { label: "个人提报", state: "done" },
      { label: "部门汇总", state: "done" },
      { label: "财务汇总", state: "done" },
      { label: "总经理批准", state: "done" },
    ];
  }
  if (status === "rejected") {
    return [
      { label: "个人提报", state: "done" },
      { label: "部门汇总", state: "current" },
      { label: "财务汇总", state: "" },
      { label: "总经理批准", state: "" },
    ];
  }
  return [];
}

/* ========== v0.5：自由语言 → LLM 归类（自上而下，总经理/财务） ========== */
function renderIntentParser(container) {
  const box = el("div", "plan-editor");
  box.style.marginBottom = "16px";
  const head = el("div", "card-head");
  head.innerHTML = `<div class="card-icon" style="background:var(--c-accent);color:var(--c-primary-deep)">AI</div>
    <div class="card-title">自由语言分解（AI 归类）</div>
    <span class="card-tag badge badge-accent">LLM 归类</span>`;
  box.appendChild(head);

  const body = el("div", "card-body");
  const ta = el("textarea");
  ta.rows = 3;
  ta.placeholder = '例如：车辆维修 120 万，IT 设备 80 万，显示器项目 7.8 万，办公用品 60 万，服务器采购 22 万，年度培训 100 万';
  ta.style.width = "100%";
  ta.style.border = "1px solid var(--c-border)";
  ta.style.borderRadius = "8px";
  ta.style.padding = "10px 12px";
  ta.style.fontSize = "13px";
  ta.style.fontFamily = "var(--font)";
  ta.style.lineHeight = "1.6";
  body.appendChild(ta);

  const actions = el("div", "plan-actions");
  const btn = el("button", "btn btn-accent", "AI 解析归类 →");
  const resultBox = el("div", "");
  resultBox.style.marginTop = "12px";
  btn.addEventListener("click", () => {
    const items = BM.parseBudgetIntent(ta.value);
    resultBox.innerHTML = "";
    const tbl = el("div", "tbl-wrap");
    const table = el("table");
    table.innerHTML = `<thead><tr><th>归类目标</th><th>类型</th><th style="text-align:right">金额</th><th>映射</th></tr></thead>`;
    const tbody = el("tbody");
    let total = 0;
    items.forEach((it) => {
      total += it.amount;
      const typeLabel = it.type === "cat" ? "科目" : it.type === "project" ? "项目" : it.type === "material" ? "物料" : "未识别";
      const mapInfo =
        it.type === "cat" ? it.name
        : it.type === "project" ? `${it.name}（${(BM.CATEGORIES.find((c) => c.id === it.catId) || {}).name}）`
        : it.type === "material" ? `${it.name} → ${(BM.PROJECTS.find((p) => p.id === it.projectId) || {}).name}`
        : it.note || "";
      const tr = el("tr");
      tr.innerHTML = `<td><b>${esc(it.name)}</b></td>
        <td><span class="badge ${it.type === "unknown" ? "badge-danger" : "badge-info"}">${typeLabel}</span></td>
        <td class="tbl-num" style="text-align:right">${BM.money(it.amount)}</td>
        <td class="hint-text">${esc(mapInfo)}</td>`;
      tbody.appendChild(tr);
    });
    const sumTr = el("tr");
    sumTr.innerHTML = `<td colspan="2"><b>合计</b></td><td class="tbl-num" style="text-align:right"><b>${BM.money(total)}</b></td><td></td>`;
    tbody.appendChild(sumTr);
    table.appendChild(tbody);
    tbl.appendChild(table);
    resultBox.appendChild(tbl);

    /* 应用按钮：把归类结果写入 plan.rows（按科目汇总） */
    const apply = el("button", "btn btn-primary btn-sm", "应用到预算明细 ↓");
    apply.style.marginTop = "10px";
    apply.addEventListener("click", () => {
      const p = BM.state.plan;
      /* 科目级：按科目汇总金额 */
      items.forEach((it) => {
        if (it.type === "cat" && it.catId) {
          /* 科目级预算：写入 plan.rows 的科目 key */
          p.rows["cat:" + it.id] = it.amount;
        }
        if (it.type === "project" && it.id) {
          p.rows["proj:" + it.id] = it.amount;
        }
        if (it.type === "material" && it.id) {
          p.rows["mat:" + it.id] = it.amount;
        }
      });
      BM.planSaveRows(p.rows);
      BM.openView("plan");
      BM.toast("AI 归类结果已应用到预算明细");
    });
    resultBox.appendChild(apply);
  });
  actions.appendChild(btn);
  body.appendChild(actions);
  body.appendChild(resultBox);
  box.appendChild(body);
  return box;
}

function renderPlan(container) {
  container.innerHTML = "";
  const page = el("div", "page");
  const role = BM.state.role;

  /* 页头 */
  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-head-row">
      <div><div class="page-title">预算编制 · 2026 年度</div>
      <div class="page-desc">编制方式由预算规则决定 · AI 按历史执行预填建议</div></div>
      <button class="btn btn-outline btn-sm" id="importHistoryBtn">📂 历史数据导入</button>
    </div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "plan");

  /* 流程状态 */
  const sb = el("div", "plan-statusbar");
  const flow = el("div", "plan-flow");
  flowNodes(BM.state.plan.status, BM.state.rules.planMode).forEach((n) => {
    flow.appendChild(el("span", "pf-node" + (n.state ? " " + n.state : ""), n.label));
    flow.appendChild(el("span", "flow-arrow", "→"));
  });
  flow.removeChild(flow.lastChild);
  sb.appendChild(flow);
  if (BM.state.plan.submittedBy) {
    sb.appendChild(el("span", "hint-text", `提交：${esc(BM.state.plan.submittedBy)} · ${BM.state.plan.submittedTime}`));
  }
  page.appendChild(sb);

  /* v0.9：不再显示模式切换按钮 —— 编制方式由预算规则决定，只显示当前规则标签 */
  const ruleMode = BM.state.rules.planMode; // topdown / bottomup
  const ruleTag = el("div", "plan-statusbar");
  ruleTag.innerHTML = `<span class="hint-text">当前编制规则（财务已设置）：</span>
    <span class="badge ${ruleMode === "topdown" ? "badge-gray" : "badge-ok"}">${ruleMode === "topdown" ? "自上而下 · 只分解不可新增" : "自下而上 · 可新增可编辑"}</span>
    <span class="hint-text">${ruleMode === "topdown" ? "总经理定总额，下级在既有范围内分解" : "部门/员工按项目物料上报，可自行增加"}</span>`;
  page.appendChild(ruleTag);

  /* 编辑区：模式由预算规则决定 */
  const editor = el("div", "");
  const effectiveMode = ruleMode;

  /* v0.5：自上而下 + 集团 CEO/总经办预算管理员 → 自由语言归类 */
  if (effectiveMode === "topdown" && (role === "ceo" || role === "cooAnalyst")) {
    editor.appendChild(renderIntentParser(container));
  }

  const isDecompose = effectiveMode === "topdown";
  const isSubmitter = role === "adminHead" || role === "expense";
  editor.appendChild(el("div", "section-title",
    isDecompose
      ? (isSubmitter ? "预算分解（按项目 · 物料 · 受上级额度约束）" : "预算分解（按部门）")
      : "预算填报（按项目 · 物料）"));

  if (isDecompose) {
    if (isSubmitter) {
      /* v0.10：部门经理/员工 —— 在上级额度内分解到项目/物料 */
      editor.appendChild(renderDecomposeView(container));
    } else {
      editor.appendChild(renderTopdown(container));
    }
  } else {
    editor.appendChild(renderBottomup(container));
  }
  page.appendChild(editor);

  /* v0.6：客户规则引擎（仅集团编制角色 ceo / cooAnalyst） */
  if (role === "ceo" || role === "cooAnalyst") {
    page.appendChild(renderClientRuleEngine(container));
  }

  /* 操作按钮（v0.10：提交前审查 —— 分解加总 ≤ 上级额度） */
  const canEdit = BM.state.plan.status === "draft" || BM.state.plan.status === "rejected";
  const actions = el("div", "plan-actions");
  if (isSubmitter && canEdit) {
    const submit = el("button", "btn btn-primary", "提交预算 → 预算管理员汇总");
    submit.addEventListener("click", () => {
      const check = checkDecomposeTotal();
      if (!check.ok) {
        BM.toast(check.msg);
        return;
      }
      BM.planSubmit();
      BM.openView("plan");
      BM.toast("预算已提交，等待预算管理员汇总");
    });
    actions.appendChild(submit);
    actions.appendChild(el("span", "hint-text", "提交时自动审查：分解加总须 ≤ 上级额度"));
  }
  if (role === "companyBudgeter" && BM.state.plan.status === "submitted") {
    const submit = el("button", "btn btn-primary", "汇总校验确认 → 提交集团审批");
    submit.addEventListener("click", () => {
      BM.planSubmit();
      BM.openView("plan");
      BM.toast("已汇总校验，已提交集团审批");
    });
    actions.appendChild(submit);
  }
  if (role === "ceo" && BM.state.plan.status === "finance_approved") {
    const approve = el("button", "btn btn-accent", "批准预算编制");
    approve.addEventListener("click", () => {
      BM.planApprove();
      BM.openView("plan");
      BM.toast("2026 年度预算已批准");
    });
    const reject = el("button", "btn btn-outline", "退回修改");
    reject.addEventListener("click", () => {
      BM.planReject();
      BM.openView("plan");
      BM.toast("已退回，部门重新填报");
    });
    actions.appendChild(approve);
    actions.appendChild(reject);
  }
  if (canEdit && role !== "expense") {
    actions.appendChild(el("span", "hint-text", "AI 已按 1-9 月历史执行年化预填建议额度，可直接修改"));
  }
  page.appendChild(actions);

  container.appendChild(page);

  /* 历史数据导入按钮 */
  const importBtn = document.getElementById("importHistoryBtn");
  if (importBtn) {
    importBtn.addEventListener("click", () => {
      BM.showImportModal();
    });
  }
}

/* ================================================================
 * 历史数据导入弹窗（完整功能演示）
 * 流程：上传 → 解析预览 → 确认导入 → 数据注入 BM.DOCS → 刷新 AI 建议
 * ================================================================ */
BM.showImportModal = function () {
  const overlay = el("div", "modal-overlay");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:500;display:flex;align-items:center;justify-content:center";

  const modal = el("div", "login-card");
  modal.style.maxWidth = "600px";
  modal.style.padding = "32px 36px";
  modal.style.margin = "0";

  let step = 1;
  let file = null;

  /* 模拟解析的历史数据（从文件中解析出的结构化记录） */
  var mockRecords = [
    { deptName: "行政部", catName: "办公用品", desc: "季度办公耗材采购", amount: 45200, date: "2025-03-15", supplier: "晨光办公", type: "采购" },
    { deptName: "IT 部", catName: "IT 设备", desc: "服务器扩容采购", amount: 180000, date: "2025-05-20", supplier: "华联电子", type: "采购" },
    { deptName: "市场部", catName: "业务招待", desc: "客户接待宴请", amount: 67500, date: "2025-06-10", supplier: "粤香楼", type: "报销" },
    { deptName: "销售部", catName: "差旅费", desc: "季度出差机票", amount: 89000, date: "2025-04-18", supplier: "携程商旅", type: "报销" },
    { deptName: "IT 部", catName: "IT 设备", desc: "办公电脑更换", amount: 120000, date: "2025-07-05", supplier: "未来数码", type: "采购" },
    { deptName: "行政部", catName: "物业费", desc: "物业管理服务费", amount: 147000, date: "2025-01-15", supplier: "恒信物业", type: "合同付款" },
    { deptName: "人事部", catName: "培训费", desc: "管理干部集训", amount: 98000, date: "2025-08-22", supplier: "领航咨询", type: "报销" },
    { deptName: "市场部", catName: "办公用品", desc: "展会宣传物料", amount: 38000, date: "2025-09-10", supplier: "得力办公", type: "采购" },
    { deptName: "财务部", catName: "IT 设备", desc: "财务系统服务器", amount: 65000, date: "2025-05-28", supplier: "华联电子", type: "采购" },
    { deptName: "IT 部", catName: "水电费", desc: "机房电费", amount: 28000, date: "2025-07-31", supplier: "市供电局", type: "报销" },
  ];

  /* 生成更多 mock 记录以充实数据量 */
  var expandedRecords = [];
  mockRecords.forEach(function (r) {
    for (var i = 0; i < 5; i++) {
      var m = parseInt(r.date.split("-")[1]);
      var d = (parseInt(r.date.split("-")[2]) + i * 7) % 28 + 1;
      expandedRecords.push(Object.assign({}, r, {
        amount: Math.round(r.amount * (0.7 + Math.random() * 0.6) / 100) * 100,
        date: "2025-" + String((m + i) % 12 + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"),
        desc: r.desc + (i > 0 ? "（第" + (i + 1) + "批）" : ""),
      }));
    }
  });

  /* 映射到系统内的 deptId / catId */
  function mapRecord(r) {
    var dept = BM.DEPTS.find(function (d) { return d.name === r.deptName; });
    var cat = BM.CATEGORIES.find(function (c) { return c.name === r.catName; });
    return {
      id: "IMP" + String(Math.random()).slice(2, 8),
      date: r.date,
      type: r.type,
      catId: cat ? cat.id : "",
      catName: r.catName,
      deptId: dept ? dept.id : "",
      supplier: r.supplier,
      amount: r.amount,
      desc: r.desc,
      status: "已付款",
    };
  }

  var records = expandedRecords;

  function renderContent() {
    modal.innerHTML = "";

    /* Step 1: 文件上传 */
    if (step === 1) {
      modal.innerHTML = `<div class="login-title" style="margin-bottom:8px">📂 历史数据导入</div>
        <div class="login-sub" style="margin-bottom:24px">上传往年预算执行数据（CSV/Excel），AI 将自动分析并更新编制建议</div>
        <div style="border:2px dashed var(--c-border);border-radius:12px;padding:40px 20px;text-align:center;cursor:pointer;transition:all 0.2s;margin-bottom:16px" id="dropZone">
          <div style="font-size:42px;margin-bottom:10px">📄</div>
          <div style="font-weight:600;color:var(--c-text);font-size:15px;margin-bottom:6px">点击上传或拖拽文件到此处</div>
          <div style="font-size:12px;color:var(--c-text-3)">支持 CSV、Excel (.xlsx / .xls) 格式 · 单文件最大 10MB</div>
        </div>
        <div style="background:var(--c-bg-2);border-radius:8px;padding:12px 16px;font-size:12px;color:var(--c-text-2);margin-bottom:16px">
          <div style="font-weight:600;margin-bottom:4px;color:var(--c-text)">💡 文件格式要求：</div>
          需包含列：部门、科目、金额、日期<br>可选列：供应商、类型、说明
        </div>
        <div style="text-align:right">
          <button class="btn btn-ghost" style="margin-right:8px" id="cancelImport">取消</button>
        </div>`;

      var dropZone = modal.querySelector("#dropZone");
      dropZone.addEventListener("click", function () {
        file = { name: "2025年预算执行明细.csv", size: 245000 };
        step = 2;
        renderContent();
      });
      dropZone.addEventListener("dragover", function (e) { e.preventDefault(); dropZone.style.borderColor = "var(--c-accent)"; dropZone.style.background = "var(--c-bg-2)"; });
      dropZone.addEventListener("dragleave", function () { dropZone.style.borderColor = "var(--c-border)"; dropZone.style.background = "transparent"; });
      dropZone.addEventListener("drop", function (e) {
        e.preventDefault();
        dropZone.style.borderColor = "var(--c-border)";
        dropZone.style.background = "transparent";
        file = { name: "2025年预算执行明细.csv", size: 245000 };
        step = 2;
        renderContent();
      });
      modal.querySelector("#cancelImport").addEventListener("click", function () { overlay.remove(); });
    }

    /* Step 2: 解析预览 */
    if (step === 2) {
      var deptSet = {};
      var catSet = {};
      var totalAmount = 0;
      records.forEach(function (r) { deptSet[r.deptName] = true; catSet[r.catName] = true; totalAmount += r.amount; });

      var deptCount = Object.keys(deptSet).length;
      var catCount = Object.keys(catSet).length;

      var previewRows = records.slice(0, 6).map(function (r) {
        return `<tr>
          <td>${esc(r.deptName)}</td>
          <td>${esc(r.catName)}</td>
          <td>${esc(r.desc)}</td>
          <td class="tbl-num" style="text-align:right">${r.amount.toLocaleString()}</td>
          <td>${esc(r.date)}</td>
          <td>${esc(r.supplier)}</td>
        </tr>`;
      }).join("");

      modal.innerHTML = `<div class="login-title" style="margin-bottom:8px">📋 解析预览</div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
          <span style="font-size:13px;color:var(--c-text)">已选择：<b>${esc(file.name)}</b>（${(file.size / 1024).toFixed(0)} KB）</span>
          <span class="badge badge-ok">${records.length} 条记录</span>
          <span class="badge badge-info">${deptCount} 个部门</span>
          <span class="badge badge-accent">${catCount} 个科目</span>
        </div>
        <div style="font-size:12px;color:var(--c-text-2);margin-bottom:8px">
          AI 已自动匹配 <b>${deptCount}</b> 个部门、<b>${catCount}</b> 个科目，金额合计 <b>${BM.money(totalAmount)}</b>
        </div>
        <div class="tbl-wrap" style="max-height:260px;overflow-y:auto;margin-bottom:16px">
          <table>
            <thead><tr><th>部门</th><th>科目</th><th>说明</th><th style="text-align:right">金额</th><th>日期</th><th>供应商</th></tr></thead>
            <tbody>${previewRows}</tbody>
          </table>
          ${records.length > 6 ? `<div style="text-align:center;padding:8px 0;font-size:12px;color:var(--c-text-3)">仅展示前 6 条，共 ${records.length} 条记录</div>` : ""}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:12px;color:var(--c-text-2)">导入后将重新计算 AI 编制建议</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost" id="backStep">← 返回</button>
            <button class="btn btn-primary" id="confirmImport">确认导入 · 共 ${records.length} 条</button>
          </div>
        </div>`;

      modal.querySelector("#backStep").addEventListener("click", function () { step = 1; renderContent(); });
      modal.querySelector("#confirmImport").addEventListener("click", function () {
        /* 注入数据到 BM.DOCS */
        var newDocs = records.map(mapRecord);
        BM.DOCS = BM.DOCS.concat(newDocs);

        /* 重新计算科目月度汇总（触发 AI 建议刷新） */
        BM.CATEGORIES.forEach(function (cat) {
          var docs = BM.DOCS.filter(function (d) { return d.catId === cat.id; });
          cat.used = docs.reduce(function (a, d) { return a + d.amount; }, 0);
        });

        /* 重新计算项目已用 */
        BM.PROJECTS.forEach(function (p) {
          p.remain = p.budget - p.used - p.frozen;
          p.execRate = p.budget ? Math.round((p.used / p.budget) * 1000) / 10 : 0;
        });

        step = 3;
        renderContent();
      });
    }

    /* Step 3: 导入完成 */
    if (step === 3) {
      var deptSet3 = {};
      records.forEach(function (r) { deptSet3[r.deptName] = true; });
      var deptCount3 = Object.keys(deptSet3).length;

      /* 计算导入后的 AI 建议变化（与导入前对比） */
      var beforeSuggestions = {};
      BM.DEPTS.forEach(function (d) {
        beforeSuggestions[d.id] = BM.buildPlanSuggestion(d.id);
      });

      modal.innerHTML = `<div style="text-align:center;padding:16px 0">
        <div style="font-size:52px;margin-bottom:12px">✅</div>
        <div class="login-title" style="margin-bottom:10px">导入成功！</div>
        <div style="font-size:13px;color:var(--c-text-2);margin-bottom:20px;line-height:1.7">
          共导入 <b style="color:var(--c-primary)">${records.length} 条</b>历史执行记录<br>
          覆盖 <b style="color:var(--c-primary)">${deptCount3} 个部门</b>，AI 编制建议已基于最新数据重新计算
        </div>
        <div class="plan-statusbar" style="justify-content:center;gap:8px;margin-bottom:8px">
          <span class="badge badge-ok">${records.length} 条</span>
          <span class="badge badge-info">${deptCount3} 个部门</span>
          <span class="badge badge-accent">2025 年度</span>
        </div>
        <div style="font-size:12px;color:var(--c-text-3);margin-bottom:24px">
          数据已注入系统，编制页的 AI 建议额度将自动刷新
        </div>
        <button class="btn btn-primary" id="doneImport">完成，刷新预算编制</button>
      </div>`;

      modal.querySelector("#doneImport").addEventListener("click", function () {
        overlay.remove();
        BM.openView("plan");
        BM.toast("✅ " + records.length + " 条历史数据已导入，AI 建议已更新");
      });
    }
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  renderContent();

  /* 点击遮罩关闭 */
  overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
};

function modeCard(id, title, desc, enabled) {
  const b = el("button", "mode-btn" + (BM.state.plan.mode === id ? " active" : ""));
  const tag = id === "topdown"
    ? `<span class="badge badge-gray" style="margin-left:6px">只分解 · 不可新增</span>`
    : `<span class="badge badge-ok" style="margin-left:6px">可新增 · 可编辑</span>`;
  b.innerHTML = `<div class="mb-title">${esc(title)}${tag}</div><div class="mb-desc">${esc(desc)}</div>`;
  b.addEventListener("click", () => {
    if (!enabled) {
      BM.toast("当前角色不支持该模式");
      return;
    }
    if (BM.state.plan.mode === id) return;
    BM.planSetMode(id);
    BM.openView("plan");
  });
  return b;
}

/* ---------- 自上而下：按部门分配（v0.8：只分解不可新增） ---------- */
function renderTopdown(container) {
  const p = BM.state.plan;
  const wrap = el("div", "");
  const notice = el("div", "plan-statusbar");
  notice.innerHTML = `<span class="badge badge-gray">只分解</span>
    <span class="hint-text">自上而下模式：总经理已定总额，您只能在既有部门/项目/物料范围内调整金额，不可新增项目或物料。</span>`;
  wrap.appendChild(notice);

  const editor = el("div", "plan-editor");
  const table = el("table");
  table.innerHTML = `<thead><tr>
    <th>部门</th><th>负责人</th><th style="text-align:right">分配预算（元）</th><th style="text-align:right">占比</th><th>AI 建议</th>
  </tr></thead>`;
  const tbody = el("tbody");

  const rows = {};
  let total = 0;
  BM.DEPTS.forEach((d) => {
    rows[d.id] = p.rows[d.id] !== undefined ? p.rows[d.id] : 0;
    total += rows[d.id];
  });

  const canEdit = BM.state.role !== "expense" && (p.status === "draft" || p.status === "rejected");

  BM.DEPTS.forEach((d) => {
    const sugg = BM.buildTopDownSuggestion(p.totalBudget)[d.id];
    const tr = el("tr");
    const share = total ? ((rows[d.id] / total) * 100).toFixed(1) : "0.0";
    tr.innerHTML = `<td><b>${esc(d.name)}</b></td>
      <td>${esc(d.head)}</td>
      <td style="text-align:right">${canEdit
        ? `<input type="number" step="10000" value="${rows[d.id]}" data-dept="${d.id}">`
        : `<span class="tbl-num">${rows[d.id].toLocaleString()}</span>`}</td>
      <td class="tbl-num" style="text-align:right">${share}%</td>
      <td><span class="ai-suggest-tag">AI 建议 ${sugg.toLocaleString()}</span></td>`;
    tbody.appendChild(tr);
  });

  const sumTr = el("tr");
  sumTr.innerHTML = `<td colspan="2"><b>合计</b></td>
    <td class="tbl-num" style="text-align:right"><b>${total.toLocaleString()}</b></td>
    <td class="tbl-num" style="text-align:right">100%</td><td></td>`;
  tbody.appendChild(sumTr);
  table.appendChild(tbody);
  editor.appendChild(table);

  if (canEdit) {
    const inputs = editor.querySelectorAll("input");
    inputs.forEach((inp) => {
      inp.addEventListener("change", () => {
        p.rows[inp.dataset.dept] = parseInt(inp.value, 10) || 0;
        BM.planSaveRows(p.rows);
      });
    });
  }
  wrap.appendChild(editor);
  return wrap;
}

/* ================================================================
 * v0.10：自上而下约束分解视图（部门经理/员工）
 * 把上级给的额度分解到 项目/物料，加总须 ≤ 上级额度
 * ================================================================ */

/* 上级额度：部门经理 = 本部门分配额度；员工 = 本人负责项目额度 */
function getDecomposeScope() {
  const role = BM.state.role;
  if (role === "adminHead") {
    const myDeptId = BM.state.deptId;
    const dept = BM.DEPTS.find((d) => d.id === myDeptId) || {};
    /* 上级给本部门的额度：优先 plan.rows[deptId]，否则用 AI 建议 */
    const quota = BM.state.plan.rows[myDeptId] || BM.buildTopDownSuggestion(BM.state.plan.totalBudget)[myDeptId] || 0;
    const projects = BM.PROJECTS.filter((p) => p.deptId === myDeptId);
    return { label: `本部门（${dept.name}）额度`, quota, projects, ownerType: "部门" };
  }
  /* expense */
  const projects = BM.PROJECTS.filter((p) => p.owner === "张伟" && p.ownerRole === "expense");
  const quota = projects.reduce((a, p) => a + p.budget, 0);
  return { label: "本人（张伟）负责项目额度", quota, projects, ownerType: "个人" };
}

/* 当前分解明细（实时从输入读取） */
let decomposeInputs = {};
function readDecomposeInputs() {
  const scope = getDecomposeScope();
  const detail = {};
  scope.projects.forEach((p) => {
    const mats = BM.MATERIALS.filter((m) => m.projectId === p.id);
    mats.forEach((m) => {
      const key = p.id + ":" + m.id;
      const v = decomposeInputs[key];
      detail[key] = (v !== undefined && v !== null) ? v : (m.budget || 0);
    });
  });
  return detail;
}

function calcDecomposeTotal() {
  const detail = readDecomposeInputs();
  return Object.values(detail).reduce((a, b) => a + (parseFloat(b) || 0), 0);
}

function checkDecomposeTotal() {
  const scope = getDecomposeScope();
  const total = calcDecomposeTotal();
  if (total > scope.quota) {
    return { ok: false, msg: `⛔ 审查不通过：分解加总 ${BM.money(total)} 超过${scope.ownerType}额度 ${BM.money(scope.quota)}，请调整` };
  }
  return { ok: true, msg: `✅ 审查通过：分解加总 ${BM.money(total)} ≤ ${scope.ownerType}额度 ${BM.money(scope.quota)}` };
}

function renderDecomposeView(container) {
  const scope = getDecomposeScope();
  const wrap = el("div", "");

  /* 额度约束条 */
  const quotaBar = el("div", "plan-statusbar");
  quotaBar.innerHTML = `<span class="badge badge-gray">约束分解</span>
    <span class="hint-text">${esc(scope.label)}：</span>
    <b style="color:var(--c-primary)">${BM.money(scope.quota)}</b>
    <span class="hint-text">· 分解到 ${scope.projects.length} 个项目 · 加总须 ≤ 额度</span>`;
  wrap.appendChild(quotaBar);

  if (!scope.projects.length) {
    wrap.appendChild(el("div", "empty", `<div class="empty-ico">🗂</div>当前范围暂无项目`));
    return wrap;
  }

  scope.projects.forEach((p) => {
    const info2 = BM.projectInfo(p);
    const block = el("div", "plan-editor");
    block.style.marginBottom = "14px";
    const head = el("div", "card-head");
    head.innerHTML = `<div class="card-icon" style="background:var(--c-info-bg);color:var(--c-info)">项</div>
      <div class="card-title">${esc(p.name)}</div>
      <span class="card-tag badge badge-info">${esc(info2.catName)}</span>`;
    block.appendChild(head);

    const mats = BM.MATERIALS.filter((m) => m.projectId === p.id);
    const table = el("table");
    table.innerHTML = `<thead><tr>
      <th>物料</th><th>规格</th><th>单位</th><th style="text-align:right">分解金额（元）</th><th>原额度</th>
    </tr></thead>`;
    const tbody = el("tbody");

    if (!mats.length) {
      tbody.appendChild(el("tr", "", `<td colspan="5"><div class="empty">该项目暂无物料配置</div></td>`));
    }
    mats.forEach((m) => {
      const tr = el("tr");
      const key = p.id + ":" + m.id;
      const cur = decomposeInputs[key] !== undefined ? decomposeInputs[key] : (m.budget || 0);
      tr.innerHTML = `<td><b>${esc(m.name)}</b></td>
        <td class="hint-text">${esc(m.spec)}</td>
        <td>${esc(m.unit)}</td>
        <td style="text-align:right"><input type="number" step="1000" value="${cur}" data-key="${key}"></td>
        <td class="hint-text">${BM.money(m.budget || 0)}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    block.appendChild(table);
    wrap.appendChild(block);

    block.querySelectorAll("input[data-key]").forEach((inp) => {
      inp.addEventListener("change", () => {
        decomposeInputs[inp.dataset.key] = parseInt(inp.value, 10) || 0;
        refreshTotal();
      });
    });
  });

  /* 实时合计 + 审查条 */
  const totalBar = el("div", "plan-statusbar");
  totalBar.id = "decomposeTotalBar";
  totalBar.style.marginTop = "6px";
  wrap.appendChild(totalBar);

  function refreshTotal() {
    const scope2 = getDecomposeScope();
    const total = calcDecomposeTotal();
    const remain = scope2.quota - total;
    const over = remain < 0;
    totalBar.innerHTML = `<span class="hint-text">分解合计：</span>
      <b style="color:${over ? "var(--c-danger)" : "var(--c-ok)"}">${BM.money(total)}</b>
      <span class="hint-text">/ ${BM.money(scope2.quota)}</span>
      <span class="badge ${over ? "badge-danger" : "badge-ok"}">${over ? `超额度 ${BM.money(Math.abs(remain))}` : `剩余额度 ${BM.money(remain)}`}</span>
      ${over ? `<span class="badge badge-danger">审查不通过</span>` : `<span class="badge badge-ok">审查通过 ✓</span>`}`;
  }
  refreshTotal();

  return wrap;
}

/* ---------- 自下而上填报（v0.9：经理按本部门、员工按本人负责项目） ---------- */
function renderBottomup(container) {
  const role = BM.state.role;
  const wrap = el("div", "");
  const canEdit = role === "adminHead" || role === "expense" || role === "ceo" || role === "cooAnalyst";

  /* 公司行政负责人：按本部门项目 → 物料填报（看不到其他部门） */
  if (role === "adminHead") {
    return renderManagerBottomup(wrap);
  }

  /* 基层费用责任岗：按本人负责的项目 → 物料填报（v0.9） */
  if (role === "expense") {
    return renderStaffBottomup(wrap);
  }

  /* 集团 CEO/总经办预算管理员：保留部门下拉 + 按部门科目填报 */
  let depts = BM.DEPTS;

  const selRow = el("div", "filter-bar");
  selRow.style.marginBottom = "12px";
  const sel = el("select");
  sel.innerHTML = `<option value="all">全部部门（汇总视图）</option>` + BM.DEPTS.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("");
  sel.addEventListener("change", () => {
    depts = sel.value === "all" ? BM.DEPTS : BM.DEPTS.filter((d) => d.id === sel.value);
    const re = renderBottomup(container);
    container.innerHTML = "";
    container.appendChild(re);
  });
  selRow.appendChild(el("span", "hint-text", "按部门查看填报："));
  selRow.appendChild(sel);
  wrap.appendChild(selRow);

  depts.forEach((d) => {
    const block = el("div", "plan-editor");
    block.style.marginBottom = "14px";
    const head = el("div", "card-head");
    head.innerHTML = `<div class="card-title">${esc(d.name)}</div>
      <span class="card-tag badge badge-info">填报人：${esc(d.head)}</span>`;
    block.appendChild(head);

    const table = el("table");
    table.innerHTML = `<thead><tr>
      <th>科目</th><th style="text-align:right">填报预算（元）</th><th>AI 建议（年化）</th><th>历史已用</th>
    </tr></thead>`;
    const tbody = el("tbody");
    const suggs = BM.buildPlanSuggestion(d.id);
    const allCats = BM.CATEGORIES.filter((c) => suggs[c.id] !== undefined);

    if (!allCats.length) {
      tbody.appendChild(el("tr", "", `<td colspan="4"><div class="empty">该部门暂无历史费用数据，AI 无法预填建议</div></td>`));
    }

    allCats.forEach((c) => {
      const docs = BM.DOCS.filter((x) => x.catId === c.id && x.deptId === d.id);
      const used = docs.reduce((a, x) => a + x.amount, 0);
      const tr = el("tr");
      tr.innerHTML = `<td>${esc(c.name)}</td>
        <td style="text-align:right">${canEdit
          ? `<input type="number" step="10000" value="${suggs[c.id]}" data-dept="${d.id}" data-cat="${c.id}">`
          : `<span class="tbl-num">${suggs[c.id].toLocaleString()}</span>`}</td>
        <td><span class="ai-suggest-tag">AI 年化建议 ${suggs[c.id].toLocaleString()}</span></td>
        <td class="tbl-num">${used.toLocaleString()}</td>`;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    block.appendChild(table);
    wrap.appendChild(block);

    if (canEdit) {
      block.querySelectorAll("input").forEach((inp) => {
        inp.addEventListener("change", () => {
          const key = inp.dataset.dept + ":" + inp.dataset.cat;
          /* 记录到 plan.rows（reuse） */
          pRows[key] = parseInt(inp.value, 10) || 0;
        });
      });
    }
  });

  return wrap;
}

/* ================================================================
 * v0.11：可加预算项卡片（项目头部 ＋ 按钮）
 * 点击 ＋ → 菜单：[＋ 项目预算项] [＋ 物料预算项]
 * 项目预算项：新增一个项目（部门/员工层）
 * 物料预算项：在当前项目下新增一个单纯物料
 * ================================================================ */
function buildAddablePlanCard(container, p, ctx) {
  const info2 = BM.projectInfo(p);
  const block = el("div", "plan-editor");
  block.style.marginBottom = "14px";
  const head = el("div", "card-head");
  head.innerHTML = `<div class="card-icon" style="background:var(--c-info-bg);color:var(--c-info)">项</div>
    <div class="card-title">${esc(p.name)}</div>
    <span class="card-tag badge badge-info">${esc(info2.catName)}</span>
    <span class="card-tag badge badge-accent">当前额度 ${BM.money(p.budget)}</span>`;

  /* ＋ 新增菜单（头部右侧） */
  const plus = el("button", "btn btn-accent btn-sm plan-plus", "＋");
  plus.title = "新增预算项";
  const menu = el("div", "plan-add-menu");
  menu.style.display = "none";
  const mi1 = el("button", "add-menu-item", "＋ 项目预算项");
  mi1.addEventListener("click", () => { menu.style.display = "none"; openAddForm(true); });
  const mi2 = el("button", "add-menu-item", "＋ 物料预算项");
  mi2.addEventListener("click", () => { menu.style.display = "none"; openAddForm(false); });
  menu.appendChild(mi1);
  menu.appendChild(mi2);
  plus.addEventListener("click", () => { menu.style.display = menu.style.display === "none" ? "block" : "none"; });
  head.appendChild(plus);
  head.appendChild(menu);
  block.appendChild(head);

  /* 项目下的物料 */
  const mats = BM.MATERIALS.filter((m) => m.projectId === p.id);
  const table = el("table");
  table.innerHTML = `<thead><tr>
    <th>物料</th><th>规格</th><th>单位</th><th style="text-align:right">填报预算（元）</th><th>AI 建议</th><th>历史已用</th>
  </tr></thead>`;
  const tbody = el("tbody");

  if (!mats.length) {
    tbody.appendChild(el("tr", "", `<td colspan="6"><div class="empty">该项目暂无物料配置，点项目头部 ＋ 添加</div></td>`));
  }
  mats.forEach((m) => {
    const tr = el("tr");
    tr.innerHTML = `<td><b>${esc(m.name)}</b></td>
      <td class="hint-text">${esc(m.spec)}</td>
      <td>${esc(m.unit)}</td>
      <td style="text-align:right"><input type="number" step="1000" value="${m.budget || 0}" data-proj="${p.id}" data-mat="${m.id}"></td>
      <td><span class="ai-suggest-tag">AI 建议 ${(m.budget || 0).toLocaleString()}</span></td>
      <td class="tbl-num">${m.used.toLocaleString()}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  block.appendChild(table);

  /* 新增表单容器（＋ 菜单触发） */
  const formBox = el("div", "plan-actions");
  formBox.style.display = "none";
  block.appendChild(formBox);

  function openAddForm(isProject) {
    formBox.innerHTML = "";
    formBox.style.display = "flex";
    if (isProject) {
      const inp = el("input");
      inp.placeholder = "新项目名称（如：办公家具采购）";
      inp.style.width = "180px";
      const sel = el("select");
      sel.innerHTML = BM.CATEGORIES.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
      const amt = el("input");
      amt.type = "number";
      amt.placeholder = "预算金额";
      amt.style.width = "110px";
      const ok = el("button", "btn btn-primary btn-sm", "确认新增项目");
      ok.addEventListener("click", () => {
        const name = inp.value.trim();
        const a = parseInt(amt.value, 10) || 50000;
        if (!name) { BM.toast("请输入项目名称"); return; }
        BM.PROJECTS.push({ id: "P" + Date.now(), name, deptId: ctx.deptId, catId: sel.value, budget: a, used: 0, frozen: 0, owner: ctx.owner, ownerRole: ctx.ownerRole, status: "编制中", desc: "编制中新增" });
        BM.toast("✅ 已新增项目：" + name);
        BM.openView("plan");
      });
      formBox.appendChild(el("span", "hint-text", "新增项目："));
      formBox.appendChild(inp);
      formBox.appendChild(sel);
      formBox.appendChild(amt);
      formBox.appendChild(ok);
    } else {
      const inp = el("input");
      inp.placeholder = "新物料名称（如：办公桌）";
      inp.style.width = "150px";
      const amt = el("input");
      amt.type = "number";
      amt.placeholder = "预算金额";
      amt.style.width = "100px";
      const ok = el("button", "btn btn-primary btn-sm", "确认新增物料");
      ok.addEventListener("click", () => {
        const name = inp.value.trim();
        const a = parseInt(amt.value, 10) || 10000;
        if (!name) { BM.toast("请输入物料名称"); return; }
        BM.MATERIALS.push({ id: "M" + Date.now(), name, catId: p.catId, projectId: p.id, budget: a, used: 0, unit: "批", spec: "新增" });
        BM.toast("✅ 已新增物料：" + name);
        BM.openView("plan");
      });
      formBox.appendChild(el("span", "hint-text", `新增物料（${esc(p.name)}）：`));
      formBox.appendChild(inp);
      formBox.appendChild(amt);
      formBox.appendChild(ok);
    }
  }

  container.appendChild(block);

  block.querySelectorAll("input[data-mat]").forEach((inp) => {
    inp.addEventListener("change", () => {
      pRows[inp.dataset.proj + ":" + inp.dataset.mat] = parseInt(inp.value, 10) || 0;
      BM.toast("已保存填报：" + p.name);
    });
  });
}

/* ---------- 部门经理填报：本部门项目 → 物料（v0.11：头部 ＋ 可新增） ---------- */
function renderManagerBottomup(wrap) {
  const myDeptId = BM.state.deptId;
  const dept = BM.DEPTS.find((d) => d.id === myDeptId) || {};
  const projects = BM.PROJECTS.filter((p) => p.deptId === myDeptId);

  /* 部门信息卡（差异化表达：自下而上可新增） */
  const info = el("div", "plan-statusbar");
  info.innerHTML = `<span class="badge badge-info">本部门：${esc(dept.name)}</span>
    <span class="badge badge-ok">可新增 · 可编辑</span>
    <span class="hint-text">自下而上：您是预算上报方，每个项目头部 ＋ 可新增项目/物料 · 其他部门数据不可见</span>`;
  wrap.appendChild(info);

  if (!projects.length) {
    wrap.appendChild(el("div", "empty", `<div class="empty-ico">🗂</div>本部门暂无项目，点击下方按钮新增`));
  }

  const ctx = { deptId: myDeptId, owner: dept.head, ownerRole: "adminHead" };
  projects.forEach((p) => {
    buildAddablePlanCard(wrap, p, ctx);
  });

  return wrap;
}

/* ---------- 员工填报：本人负责项目 → 物料（v0.11：头部 ＋ 可新增） ---------- */
function renderStaffBottomup(wrap) {
  const myProjects = BM.PROJECTS.filter((p) => p.owner === "张伟" && p.ownerRole === "expense");

  const info = el("div", "plan-statusbar");
  info.innerHTML = `<span class="badge badge-info">员工：张伟（IT 部）</span>
    <span class="badge badge-ok">可新增 · 可编辑</span>
    <span class="hint-text">自下而上：您按自己负责的项目上报预算 · 每个项目头部 ＋ 可新增项目/物料 · 共 ${myProjects.length} 个项目</span>`;
  wrap.appendChild(info);

  if (!myProjects.length) {
    wrap.appendChild(el("div", "empty", `<div class="empty-ico">🗂</div>您暂未负责项目`));
  }

  const ctx = { deptId: "it", owner: "张伟", ownerRole: "expense" };
  myProjects.forEach((p) => {
    buildAddablePlanCard(wrap, p, ctx);
  });

  return wrap;
}

/* 自下而上填报的临时存储（页面级） */
const pRows = {};

/* ================================================================
 * v0.6：客户规则引擎（预算逻辑 · 编制预填 + 偏离治理）
 * 选科目 → 按 BM.RULES 自动预填基线（applyRule）；
 * 人工改 → 偏离标红 + 偏离原因必填（规则治理，V2 §5.10）
 * ================================================================ */
function renderClientRuleEngine(container) {
  const wrap = el("div", "");

  wrap.appendChild(el("div", "section-title", "客户规则引擎（预算逻辑 · 编制预填与偏离治理）"));
  const note = el("div", "plan-statusbar");
  note.innerHTML = `<span class="badge badge-info">来源：客户预算逻辑指导意见</span>
    <span class="hint-text">选科目 → 系统按规则自动预填基线金额；人工改 → 偏离标红 + 偏离原因必填（规则治理，V2 §5.10）</span>`;
  wrap.appendChild(note);

  /* 规则卡（侧边常驻） */
  const cardGrid = el("div", "rules-grid");
  BM.RULES.forEach((r) => {
    const c = el("div", "rule-card");
    c.innerHTML = `<div class="rule-title">${esc(r.id)} · ${esc(r.cat)}</div>
      <div class="rule-desc">${esc(r.expr)}</div>
      <div class="hint-text" style="margin-top:6px">归口：${esc(r.desc)}</div>`;
    cardGrid.appendChild(c);
  });
  wrap.appendChild(cardGrid);

  /* 编制预填 + 偏离治理表 */
  const tbl = el("div", "tbl-wrap");
  const table = el("table");
  table.innerHTML = `<thead><tr>
    <th>科目</th><th style="text-align:right">2025 实际</th><th>规则</th><th style="text-align:right">AI 建议基线</th><th style="text-align:right">申报值</th><th>状态</th><th>偏离原因（必填）</th>
  </tr></thead>`;
  const tbody = el("tbody");

  BM.RULES.forEach((r) => {
    const baseline = BM.applyRule(r.cat, r.lastYear);
    const saved = BM.state.ruleEngine[r.cat] || {};
    const apply = saved.apply !== undefined ? saved.apply : (baseline.ok ? baseline.baseline : 0);
    const deviated = BM.isDeviated(apply, baseline.baseline);
    const tr = el("tr");
    tr.innerHTML = `<td><b>${esc(r.cat)}</b></td>
      <td class="tbl-num" style="text-align:right">${r.lastYear ? BM.money(r.lastYear) : "—"}</td>
      <td class="hint-text">${esc(r.expr)}</td>
      <td class="tbl-num" style="text-align:right">${baseline.ok ? BM.money(baseline.baseline) : "—"}</td>
      <td style="text-align:right"><input type="number" step="10000" value="${apply}" data-cat="${esc(r.cat)}" class="re-apply ${deviated ? "re-deviated" : ""}"></td>
      <td><span class="badge ${deviated ? "badge-danger" : "badge-ok"}">${deviated ? "偏离" : "基线"}</span></td>
      <td><input type="text" placeholder="${deviated ? "必填：说明偏离理由" : "（基线内可不填）"}" value="${esc(saved.reason || "")}" data-cat="${esc(r.cat)}" class="re-reason"></td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tbl.appendChild(table);
  wrap.appendChild(tbl);

  /* 实时联动：申报值变化 → 重算偏离，动态切换状态/原因必填 */
  wrap.querySelectorAll(".re-apply").forEach((inp) => {
    inp.addEventListener("input", () => {
      const cat = inp.dataset.cat;
      const r = BM.RULES.find((x) => x.cat === cat);
      const base = BM.applyRule(cat, r.lastYear);
      const dev = BM.isDeviated(parseInt(inp.value, 10) || 0, base.baseline);
      const tr = inp.closest("tr");
      const badge = tr.querySelector(".badge");
      const reason = tr.querySelector(".re-reason");
      inp.classList.toggle("re-deviated", dev);
      badge.className = "badge " + (dev ? "badge-danger" : "badge-ok");
      badge.textContent = dev ? "偏离" : "基线";
      reason.placeholder = dev ? "必填：说明偏离理由" : "（基线内可不填）";
    });
  });

  /* 保存：偏离基线必须填原因 */
  const saveBtn = el("button", "btn btn-primary btn-sm", "保存编制申报值");
  saveBtn.style.marginTop = "10px";
  saveBtn.addEventListener("click", () => {
    let firstMissing = null;
    BM.RULES.forEach((r) => {
      const applyInp = wrap.querySelector('.re-apply[data-cat="' + r.cat + '"]');
      const reasonInp = wrap.querySelector('.re-reason[data-cat="' + r.cat + '"]');
      if (!applyInp || !reasonInp) return;
      const apply = parseInt(applyInp.value, 10) || 0;
      const base = BM.applyRule(r.cat, r.lastYear);
      const dev = BM.isDeviated(apply, base.baseline);
      if (dev && !reasonInp.value.trim()) {
        reasonInp.classList.add("re-reason-required");
        reasonInp.classList.remove("re-reason");
        if (!firstMissing) firstMissing = reasonInp;
      } else {
        reasonInp.classList.add("re-reason");
        reasonInp.classList.remove("re-reason-required");
        BM.saveRuleEngine(r.cat, apply, reasonInp.value.trim());
      }
    });
    if (firstMissing) {
      BM.toast("⛔ 偏离基线的科目必须填写偏离原因");
      firstMissing.focus();
      return;
    }
    BM.toast("✅ 编制申报值已保存（含偏离原因留痕）");
    BM.openView("plan");
  });
  wrap.appendChild(saveBtn);

  return wrap;
}

window.BM.renderPlan = renderPlan;
window.BM = BM;
