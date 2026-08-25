/* ================================================================
 * budget.js — 手机版「预算」Tab
 * 总览（多视角）· 编制（按规则）· 追踪（三态筛选）· 决算 · 财务规则 · 调整
 * ================================================================ */

var BM = window.BM || {};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BUDGET_SUB_VIEWS = ["overview", "plan", "track", "final", "rules", "adjust"];

/* ---------- 主入口：预算 Tab ---------- */
BM.renderBudget = function (container, sub) {
  container.innerHTML = "";
  const r = BM.state.role;

  /* 子视图入口列表（按角色） */
  const entries = [
    { key: "overview", label: "预算总览", desc: "科目 / 项目 / 物料 / 部门 / 人员" },
    { key: "plan", label: "预算编制", desc: "按财务规则 · 填报或分解" },
    { key: "track", label: "预算追踪", desc: "月度执行 · 偏差归因" },
    { key: "final", label: "决算", desc: "全年实际 vs 预算", roles: ["boss", "finance"] },
    { key: "adjust", label: "预算调整", desc: "调剂 / 追加 / 调减", roles: ["boss", "finance"] },
    { key: "rules", label: "财务规则", desc: "编制 / 追踪 / 余量 / 超预算", roles: ["finance"] },
  ];
  const visible = entries.filter((e) => !e.roles || e.roles.indexOf(r) >= 0);

  /* 一级菜单（页面导航 · 下划线式） */
  const tabs = el("div", "nav-tabs");
  const current = sub || "overview";
  visible.forEach((e) => {
    const b = el("button", "nav-tab" + (e.key === current ? " active" : ""), esc(e.label));
    b.addEventListener("click", () => BM.switchTab("budget", e.key));
    tabs.appendChild(b);
  });
  container.appendChild(tabs);

  /* 内容 */
  const body = el("div", "");
  container.appendChild(body);
  if (current === "overview") renderOverview(body, r);
  else if (current === "plan") renderPlan(body, r);
  else if (current === "track") renderTrack(body, r);
  else if (current === "final") renderFinal(body, r);
  else if (current === "rules") renderRules(body, r);
  else if (current === "adjust") renderAdjust(body, r);
};

/* ---------- 预算总览（多视角） ---------- */
function renderOverview(container, r) {
  /* 视角 Tab：按角色（带「视角」后缀） */
  const views = [];
  if (r !== "staff") views.push({ key: "cat", label: "科目视角" });
  views.push({ key: "proj", label: "项目视角" });
  views.push({ key: "mat", label: "物料视角" });
  if (r === "boss") views.push({ key: "dept", label: "部门视角" });
  if (r === "finance" || r === "manager") views.push({ key: "people", label: "人员视角" });

  const tabs = el("div", "view-tabs");
  const state = { cur: views[0].key };
  const body = el("div", "");
  views.forEach((v) => {
    const b = el("button", "view-tab" + (v.key === state.cur ? " active" : ""), v.label);
    b.addEventListener("click", () => {
      state.cur = v.key;
      tabs.querySelectorAll(".view-tab").forEach((x, i) => x.classList.toggle("active", views[i].key === v.key));
      body.innerHTML = "";
      renderOverviewBody(body, v.key, r);
    });
    tabs.appendChild(b);
  });
  container.appendChild(tabs);
  container.appendChild(body);
  renderOverviewBody(body, state.cur, r);
}

function renderOverviewBody(container, mode, r) {
  if (mode === "cat") renderCat(container, r);
  else if (mode === "proj") renderProj(container, r);
  else if (mode === "mat") renderMat(container, r);
  else if (mode === "dept") renderDept(container);
  else if (mode === "people") renderPeople(container, r);
}

