/* ================================================================
 * views/plan.js — 预算编制页（主入口 + 意图解析）
 * 迁移自 views/plan.js（原 1120 行上帝文件，2026-09-04 拆分）
 * 依赖：data/*、core/*；plan 系列最后一个加载（topdown→bottomup→client→plan）
 * 挂载 BM.renderPlan、BM.showImportModal；flowNodes/renderIntentParser/modeCard 为 IIFE 私有
 * 说明：renderPlan 经 BM.plan.renderTopdown / renderBottomup / renderClientRuleEngine /
 *   renderDecomposeView / checkDecomposeTotal 引用子文件渲染（替代原同文件闭包引用）。
 * ================================================================ */

(function () {
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
      editor.appendChild(BM.plan.renderDecomposeView(container));
    } else {
      editor.appendChild(BM.plan.renderTopdown(container));
    }
  } else {
    editor.appendChild(BM.plan.renderBottomup(container));
  }
  page.appendChild(editor);

  /* v0.6：客户规则引擎（仅集团编制角色 ceo / cooAnalyst） */
  if (role === "ceo" || role === "cooAnalyst") {
    page.appendChild(BM.plan.renderClientRuleEngine(container));
  }

  /* 操作按钮（v0.10：提交前审查 —— 分解加总 ≤ 上级额度） */
  const canEdit = BM.state.plan.status === "draft" || BM.state.plan.status === "rejected";
  const actions = el("div", "plan-actions");
  if (isSubmitter && canEdit) {
    const submit = el("button", "btn btn-primary", "提交预算 → 预算管理员汇总");
    submit.addEventListener("click", () => {
      const check = BM.plan.checkDecomposeTotal();
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

window.BM.renderPlan = renderPlan;
window.BM = BM;
})();