function renderCat(container, r) {
  const docs = BM.scopedDocs();
  const scopeGlobal = r !== "manager" && r !== "staff";
  const scopeCatIds = new Set(docs.map((d) => d.catId));

  const kpi = el("div", "kpi-grid");
  if (scopeGlobal) {
    const S = BM.SUMMARY;
    kpi.appendChild(el("div", "kpi accent", `<div class="kpi-label">年度预算</div><div class="kpi-value">${BM.money(S.totalBudget)}</div><div class="kpi-sub">8 科目</div>`));
    kpi.appendChild(el("div", "kpi", `<div class="kpi-label">已用</div><div class="kpi-value">${BM.money(S.totalUsed)}</div><div class="kpi-sub">执行率 ${S.execRate}%</div>`));
    kpi.appendChild(el("div", "kpi", `<div class="kpi-label">冻结</div><div class="kpi-value">${BM.money(S.totalFrozen)}</div><div class="kpi-sub">在途</div>`));
    kpi.appendChild(el("div", "kpi", `<div class="kpi-label">可用</div><div class="kpi-value">${BM.money(S.totalRemain)}</div><div class="kpi-sub">预算−已用−冻结</div>`));
  } else {
    const total = docs.reduce((a, d) => a + d.amount, 0);
    kpi.appendChild(el("div", "kpi accent", `<div class="kpi-label">本范围费用</div><div class="kpi-value">${BM.money(total)}</div><div class="kpi-sub">${docs.length} 笔单据</div>`));
    kpi.appendChild(el("div", "kpi", `<div class="kpi-label">涉及科目</div><div class="kpi-value">${scopeCatIds.size}</div><div class="kpi-sub">本范围</div>`));
  }
  container.appendChild(kpi);

  const tbl = el("div", "tbl-wrap");
  const table = el("table");
  table.innerHTML = `<thead><tr><th>科目</th><th>预算</th><th>已用</th><th>可用</th><th>执行率</th><th>AI 预测</th></tr></thead>`;
  const tbody = el("tbody");
  BM.CATEGORIES.forEach((c) => {
    if (!scopeGlobal && !scopeCatIds.has(c.id)) return;
    const budget = BM.getCatBudget(c.id);
    const used = scopeGlobal ? c.used : docs.filter((d) => d.catId === c.id).reduce((a, d) => a + d.amount, 0);
    const frozen = scopeGlobal ? c.frozen : 0;
    const remain = budget - used - frozen;
    const rate = budget ? Math.round((used / budget) * 1000) / 10 : 0;
    const rateCls = rate >= 100 ? "danger" : rate >= 80 ? "warn" : "ok";
    const f = c.forecast;
    const fCls = f.status === "danger" ? "badge-danger" : f.status === "warn" ? "badge-warn" : "badge-ok";
    const tr = el("tr");
    tr.innerHTML = `<td><b>${esc(c.name)}</b></td>
      <td class="tbl-num">${BM.money(budget)}</td>
      <td class="tbl-num">${BM.money(used)}</td>
      <td class="tbl-num" style="color:${remain < 0 ? "var(--c-danger)" : ""}">${BM.money(remain)}</td>
      <td class="tbl-num">${rate}%</td>
      <td><span class="badge ${fCls}">${esc(f.label)}</span></td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tbl.appendChild(table);
  container.appendChild(tbl);

  /* AI 预警条 */
  const dangers = BM.CATEGORIES.filter((c) => c.forecast.status === "danger");
  if (dangers.length) {
    const bar = el("div", "ai-warn-bar danger");
    bar.innerHTML = `<span>⚠️</span><span>AI 预警：${dangers.map((c) => `${esc(c.name)} ${c.forecast.label}`).join(" · ")}，点击查看方案</span>`;
    bar.addEventListener("click", () => BM.sendChat("哪个部门今年最容易超预算？"));
    container.appendChild(bar);
  }
}

function renderProj(container, r) {
  const projects = BM.scopedProjects();
  const totalBudget = projects.reduce((a, p) => a + p.budget, 0);
  const totalUsed = projects.reduce((a, p) => a + p.used, 0);
  const totalRemain = projects.reduce((a, p) => a + p.remain, 0);

  const kpi = el("div", "kpi-grid");
  kpi.appendChild(el("div", "kpi accent", `<div class="kpi-label">项目预算</div><div class="kpi-value">${BM.money(totalBudget)}</div><div class="kpi-sub">${projects.length} 个项目</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">剩余可支配</div><div class="kpi-value">${BM.money(totalRemain)}</div><div class="kpi-sub">已用 ${BM.money(totalUsed)}</div>`));
  container.appendChild(kpi);

  if (!projects.length) {
    container.appendChild(el("div", "empty", `<div class="empty-ico">🗂</div>当前范围暂无项目`));
    return;
  }
  const showAction = r === "staff";
  projects.forEach((p) => {
    const info = BM.projectInfo(p);
    const rateCls = p.execRate >= 100 ? "danger" : p.execRate >= 80 ? "warn" : "ok";
    const card = el("div", "proj-card" + (p.remain < 0 ? " over" : ""));
    card.innerHTML = `<div class="pc-head"><div class="pc-title">${esc(p.name)}</div>
        <span class="badge ${p.status === "审批中" ? "badge-warn" : "badge-info"}">${esc(p.status)}</span></div>
      <div class="pc-meta">${esc(info.deptName)} · ${esc(info.catName)} · ${esc(p.owner)}</div>
      <div class="pc-nums">
        <span>额度 <b>${BM.money(p.budget)}</b></span>
        <span>已用 <b style="color:var(--c-info)">${BM.money(p.used)}</b></span>
        <span style="color:${p.remain < 0 ? "var(--c-danger)" : "var(--c-ok)"}">剩余 <b>${BM.money(p.remain)}</b></span>
      </div>
      <div class="pc-bar-row">
        <div class="progress" style="flex:1"><div class="progress-fill ${rateCls}" style="width:${Math.min(p.execRate, 100)}%"></div></div>
        <span class="pct">${p.execRate}%</span>
      </div>`;
    if (showAction && p.owner === "张伟") {
      const actions = el("div", "pc-actions");
      const b = el("button", "btn btn-primary btn-sm", "发起报销 / 采购");
      b.addEventListener("click", () => BM.openProjectSheet(p));
      actions.appendChild(b);
      card.appendChild(actions);
    }
    container.appendChild(card);
  });
}

function renderMat(container, r) {
  const mats = BM.scopedMaterials ? BM.scopedMaterials() : BM.MATERIALS;
  const list = mats.filter((m) => (m.budget || 0) > 0);
  const total = list.reduce((a, m) => a + (m.budget || 0), 0);
  const used = list.reduce((a, m) => a + (m.used || 0), 0);

  const kpi = el("div", "kpi-grid");
  kpi.appendChild(el("div", "kpi accent", `<div class="kpi-label">物料预算</div><div class="kpi-value">${BM.money(total)}</div><div class="kpi-sub">${list.length} 种物料</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">已用</div><div class="kpi-value">${BM.money(used)}</div><div class="kpi-sub">占比 ${total ? Math.round((used / total) * 100) : 0}%</div>`));
  container.appendChild(kpi);

  if (!list.length) {
    container.appendChild(el("div", "empty", `<div class="empty-ico">📦</div>当前范围暂无物料`));
    return;
  }
  list.forEach((m) => {
    const p = BM.PROJECTS.find((x) => x.id === m.projectId);
    const cat = BM.CATEGORIES.find((c) => c.id === m.catId);
    const rate = m.budget ? Math.round((m.used / m.budget) * 100) : 0;
    const rateCls = rate >= 100 ? "danger" : rate >= 80 ? "warn" : "ok";
    const card = el("div", "card");
    card.innerHTML = `<div class="card-title">${esc(m.name)}<span class="badge badge-info" style="margin-left:auto">${esc(m.spec || "")}</span></div>
      <div class="card-desc">${p ? esc(p.name) : ""}${cat ? " · " + esc(cat.name) : ""}</div>
      <div class="pc-nums">
        <span>预算 <b>${BM.money(m.budget)}</b></span>
        <span>已用 <b style="color:var(--c-info)">${BM.money(m.used)}</b></span>
        <span>剩余 <b style="color:${(m.budget - m.used) < 0 ? "var(--c-danger)" : "var(--c-ok)"}">${BM.money((m.budget || 0) - (m.used || 0))}</b></span>
      </div>
      <div class="pc-bar-row">
        <div class="progress" style="flex:1"><div class="progress-fill ${rateCls}" style="width:${Math.min(rate, 100)}%"></div></div>
        <span class="pct">${rate}%</span>
      </div>`;
    container.appendChild(card);
  });
}

function renderDept(container) {
  container.appendChild(el("div", "section-title", "按一级中心 · 部门执行"));
  const tbl = el("div", "tbl-wrap");
  const table = el("table");
  table.innerHTML = `<thead><tr><th>部门</th><th>项目</th><th>费用</th><th>占比</th></tr></thead>`;
  const tbody = el("tbody");
  BM.DEPTS.forEach((d) => {
    const docs = BM.DOCS.filter((x) => x.deptId === d.id);
    const total = docs.reduce((a, x) => a + x.amount, 0);
    const projs = BM.PROJECTS.filter((p) => p.deptId === d.id).length;
    const tr = el("tr");
    tr.innerHTML = `<td><b>${esc(d.name)}</b></td><td class="tbl-num">${projs}</td><td class="tbl-num">${BM.money(total)}</td><td class="tbl-num">${BM.DOCS.length ? Math.round((total / BM.DOCS.reduce((a, x) => a + x.amount, 0)) * 100) : 0}%</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tbl.appendChild(table);
  container.appendChild(tbl);
}

function renderPeople(container, r) {
  container.appendChild(el("div", "section-title", r === "manager" ? "本部门负责人 · 项目预算" : "项目负责人 · 预算到人"));
  const rows = {};
  BM.PROJECTS.forEach((p) => {
    if (!rows[p.owner]) rows[p.owner] = { budget: 0, used: 0, n: 0 };
    rows[p.owner].budget += p.budget;
    rows[p.owner].used += p.used;
    rows[p.owner].n += 1;
  });
  Object.keys(rows).forEach((name) => {
    const row = rows[name];
    const remain = row.budget - row.used;
    const rate = row.budget ? Math.round((row.used / row.budget) * 100) : 0;
    const card = el("div", "card");
    card.innerHTML = `<div class="card-title">👤 ${esc(name)}<span class="badge badge-info" style="margin-left:auto">${row.n} 个项目</span></div>
      <div class="pc-nums">
        <span>预算 <b>${BM.money(row.budget)}</b></span>
        <span>已用 <b>${BM.money(row.used)}</b></span>
        <span style="color:${remain < 0 ? "var(--c-danger)" : "var(--c-ok)"}">剩余 <b>${BM.money(remain)}</b></span>
      </div>
      <div class="pc-bar-row">
        <div class="progress" style="flex:1"><div class="progress-fill ${rate >= 100 ? "danger" : rate >= 80 ? "warn" : "ok"}" style="width:${Math.min(rate, 100)}%"></div></div>
        <span class="pct">${rate}%</span>
      </div>`;
    container.appendChild(card);
  });
}

/* ---------- 预算编制（按财务规则） ---------- */
function renderPlan(container, r) {
  const mode = BM.state.rules.planMode; // topdown / bottomup
  const status = BM.state.plan.status;
  const isBottomUp = mode === "bottomup";

  /* 规则标签 */
  const tag = el("div", "ai-warn-bar");
  tag.innerHTML = `<span>⚙</span><span>当前编制规则（财务已设置）：${isBottomUp ? "自下而上 · 可新增可编辑" : "自上而下 · 只分解不可新增"}</span>`;
  container.appendChild(tag);

  /* 历史数据导入按钮 */
  const importRow = el("div", "pc-actions");
  importRow.style.marginTop = "4px";
  const importBtn = el("button", "btn btn-outline btn-sm btn-block", "📂 历史数据导入");
  importBtn.addEventListener("click", () => {
    if (typeof BM.showImportModal === "function") {
      BM.showImportModal();
    } else {
      BM.toast("请先加载完整版预算编制功能");
    }
  });
  importRow.appendChild(importBtn);
  container.appendChild(importRow);

  /* 流程状态（按模式） */
  const flows = isBottomUp
    ? ["个人提报", "部门汇总", "财务汇总", "总经理批准"]
    : ["总经理定总额", "部门分解", "个人分解", "财务汇总", "总经理批准"];
  const flowIdx = status === "approved" ? flows.length - 1 : status === "finance_approved" ? flows.length - 2 : status === "submitted" ? Math.min(1, flows.length - 2) : 0;
  const flowBar = el("div", "flow-bar");
  flows.forEach((n, i) => {
    flowBar.appendChild(el("span", "flow-node" + (i === flowIdx ? " current" : i < flowIdx ? " done" : ""), n));
    if (i < flows.length - 1) flowBar.appendChild(el("span", "flow-arrow", "→"));
  });
  container.appendChild(flowBar);

  if (r === "manager" || r === "staff") {
    /* 经理/员工：按本部门/本人项目 → 物料 填报 */
    if (isBottomUp) renderPlanFill(container, r);
    else renderPlanDecompose(container, r);
  } else {
    /* 总经理/财务：编辑视图 */
    container.appendChild(el("div", "section-title", "预算分配明细（按部门）"));
    const tbl = el("div", "tbl-wrap");
    const table = el("table");
    table.innerHTML = `<thead><tr><th>部门</th><th>负责人</th><th>分配预算</th><th>AI 建议</th></tr></thead>`;
    const tbody = el("tbody");
    const rows = {};
    let total = 0;
    BM.DEPTS.forEach((d) => {
      rows[d.id] = BM.state.plan.rows[d.id] !== undefined ? BM.state.plan.rows[d.id] : 0;
      total += rows[d.id];
    });
    BM.DEPTS.forEach((d) => {
      const tr = el("tr");
      tr.innerHTML = `<td><b>${esc(d.name)}</b></td><td>${esc(d.head)}</td>
        <td style="text-align:right"><input class="plan-input" value="${rows[d.id]}" data-dept="${d.id}"></td>
        <td><span class="ai-suggest-tag">AI ${BM.money(BM.buildTopDownSuggestion ? BM.buildTopDownSuggestion()[d.id] : 0)}</span></td>`;
      tbody.appendChild(tr);
    });
    const sumTr = el("tr");
    sumTr.innerHTML = `<td colspan="2"><b>合计</b></td><td class="tbl-num" style="text-align:right"><b>${BM.money(total)}</b></td><td></td>`;
    tbody.appendChild(sumTr);
    table.appendChild(tbody);
    tbl.appendChild(table);
    container.appendChild(tbl);
    const hint = el("div", "hint-text", "AI 已按 1-9 月历史执行年化预填建议额度，可直接修改");
    hint.style.margin = "6px 2px";
    container.appendChild(hint);
    tbody.querySelectorAll("input").forEach((inp) => {
      inp.addEventListener("change", () => {
        rows[inp.dataset.dept] = parseInt(inp.value, 10) || 0;
        BM.planSaveRows(rows);
      });
    });
    if (r === "boss") {
      const actions = el("div", "pc-actions");
      const b = el("button", "btn btn-accent btn-block", status === "approved" ? "预算已批准" : "批准年度预算");
      b.disabled = status === "approved";
      b.addEventListener("click", () => {
        BM.planApprove();
        BM.toast("✅ 年度预算已批准，成为执行依据");
        BM.renderTab();
      });
      actions.appendChild(b);
      container.appendChild(actions);
    }
  }
}

function renderPlanFill(container, r) {
  let projects;
  if (r === "manager") projects = BM.PROJECTS.filter((p) => p.deptId === BM.state.deptId);
  else projects = BM.PROJECTS.filter((p) => p.owner === "张伟" && p.ownerRole === "staff");

  const info = el("div", "card");
  info.innerHTML = `<div class="card-title">${r === "manager" ? "本部门填报" : "我的项目填报"}<span class="badge badge-ok" style="margin-left:auto">可新增 · 可编辑</span></div>
    <div class="card-desc" style="margin-top:6px">您是预算上报方，可自行增加项目与物料 · 共 ${projects.length} 个项目 · 其他部门数据不可见</div>`;
  container.appendChild(info);

  if (!projects.length) {
    container.appendChild(el("div", "empty", `<div class="empty-ico">🗂</div>暂无项目，点击下方新增`));
  }
  projects.forEach((p) => {
    const info2 = BM.projectInfo(p);
    const block = el("div", "plan-editor");
    block.innerHTML = `<div class="card-title">${esc(p.name)}<span class="badge badge-info">${esc(info2.catName)}</span><span class="badge badge-accent">额度 ${BM.money(p.budget)}</span></div>`;
    const mats = BM.MATERIALS.filter((m) => m.projectId === p.id);
    if (!mats.length) {
      block.appendChild(el("div", "hint-text", "该项目暂无物料配置", "p"));
    }
    mats.forEach((m) => {
      const row = el("div", "todo-item");
      row.innerHTML = `<div class="td-main"><div class="td-title">${esc(m.name)} <span class="ai-suggest-tag">AI 建议 ${(m.budget || 0).toLocaleString()}</span></div>
        <div class="td-sub">历史已用 ${(m.used || 0).toLocaleString()} · ${esc(m.spec || "")}</div></div>
        <input class="plan-input" type="number" step="1000" value="${m.budget || 0}" data-proj="${p.id}" data-mat="${m.id}">`;
      block.appendChild(row);
    });
    /* 新增物料 */
    const addRow = el("div", "pc-actions");
    const inpN = el("input");
    inpN.placeholder = "物料名";
    inpN.style.flex = "1";
    inpN.style.border = "1px solid var(--c-border)";
    inpN.style.borderRadius = "8px";
    inpN.style.padding = "7px 9px";
    const inpA = el("input");
    inpA.type = "number";
    inpA.placeholder = "金额";
    inpA.style.width = "84px";
    inpA.style.border = "1px solid var(--c-border)";
    inpA.style.borderRadius = "8px";
    inpA.style.padding = "7px 9px";
    const btnAdd = el("button", "btn btn-outline btn-sm", "＋ 物料");
    btnAdd.addEventListener("click", () => {
      const name = inpN.value.trim();
      const amt = parseInt(inpA.value, 10) || 10000;
      if (!name) { BM.toast("请输入物料名称"); return; }
      BM.MATERIALS.push({ id: "M" + Date.now(), name, catId: p.catId, projectId: p.id, budget: amt, used: 0, unit: "批", spec: "新增" });
      BM.toast("✅ 已新增物料：" + name);
      BM.renderTab();
    });
    addRow.appendChild(inpN);
    addRow.appendChild(inpA);
    addRow.appendChild(btnAdd);
    block.appendChild(addRow);
    container.appendChild(block);

    block.querySelectorAll("input[data-mat]").forEach((inp) => {
      inp.addEventListener("change", () => {
        const m = BM.MATERIALS.find((x) => x.id === inp.dataset.mat);
        if (m) { m.budget = parseInt(inp.value, 10) || 0; BM.toast("已保存：" + p.name); }
      });
    });
  });

  /* 新增项目 */
  const addProj = el("div", "plan-editor");
  addProj.innerHTML = `<div class="card-title">＋ 新增项目</div>`;
  const row1 = el("div", "pc-actions");
  const pName = el("input");
  pName.placeholder = "项目名称";
  pName.style.flex = "1";
  pName.style.border = "1px solid var(--c-border)";
  pName.style.borderRadius = "8px";
  pName.style.padding = "7px 9px";
  const pAmt = el("input");
  pAmt.type = "number";
  pAmt.placeholder = "预算";
  pAmt.style.width = "84px";
  pAmt.style.border = "1px solid var(--c-border)";
  pAmt.style.borderRadius = "8px";
  pAmt.style.padding = "7px 9px";
  const btnP = el("button", "btn btn-accent btn-sm", "新增");
  btnP.addEventListener("click", () => {
    const name = pName.value.trim();
    const amt = parseInt(pAmt.value, 10) || 50000;
    if (!name) { BM.toast("请输入项目名称"); return; }
    const myDept = r === "manager" ? BM.state.deptId : "it";
    BM.PROJECTS.push({ id: "P" + Date.now(), name, deptId: myDept, catId: "office", budget: amt, used: 0, frozen: 0, owner: r === "manager" ? BM.DEPTS.find((d) => d.id === myDept).head : "张伟", ownerRole: r === "manager" ? "manager" : "staff", status: "编制中", desc: "手机版新增" });
    BM.toast("✅ 已新增项目：" + name);
    BM.renderTab();
  });
  row1.appendChild(pName);
  row1.appendChild(pAmt);
  row1.appendChild(btnP);
  addProj.appendChild(row1);
  container.appendChild(addProj);

  /* 提交 */
  const submit = el("div", "pc-actions");
  const sb = el("button", "btn btn-primary btn-block", "提交预算 → 财务汇总");
  sb.addEventListener("click", () => {
    BM.planSubmit();
    BM.toast("✅ 预算已提交，等待财务汇总");
    BM.renderTab();
  });
  submit.appendChild(sb);
  container.appendChild(submit);
}

function renderPlanDecompose(container, r) {
  /* 约束分解：加总 ≤ 上级额度 */
  let projects, quota;
  if (r === "manager") {
    projects = BM.PROJECTS.filter((p) => p.deptId === BM.state.deptId);
    quota = BM.state.plan.rows[BM.state.deptId] || 0;
    if (!quota) quota = BM.PROJECTS.filter((p) => p.deptId === BM.state.deptId).reduce((a, p) => a + p.budget, 0) || 2950000;
  } else {
    projects = BM.PROJECTS.filter((p) => p.owner === "张伟" && p.ownerRole === "staff");
    quota = projects.reduce((a, p) => a + p.budget, 0);
  }

  const bar = el("div", "ai-warn-bar");
  bar.innerHTML = `<span>◈</span><span>约束分解 · 上级额度 ${BM.money(quota)} · 只分解不可新增</span>`;
  container.appendChild(bar);

  const rows = {};
  projects.forEach((p) => {
    BM.MATERIALS.filter((m) => m.projectId === p.id).forEach((m) => {
      rows[p.id + ":" + m.id] = m.budget || 0;
    });
  });
  const totalBar = el("div", "card");
  totalBar.id = "decomposeTotal";
  container.appendChild(totalBar);

  const recalc = () => {
    const total = Object.keys(rows).reduce((a, k) => a + (rows[k] || 0), 0);
    const diff = quota - total;
    const ok = diff >= 0;
    totalBar.innerHTML = `<div class="card-title">分解合计 <b style="margin-left:auto">${BM.money(total)}</b></div>
      <div class="pc-nums"><span>上级额度 ${BM.money(quota)}</span>
      <span style="color:${ok ? "var(--c-ok)" : "var(--c-danger)"}">${ok ? "剩余 " + BM.money(diff) : "超额度 " + BM.money(-diff)}</span>
      <span class="badge ${ok ? "badge-ok" : "badge-danger"}">${ok ? "审查通过" : "审查不通过"}</span></div>`;
    return ok;
  };

  projects.forEach((p) => {
    const info2 = BM.projectInfo(p);
    const block = el("div", "plan-editor");
    block.innerHTML = `<div class="card-title">${esc(p.name)}<span class="badge badge-info">${esc(info2.catName)}</span></div>`;
    BM.MATERIALS.filter((m) => m.projectId === p.id).forEach((m) => {
      const row = el("div", "todo-item");
      row.innerHTML = `<div class="td-main"><div class="td-title">${esc(m.name)} <span class="ai-suggest-tag">AI 建议 ${(m.budget || 0).toLocaleString()}</span></div>
        <div class="td-sub">历史已用 ${(m.used || 0).toLocaleString()}</div></div>
        <input class="plan-input" type="number" step="1000" value="${rows[p.id + ":" + m.id]}" data-key="${p.id + ":" + m.id}">`;
      block.appendChild(row);
    });
    container.appendChild(block);
  });
  container.querySelectorAll("input[data-key]").forEach((inp) => {
    inp.addEventListener("change", () => {
      rows[inp.dataset.key] = parseInt(inp.value, 10) || 0;
      recalc();
    });
  });
  recalc();

  const submit = el("div", "pc-actions");
  const sb = el("button", "btn btn-primary btn-block", "提交分解（审查后）");
  sb.addEventListener("click", () => {
    const ok = recalc();
    if (!ok) { BM.toast("⛔ 分解合计超过上级额度，审查不通过"); return; }
    BM.planSubmit();
    BM.toast("✅ 分解已提交");
    BM.renderTab();
  });
  submit.appendChild(sb);
  container.appendChild(submit);
}

/* ---------- 预算追踪（三态筛选） ---------- */
function renderTrack(container, r) {
  const deptIds = BM.scopeDeptIds();
  const cats = BM.CATEGORIES.filter((c) => {
    if (!deptIds) return true;
    return BM.DOCS.some((d) => d.catId === c.id && deptIds.indexOf(d.deptId) >= 0);
  });

  const filters = [
    { key: "all", label: "全部", match: () => true },
    { key: "over", label: "当前超预算", match: (c) => BM.getCatBudget(c.id) - c.used - c.frozen < 0 },
    { key: "remain", label: "当前有结余", match: (c) => BM.getCatBudget(c.id) - c.used - c.frozen > 0 },
    { key: "forecast", label: "预计有结余", match: (c) => c.yearForecast < c.budget },
  ];
  const state = { cur: "all" };

  const tabs = el("div", "view-tabs");
  const body = el("div", "");
  const render = () => {
    body.innerHTML = "";
    const items = cats.filter((c) => filters.find((f) => f.key === state.cur).match(c));
    items.forEach((c) => {
      const rate = c.budget ? Math.round((c.used / c.budget) * 1000) / 10 : 0;
      const remain = BM.getCatBudget(c.id) - c.used - c.frozen;
      const fCls = c.forecast.status === "danger" ? "badge-danger" : c.forecast.status === "warn" ? "badge-warn" : "badge-ok";
      const card = el("div", "card");
      card.innerHTML = `<div class="card-title">${esc(c.name)}<span class="badge ${fCls}" style="margin-left:auto">${esc(c.forecast.label)}</span></div>
        <div class="pc-nums">
          <span>预算 <b>${BM.money(c.budget)}</b></span>
          <span>已用 <b>${BM.money(c.used)}</b></span>
          <span style="color:${remain < 0 ? "var(--c-danger)" : "var(--c-ok)"}">剩余 <b>${BM.money(remain)}</b></span>
        </div>
        <div class="pc-bar-row">
          <div class="progress" style="flex:1"><div class="progress-fill ${rate >= 100 ? "danger" : rate >= 80 ? "warn" : "ok"}" style="width:${Math.min(rate, 100)}%"></div></div>
          <span class="pct">${rate}%</span>
        </div>
        <div class="card-desc" style="margin-top:7px">${esc(c.forecast.detail)}</div>`;
      body.appendChild(card);
    });
    if (!items.length) body.appendChild(el("div", "empty", `<div class="empty-ico">✅</div>该筛选下无科目`));
  };
  filters.forEach((f) => {
    const cnt = cats.filter(f.match).length;
    const b = el("button", "view-tab" + (f.key === state.cur ? " active" : ""), `${f.label} ${cnt}`);
    b.addEventListener("click", () => {
      state.cur = f.key;
      tabs.querySelectorAll(".view-tab").forEach((x, i) => x.classList.toggle("active", filters[i].key === f.key));
      render();
    });
    tabs.appendChild(b);
  });
  container.appendChild(tabs);
  container.appendChild(body);
  render();
}

/* ---------- 决算 ---------- */
function renderFinal(container) {
  const totalBudget = BM.CATEGORIES.reduce((a, c) => a + c.budget, 0);
  const totalForecast = BM.CATEGORIES.reduce((a, c) => a + c.yearForecast, 0);
  const totalVar = totalForecast - totalBudget;
  const kpi = el("div", "kpi-grid");
  kpi.appendChild(el("div", "kpi accent", `<div class="kpi-label">年度预算总额</div><div class="kpi-value">${BM.money(totalBudget)}</div><div class="kpi-sub">8 科目</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">预计全年执行</div><div class="kpi-value">${BM.money(totalForecast)}</div><div class="kpi-sub">1-9 实际 + 10-12 预测</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">预计结余 / 超支</div><div class="kpi-value" style="color:${totalVar >= 0 ? "var(--c-ok)" : "var(--c-danger)"}">${totalVar >= 0 ? "+" : ""}${BM.money(totalVar)}</div><div class="kpi-sub">${totalVar >= 0 ? "预算结余" : "预算超支"}</div>`));
  container.appendChild(kpi);

  const tbl = el("div", "tbl-wrap");
  const table = el("table");
  table.innerHTML = `<thead><tr><th>科目</th><th>预算</th><th>预计</th><th>差异</th></tr></thead>`;
  const tbody = el("tbody");
  BM.CATEGORIES.forEach((c) => {
    const varAmt = c.variance;
    const tr = el("tr");
    tr.innerHTML = `<td><b>${esc(c.name)}</b></td><td class="tbl-num">${BM.money(c.budget)}</td><td class="tbl-num">${BM.money(c.yearForecast)}</td>
      <td class="tbl-num" style="color:${varAmt >= 0 ? "var(--c-danger)" : "var(--c-ok)"};font-weight:500">${varAmt >= 0 ? "+" : ""}${BM.money(varAmt)}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tbl.appendChild(table);
  container.appendChild(tbl);

  const actions = el("div", "pc-actions");
  const b = el("button", "btn btn-accent btn-block", "启动决算");
  b.addEventListener("click", () => {
    BM.finalConfirm();
    BM.toast("✅ 决算已确认，数据自动汇总");
    BM.renderTab();
  });
  actions.appendChild(b);
  container.appendChild(actions);
}

/* ---------- 财务规则 ---------- */
function renderRules(container) {
  const RULES = [
    { key: "planMode", title: "编制方式", options: [{ v: "topdown", t: "自上而下", d: "总经理定总额 → 逐级分解" }, { v: "bottomup", t: "自下而上", d: "个人/部门提报 → 汇总" }] },
    { key: "trackMode", title: "执行追踪", options: [{ v: "reimburse", t: "实际报销为准", d: "报销入账后更新预算" }, { v: "apply", t: "申请单预跟踪", d: "请款单先占额度" }] },
    { key: "surplus", title: "期末余量", options: [{ v: "recover", t: "收回", d: "未花完预算收回" }, { v: "hold", t: "挂起", d: "保留待下期" }, { v: "carry", t: "结转", d: "结转到下期" }] },
    { key: "allowOverBudget", title: "超预算", options: [{ v: true, t: "不允许", d: "拦截 + 走追加流程" }, { v: false, t: "允许", d: "走部门经理审批接口" }] },
  ];
  RULES.forEach((rule) => {
    container.appendChild(el("div", "section-title", rule.title));
    rule.options.forEach((opt) => {
      const cur = BM.state.rules[rule.key];
      const active = String(cur) === String(opt.v);
      const b = el("button", "rule-opt" + (active ? " active" : ""));
      b.innerHTML = `<div class="ro-t">${esc(opt.t)}${active ? " ✓" : ""}</div><div class="ro-d">${esc(opt.d)}</div>`;
      b.addEventListener("click", () => {
        const patch = {};
        patch[rule.key] = opt.v;
        BM.saveRules(patch);
        BM.toast("✅ 规则已更新：" + rule.title + " → " + opt.t);
        BM.renderTab();
      });
      container.appendChild(b);
    });
  });
}

/* ---------- 预算调整 ---------- */
function renderAdjust(container) {
  container.appendChild(el("div", "section-title", "发起预算调整"));
  const form = el("div", "plan-editor");
  form.innerHTML = `<div class="card-title">调剂 / 追加 / 调减</div>`;
  const row = el("div", "pc-actions");
  const typeSel = el("select");
  typeSel.innerHTML = `<option value="transfer">调剂</option><option value="add">追加</option><option value="cut">调减</option>`;
  typeSel.style.flex = "1";
  typeSel.style.border = "1px solid var(--c-border)";
  typeSel.style.borderRadius = "8px";
  typeSel.style.padding = "7px 9px";
  const projSel = el("select");
  projSel.innerHTML = BM.PROJECTS.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  projSel.style.flex = "1.6";
  projSel.style.border = "1px solid var(--c-border)";
  projSel.style.borderRadius = "8px";
  projSel.style.padding = "7px 9px";
  row.appendChild(typeSel);
  row.appendChild(projSel);
  form.appendChild(row);
  const row2 = el("div", "pc-actions");
  const amt = el("input");
  amt.type = "number";
  amt.placeholder = "金额";
  amt.style.flex = "1";
  amt.style.border = "1px solid var(--c-border)";
  amt.style.borderRadius = "8px";
  amt.style.padding = "7px 9px";
  const btn = el("button", "btn btn-accent btn-sm", "提交调整");
  btn.addEventListener("click", () => {
    const r2 = BM.createAdjustment(typeSel.value, projSel.value, parseInt(amt.value, 10) || 10000, "手机端发起");
    BM.toast("✅ 调整单已生成，AI 初审：" + (r2.ai && r2.ai.verdict === "pass" ? "建议通过" : "建议复核"));
    BM.renderTab();
  });
  row2.appendChild(amt);
  row2.appendChild(btn);
  form.appendChild(row2);
  container.appendChild(form);

  /* 调整记录 */
  container.appendChild(el("div", "section-title", "调整记录"));
  const list = BM.state.adjustments;
  if (!list.length) {
    container.appendChild(el("div", "empty", `<div class="empty-ico">📋</div>暂无调整记录`));
  } else {
    list.forEach((a) => {
      const p = BM.PROJECTS.find((x) => x.id === a.projectId);
      const card = el("div", "card");
      card.innerHTML = `<div class="card-title">${esc(a.typeName)}<span class="badge ${a.status === "approved" ? "badge-ok" : a.status === "rejected" ? "badge-danger" : "badge-warn"}" style="margin-left:auto">${esc(a.status)}</span></div>
        <div class="card-desc">${p ? esc(p.name) : ""} · ${BM.money(a.amount)}</div>`;
      container.appendChild(card);
    });
  }
}

window.BM = BM;

/* ================================================================
 * 历史数据导入弹窗（完整功能演示）
 * ================================================================ */
BM.showImportModal = function () {
  var overlay = el("div", "modal-overlay");
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:500;display:flex;align-items:center;justify-content:center";

  var modal = el("div", "login-card");
  modal.style.maxWidth = "90vw";
  modal.style.width = "520px";
  modal.style.padding = "24px 20px";
  modal.style.margin = "0";
  modal.style.maxHeight = "85vh";
  modal.style.overflowY = "auto";

  var step = 1;
  var file = null;

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

  var expandedRecords = [];
  mockRecords.forEach(function (r) {
    for (var i = 0; i < 5; i++) {
      var m = parseInt(r.date.split("-")[1]);
      var d = (parseInt(r.date.split("-")[2]) + i * 7) % 28 + 1;
      expandedRecords.push({
        deptName: r.deptName, catName: r.catName, desc: r.desc + (i > 0 ? "（第" + (i + 1) + "批）" : ""),
        amount: Math.round(r.amount * (0.7 + Math.random() * 0.6) / 100) * 100,
        date: "2025-" + String((m + i) % 12 + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"),
        supplier: r.supplier, type: r.type,
      });
    }
  });

  var records = expandedRecords;

  function mapRecord(r) {
    var dept = BM.DEPTS.find(function (d) { return d.name === r.deptName; });
    var cat = BM.CATEGORIES.find(function (c) { return c.name === r.catName; });
    return {
      id: "IMP" + String(Math.random()).slice(2, 8),
      date: r.date, type: r.type,
      catId: cat ? cat.id : "", catName: r.catName,
      deptId: dept ? dept.id : "", supplier: r.supplier,
      amount: r.amount, desc: r.desc, status: "已付款",
    };
  }

  function renderContent() {
    modal.innerHTML = "";

    if (step === 1) {
      modal.innerHTML = `<div class="login-title" style="font-size:17px;margin-bottom:6px">📂 历史数据导入</div>
        <div class="login-sub" style="margin-bottom:16px;font-size:13px">上传往年预算执行数据，AI 将自动分析并更新编制建议</div>
        <div style="border:2px dashed var(--c-border);border-radius:12px;padding:32px 16px;text-align:center;cursor:pointer;margin-bottom:12px" id="dropZone">
          <div style="font-size:36px;margin-bottom:8px">📄</div>
          <div style="font-weight:600;color:var(--c-text);font-size:14px;margin-bottom:4px">点击上传或拖拽文件</div>
          <div style="font-size:12px;color:var(--c-text-3)">支持 CSV、Excel (.xlsx) 格式</div>
        </div>
        <div style="background:var(--c-bg-2);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--c-text-2);margin-bottom:12px">
          <div style="font-weight:600;margin-bottom:4px;color:var(--c-text)">💡 格式要求：</div>需包含：部门、科目、金额、日期
        </div>
        <div style="text-align:right">
          <button class="btn btn-ghost" style="margin-right:8px" id="cancelImport">取消</button>
        </div>`;

      var dropZone = modal.querySelector("#dropZone");
      dropZone.addEventListener("click", function () { file = { name: "2025年预算执行明细.csv", size: 245000 }; step = 2; renderContent(); });
      dropZone.addEventListener("dragover", function (e) { e.preventDefault(); dropZone.style.borderColor = "var(--c-accent)"; });
      dropZone.addEventListener("dragleave", function () { dropZone.style.borderColor = "var(--c-border)"; });
      dropZone.addEventListener("drop", function (e) { e.preventDefault(); file = { name: "2025年预算执行明细.csv", size: 245000 }; step = 2; renderContent(); });
      modal.querySelector("#cancelImport").addEventListener("click", function () { overlay.remove(); });
    }

    if (step === 2) {
      var deptSet = {}; var catSet = {}; var totalAmount = 0;
      records.forEach(function (r) { deptSet[r.deptName] = true; catSet[r.catName] = true; totalAmount += r.amount; });
      var deptCount = Object.keys(deptSet).length;
      var catCount = Object.keys(catSet).length;

      var previewRows = records.slice(0, 5).map(function (r) {
        return `<tr><td>${esc(r.deptName)}</td><td>${esc(r.catName)}</td><td>${esc(r.desc)}</td><td class="tbl-num" style="text-align:right">${r.amount.toLocaleString()}</td><td>${esc(r.date)}</td></tr>`;
      }).join("");

      modal.innerHTML = `<div class="login-title" style="font-size:17px;margin-bottom:6px">📋 解析预览</div>
        <div style="font-size:12px;color:var(--c-text-2);margin-bottom:8px">
          已选择 <b>${esc(file.name)}</b> · AI 匹配 ${deptCount} 部门 ${catCount} 科目 · 合计 <b>${BM.money(totalAmount)}</b>
        </div>
        <div class="tbl-wrap" style="max-height:200px;overflow-y:auto;margin-bottom:12px;font-size:12px">
          <table>
            <thead><tr><th>部门</th><th>科目</th><th>说明</th><th style="text-align:right">金额</th><th>日期</th></tr></thead>
            <tbody>${previewRows}</tbody>
          </table>
          ${records.length > 5 ? `<div style="text-align:center;padding:6px 0;font-size:11px;color:var(--c-text-3)">共 ${records.length} 条记录，仅展示前 5 条</div>` : ""}
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" id="backStep">← 返回</button>
          <button class="btn btn-primary btn-sm" id="confirmImport">确认导入 · ${records.length} 条</button>
        </div>`;

      modal.querySelector("#backStep").addEventListener("click", function () { step = 1; renderContent(); });
      modal.querySelector("#confirmImport").addEventListener("click", function () {
        var newDocs = records.map(mapRecord);
        BM.DOCS = BM.DOCS.concat(newDocs);
        BM.CATEGORIES.forEach(function (cat) {
          var docs = BM.DOCS.filter(function (d) { return d.catId === cat.id; });
          cat.used = docs.reduce(function (a, d) { return a + d.amount; }, 0);
        });
        BM.PROJECTS.forEach(function (p) {
          p.remain = p.budget - p.used - p.frozen;
          p.execRate = p.budget ? Math.round((p.used / p.budget) * 1000) / 10 : 0;
        });
        step = 3; renderContent();
      });
    }

    if (step === 3) {
      var deptSet3 = {}; records.forEach(function (r) { deptSet3[r.deptName] = true; });
      var deptCount3 = Object.keys(deptSet3).length;
      modal.innerHTML = `<div style="text-align:center;padding:12px 0">
        <div style="font-size:44px;margin-bottom:8px">✅</div>
        <div class="login-title" style="font-size:17px;margin-bottom:8px">导入成功！</div>
        <div style="font-size:13px;color:var(--c-text-2);margin-bottom:16px;line-height:1.6">
          共导入 <b style="color:var(--c-primary)">${records.length} 条</b>历史记录<br>
          覆盖 <b style="color:var(--c-primary)">${deptCount3} 个部门</b>，AI 建议已重新计算
        </div>
        <button class="btn btn-primary" id="doneImport">完成，刷新</button>
      </div>`;
      modal.querySelector("#doneImport").addEventListener("click", function () {
        overlay.remove();
        BM.renderTab();
        BM.toast("✅ " + records.length + " 条历史数据已导入");
      });
    }
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  renderContent();
  overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
};
