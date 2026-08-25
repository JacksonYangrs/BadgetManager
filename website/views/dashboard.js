/* ================================================================
 * dashboard.js — 预算总览看板（v0.2：支持角色数据范围）
 * boss/finance：全局；manager/staff：本部门口径
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

/* 当前范围描述 */
function scopeInfo() {
  const r = BM.state.role;
  const deptIds = BM.scopeDeptIds();
  if (deptIds) {
    const names = deptIds.map((id) => (BM.DEPTS.find((d) => d.id === id) || {}).name).join("、");
    return { global: false, label: "本部门 · " + names };
  }
  /* 阶段一：真实角色范围描述（V2 §2.2） */
  const sd = BM.scopedData ? BM.scopedData() : { level: "group" };
  if (sd.level === "company") {
    const comp = (BM.COMPANIES || []).find((c) => c.code === sd.companyId) || { name: sd.companyId };
    return { global: false, label: "本公司 · " + comp.name + "（含下属，mock）" };
  }
  if (sd.level === "center") {
    return { global: false, label: "归口职能中心 · " + ((sd.center && sd.center.name) || sd.centerId) + "（跨公司）" };
  }
  if (sd.level === "self") {
    const et = (BM.EXPENSE_TYPES || []).find((x) => x.id === sd.expenseType) || { name: sd.expenseType };
    return { global: false, label: "本人项目 · " + et.name };
  }
  return { global: true, label: "全局 · 6 部门 · 8 科目" };
}

let _dashBox = null;
function renderDashboard(container) {
  _dashBox = container;
  container.innerHTML = "";
  const page = el("div", "page");
  const scope = scopeInfo();
  const role = BM.state.role;

  /* ---- 页头 ---- */
  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">预算总览</div>
      <div class="page-desc">同一预算的多个视角 · 演示时点 2026 年 9 月 · 当前范围：${esc(scope.label)}</div>`)
  );
  const right = el("div", "page-head-right");
  const roleHint = el("span", "role-hint", `👤 ${scope.global ? "全局视角" : "本部门视角"}`);
  right.appendChild(roleHint);
  head.appendChild(right);
  page.appendChild(head);
  BM.renderRoleHint(page, "dashboard");

  /* ---- 多视图 Tab（按角色） ---- */
  const tabDefs = dashTabs(role);
  const tabs = el("div", "dash-tabs");
  const tabBtns = {};
  tabDefs.forEach((t) => {
    const b = el("button", "dash-tab" + (t.key === "cat" ? " active" : ""), t.label);
    tabs.appendChild(b);
    tabBtns[t.key] = b;
  });
  page.appendChild(tabs);

  const body = el("div", "dash-body");
  page.appendChild(body);

  const switchView = (mode) => {
    body.innerHTML = "";
    Object.keys(tabBtns).forEach((k) => tabBtns[k].classList.toggle("active", k === mode));
    if (mode === "cat") renderCatBody(body, scope);
    else if (mode === "proj") BM.renderProjView(body);
    else if (mode === "mat") renderMatBody(body, scope);
    else     if (mode === "dept") renderDeptBody(body, scope);
    else if (mode === "people") renderPeopleBody(body, scope);
    else if (mode === "org") renderOrgBody(body, scope);
    else if (mode === "bd") renderBizDivBody(body, scope);
    else if (mode === "center") renderCenterBody(body, scope);
  };
  tabDefs.forEach((t) => {
    tabBtns[t.key].addEventListener("click", () => { dashActiveTab = t.key; switchView(t.key); });
  });

  const initKey = tabDefs.some((t) => t.key === dashActiveTab) ? dashActiveTab : tabDefs[0].key;
  switchView(initKey);
  container.appendChild(page);
}

/* 当前激活的 dashboard 子 Tab（跨重渲染保留，避免切换器/重绘后跳回默认 Tab） */
let dashActiveTab = "cat";

/* 按角色返回可见视角（v0.5.1：总经理=部门视角，财务/经理=人员视角） */
function dashTabs(role) {
  if (role === "staff" || role === "expense") {
    return [
      { key: "proj", label: "项目视角" },
      { key: "mat", label: "物料视角" },
    ];
  }
  const base = [
    { key: "cat", label: "科目视角" },
    { key: "proj", label: "项目视角" },
    { key: "mat", label: "物料视角" },
  ];
  /* 总经理 → 部门视角；财务/部门经理 → 人员视角 */
  base.push(role === "boss" ? { key: "dept", label: "部门视角" } : { key: "people", label: "人员视角" });
  /* 总经理 / 财务 → 组织树（客户真实四级结构） */
  if (role === "boss" || role === "finance") {
    base.push({ key: "org", label: "组织树" });
  }
  /* 阶段一：维度扩展（映射文档 §4.1.2 / §4.1.3）
   * 集团层 → 事业部维度 + 职能中心维度；归口责任人 → 职能中心维度（跨公司看归口科目）。 */
  const isGroup = ["ceo", "cooLead", "cooAnalyst", "boss", "finance"].indexOf(role) >= 0;
  if (isGroup) {
    base.push({ key: "bd", label: "事业部维度" });
    base.push({ key: "center", label: "职能中心维度" });
  } else if (role === "centerOwner") {
    base.push({ key: "center", label: "职能中心维度" });
  }
  return base;
}

/* ---- 部门视角（总经理专属，v0.5.1：从科目视角挪出独立成页） ---- */
function renderDeptBody(page, scope) {
  /* 按一级中心分组 → 二级部门汇总（从项目聚合） */
  const orgs = BM.ORGS.map((o) => {
    const depts = BM.DEPTS.filter((d) => d.orgId === o.id).map((d) => {
      const projs = BM.PROJECTS.filter((p) => p.deptId === d.id);
      const budget = projs.reduce((a, p) => a + p.budget, 0);
      const used = projs.reduce((a, p) => a + p.used, 0);
      const frozen = projs.reduce((a, p) => a + p.frozen, 0);
      const docs = BM.DOCS.filter((x) => x.deptId === d.id);
      const docTotal = docs.reduce((a, x) => a + x.amount, 0);
      return {
        id: d.id,
        name: d.name,
        head: d.head,
        budget,
        used,
        frozen,
        remain: budget - used - frozen,
        projCount: projs.length,
        docTotal,
        docCount: docs.length,
      };
    });
    const ob = depts.reduce((a, d) => a + d.budget, 0);
    const ou = depts.reduce((a, d) => a + d.used, 0);
    return { id: o.id, name: o.name, depts, budget: ob, used: ou };
  });

  /* 总 KPI */
  const allDepts = orgs.flatMap((o) => o.depts);
  const totalBudget = allDepts.reduce((a, d) => a + d.budget, 0);
  const totalUsed = allDepts.reduce((a, d) => a + d.used, 0);
  const totalRemain = allDepts.reduce((a, d) => a + d.remain, 0);
  const kpi = el("div", "kpi-grid");
  kpi.appendChild(el("div", "kpi accent", `<div class="kpi-label">部门预算总额</div><div class="kpi-value">${BM.money(totalBudget)}</div><div class="kpi-sub">${allDepts.length} 个部门</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">已用</div><div class="kpi-value">${BM.money(totalUsed)}</div><div class="kpi-sub">按部门项目聚合</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">剩余</div><div class="kpi-value">${BM.money(totalRemain)}</div><div class="kpi-sub">部门可支配</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">一级中心</div><div class="kpi-value">${orgs.length}</div><div class="kpi-sub">行政 / 业务</div>`));
  page.appendChild(kpi);

  /* 按一级中心分块 */
  orgs.forEach((o) => {
    page.appendChild(el("div", "section-title", `${esc(o.name)}（${BM.money(o.budget)}）`));
    const tbl = el("div", "tbl-wrap");
    const table = el("table");
    table.innerHTML = `<thead><tr>
      <th>部门</th><th>负责人</th><th>项目数</th><th style="text-align:right">部门预算</th><th style="text-align:right">已用</th><th style="text-align:right">冻结</th><th style="text-align:right">剩余</th><th style="width:110px">执行率</th>
    </tr></thead>`;
    const tbody = el("tbody");
    o.depts.forEach((d) => {
      const rate = d.budget ? Math.round((d.used / d.budget) * 1000) / 10 : 0;
      const rateCls = rate >= 100 ? "danger" : rate >= 80 ? "warn" : "ok";
      const tr = el("tr");
      tr.innerHTML = `<td><b>${esc(d.name)}</b></td>
        <td>${esc(d.head)}</td>
        <td class="tbl-num">${d.projCount}</td>
        <td class="tbl-num" style="text-align:right">${BM.money(d.budget)}</td>
        <td class="tbl-num" style="text-align:right">${BM.money(d.used)}</td>
        <td class="tbl-num" style="text-align:right">${BM.money(d.frozen)}</td>
        <td class="tbl-num" style="text-align:right;color:${d.remain < 0 ? "var(--c-danger)" : "var(--c-text)"}">${BM.money(d.remain)}</td>
        <td><div style="display:flex;align-items:center;gap:8px"><div class="progress" style="flex:1"><div class="progress-fill ${rateCls}" style="width:${Math.min(rate, 100)}%"></div></div><span class="pct">${rate}%</span></div></td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tbl.appendChild(table);
    page.appendChild(tbl);
  });

  /* 部门费用流水（单据口径） */
  page.appendChild(el("div", "section-title", "部门费用流水（单据口径 · 1-9 月）"));
  const tbl2 = el("div", "tbl-wrap");
  const table2 = el("table");
  table2.innerHTML = `<thead><tr><th>部门</th><th style="text-align:right">费用合计</th><th>笔数</th><th style="width:110px">占全局</th></tr></thead>`;
  const tbody2 = el("tbody");
  const allDocs = BM.DOCS;
  const grand = allDocs.reduce((a, x) => a + x.amount, 0);
  BM.DEPTS.forEach((d) => {
    const docs = allDocs.filter((x) => x.deptId === d.id);
    const total = docs.reduce((a, x) => a + x.amount, 0);
    const share = grand ? Math.round((total / grand) * 100) : 0;
    tbody2.appendChild(el("tr", "", `<td><b>${esc(d.name)}</b></td>
      <td class="tbl-num" style="text-align:right">${BM.money(total)}</td>
      <td class="tbl-num">${docs.length}</td>
      <td><div style="display:flex;align-items:center;gap:8px"><div class="progress" style="flex:1"><div class="progress-fill ok" style="width:${share}%"></div></div><span class="pct">${share}%</span></div></td>`));
  });
  table2.appendChild(tbody2);
  tbl2.appendChild(table2);
  page.appendChild(tbl2);
}

/* ---- 物料视角（按物料聚合，v0.5） ---- */
function renderMatBody(page, scope) {
  const mats = BM.MATERIALS.filter((m) => {
    if (scope.global) return true;
    const p = BM.PROJECTS.find((x) => x.id === m.projectId);
    return p && p.deptId === BM.state.deptId;
  });
  if (!mats.length) {
    page.appendChild(el("div", "empty", `<div class="empty-ico">📦</div>当前范围暂无物料数据`));
    return;
  }
  const totalBudget = mats.reduce((a, m) => a + m.budget, 0);
  const totalUsed = mats.reduce((a, m) => a + m.used, 0);
  const kpi = el("div", "kpi-grid");
  kpi.appendChild(el("div", "kpi accent", `<div class="kpi-label">物料预算总额</div><div class="kpi-value">${BM.money(totalBudget)}</div><div class="kpi-sub">${mats.length} 类物料</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">已消耗</div><div class="kpi-value">${BM.money(totalUsed)}</div><div class="kpi-sub">按物料消耗</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">剩余</div><div class="kpi-value">${BM.money(totalBudget - totalUsed)}</div><div class="kpi-sub">可用于后续采购</div>`));
  page.appendChild(kpi);

  page.appendChild(el("div", "section-title", "物料消耗明细"));
  const tbl = el("div", "tbl-wrap");
  const table = el("table");
  table.innerHTML = `<thead><tr>
    <th>物料</th><th>规格</th><th>单位</th><th>所属项目</th><th style="text-align:right">预算</th><th style="text-align:right">已用</th><th style="text-align:right">剩余</th><th>状态</th>
  </tr></thead>`;
  const tbody = el("tbody");
  mats.forEach((m) => {
    const p = BM.PROJECTS.find((x) => x.id === m.projectId) || {};
    const remain = m.budget - m.used;
    const rate = m.budget ? Math.round((m.used / m.budget) * 1000) / 10 : 0;
    const cls = rate >= 100 ? "badge-danger" : rate >= 80 ? "badge-warn" : "badge-ok";
    const tr = el("tr");
    tr.innerHTML = `<td><b>${esc(m.name)}</b></td>
      <td class="hint-text">${esc(m.spec)}</td>
      <td>${esc(m.unit)}</td>
      <td>${esc(p.name || "-")}</td>
      <td class="tbl-num" style="text-align:right">${BM.money(m.budget)}</td>
      <td class="tbl-num" style="text-align:right">${BM.money(m.used)}</td>
      <td class="tbl-num" style="text-align:right;color:${remain < 0 ? "var(--c-danger)" : "var(--c-text)"}">${BM.money(remain)}</td>
      <td><span class="badge ${cls}">${rate}%</span></td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tbl.appendChild(table);
  page.appendChild(tbl);
}

/* ---- 人员视角（按项目负责人聚合，v0.5） ---- */
function renderPeopleBody(page, scope) {
  const projects = BM.scopedProjects();
  const byOwner = {};
  projects.forEach((p) => {
    if (!byOwner[p.owner]) byOwner[p.owner] = { name: p.owner, count: 0, budget: 0, used: 0, frozen: 0 };
    const o = byOwner[p.owner];
    o.count++;
    o.budget += p.budget;
    o.used += p.used;
    o.frozen += p.frozen;
  });
  const owners = Object.values(byOwner).sort((a, b) => b.budget - a.budget);
  if (!owners.length) {
    page.appendChild(el("div", "empty", `<div class="empty-ico">👤</div>当前范围暂无人员数据`));
    return;
  }

  page.appendChild(el("div", "section-title", "按负责人（人员）聚合 · 预算谈到谁头上"));
  const tbl = el("div", "tbl-wrap");
  const table = el("table");
  table.innerHTML = `<thead><tr>
    <th>负责人</th><th>角色</th><th>负责项目</th><th style="text-align:right">项目预算</th><th style="text-align:right">已用</th><th style="text-align:right">剩余</th><th>执行率</th>
  </tr></thead>`;
  const tbody = el("tbody");
  owners.forEach((o) => {
    const remain = o.budget - o.used - o.frozen;
    const rate = o.budget ? Math.round((o.used / o.budget) * 1000) / 10 : 0;
    const rateCls = rate >= 100 ? "danger" : rate >= 80 ? "warn" : "ok";
    const roleName = o.name === "张伟" ? "员工" : "部门经理";
    const tr = el("tr");
    tr.innerHTML = `<td><b>${esc(o.name)}</b></td>
      <td><span class="badge badge-info">${roleName}</span></td>
      <td class="tbl-num">${o.count} 个</td>
      <td class="tbl-num" style="text-align:right">${BM.money(o.budget)}</td>
      <td class="tbl-num" style="text-align:right">${BM.money(o.used)}</td>
      <td class="tbl-num" style="text-align:right;color:${remain < 0 ? "var(--c-danger)" : "var(--c-text)"}">${BM.money(remain)}</td>
      <td><div style="display:flex;align-items:center;gap:8px"><div class="progress" style="flex:1"><div class="progress-fill ${rateCls}" style="width:${Math.min(rate, 100)}%"></div></div><span class="pct">${rate}%</span></div></td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tbl.appendChild(table);
  page.appendChild(tbl);
}

/* 科目视角主体（原预算总览内容） */
function renderCatBody(page, scope) {
  const docs = BM.scopedDocs();
  const S = BM.SUMMARY;

  /* ---- KPI ---- */
  const kpi = el("div", "kpi-grid");
  if (scope.global) {
    kpi.appendChild(
      el("div", "kpi accent", `<div class="kpi-label">年度费用预算总额</div>
        <div class="kpi-value">${BM.money(S.totalBudget)}</div>
        <div class="kpi-sub">6 部门 · 8 科目</div>`)
    );
    kpi.appendChild(
      el("div", "kpi", `<div class="kpi-label">已执行</div>
        <div class="kpi-value">${BM.money(S.totalUsed)}</div>
        <div class="kpi-sub">整体执行率 ${S.execRate}%</div>`)
    );
    kpi.appendChild(
      el("div", "kpi", `<div class="kpi-label">已冻结（在途）</div>
        <div class="kpi-value">${BM.money(S.totalFrozen)}</div>
        <div class="kpi-sub">已审批未付款</div>`)
    );
    kpi.appendChild(
      el("div", "kpi", `<div class="kpi-label">可用预算</div>
        <div class="kpi-value">${BM.money(S.totalRemain)}</div>
        <div class="kpi-sub">预算 − 已用 − 冻结</div>`)
    );
  } else {
    const total = docs.reduce((a, d) => a + d.amount, 0);
    const cats = new Set(docs.map((d) => d.catId));
    kpi.appendChild(
      el("div", "kpi accent", `<div class="kpi-label">本部门费用（1-9 月）</div>
        <div class="kpi-value">${BM.money(total)}</div>
        <div class="kpi-sub">${docs.length} 笔单据</div>`)
    );
    kpi.appendChild(
      el("div", "kpi", `<div class="kpi-label">涉及科目</div>
        <div class="kpi-value">${cats.size}</div>
        <div class="kpi-sub">${esc(scope.label)}</div>`)
    );
    const avg = docs.length ? Math.round(total / docs.length) : 0;
    kpi.appendChild(
      el("div", "kpi", `<div class="kpi-label">单笔均额</div>
        <div class="kpi-value">${BM.money(avg)}</div>
        <div class="kpi-sub">含采购 / 报销 / 合同付款</div>`)
    );
    const sup = new Set(docs.map((d) => d.supplier)).size;
    kpi.appendChild(
      el("div", "kpi", `<div class="kpi-label">合作供应商</div>
        <div class="kpi-value">${sup}</div>
        <div class="kpi-sub">历史合作记录</div>`)
    );
  }
  page.appendChild(kpi);

  /* ---- 科目执行表 ---- */
  page.appendChild(el("div", "section-title", "科目预算执行与 AI 预测" + (scope.global ? "" : "（本部门涉及科目）")));
  const tbl = el("div", "tbl-wrap");
  const table = el("table");
  table.innerHTML = `<thead><tr>
    <th>科目</th><th>年度预算</th><th>已用${scope.global ? "" : "（本部门）"}</th><th>冻结</th><th>可用</th><th style="width:110px">执行率</th><th>AI 预测</th><th></th>
  </tr></thead>`;
  const tbody = el("tbody");

  /* 范围过滤后的科目集合 */
  const scopeCatIds = new Set(docs.map((d) => d.catId));
  BM.CATEGORIES.forEach((c) => {
    if (!scope.global && !scopeCatIds.has(c.id)) return;
    const budget = BM.getCatBudget(c.id);
    const used = scope.global ? c.used : docs.filter((d) => d.catId === c.id).reduce((a, d) => a + d.amount, 0);
    const frozen = scope.global ? c.frozen : 0;
    const remain = budget - used - frozen;
    const rate = budget ? Math.round((used / budget) * 1000) / 10 : 0;
    const rateCls = rate >= 100 ? "danger" : rate >= 80 ? "warn" : "ok";
    const f = c.forecast;
    const fBadge = f.status === "danger" ? "badge-danger" : f.status === "warn" ? "badge-warn" : "badge-ok";
    const tr = el("tr");
    tr.innerHTML = `<td><b>${esc(c.name)}</b></td>
      <td class="tbl-num">${BM.money(budget)}</td>
      <td class="tbl-num">${BM.money(used)}</td>
      <td class="tbl-num">${BM.money(frozen)}</td>
      <td class="tbl-num" style="${remain < 0 ? "color:var(--c-danger);font-weight:600" : ""}">${BM.money(remain)}</td>
      <td><div style="display:flex;align-items:center;gap:8px"><div class="progress" style="flex:1"><div class="progress-fill ${rateCls}" style="width:${Math.min(rate, 100)}%"></div></div><span class="pct">${rate}%</span></div></td>
      <td><span class="badge ${fBadge}">${esc(f.label)}</span></td>
      <td><button class="btn btn-outline btn-sm dash-detail" data-cat="${c.id}">明细 ›</button></td>`;
    tr.querySelector(".dash-detail").addEventListener("click", () => {
      BM.showView("details");
      BM.filterDetails({ catId: c.id });
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tbl.appendChild(table);
  page.appendChild(tbl);

  /* ---- 预测曲线（仅全局显示；部门 TOP 已挪到"部门视角"） ---- */
  if (scope.global) {
    page.appendChild(el("div", "section-title", "预测曲线（IT 设备 · 已用 + 预测）"));
    page.appendChild(renderForecastChart());
  }
}

/* 预测曲线：1-9 已用柱 + 10-12 预测虚线柱 */
function renderForecastChart() {
  const wrap = el("div", "chart-wrap");
  const it = BM.CATEGORIES.find((c) => c.id === "it");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 520 200");
  svg.style.width = "100%";
  svg.style.display = "block";

  const W = 520, H = 190, left = 40, right = 10, top = 12, bottom = 26;
  const chartW = W - left - right;
  const maxV = it.budget * 1.25;
  const barW = chartW / 12 - 10;
  const months = [];
  for (let m = 1; m <= 12; m++) months.push(m);

  const values = [...it.monthly, 0, 0, 0];
  values[9] = it.monthly[8] * 1.06;
  values[10] = it.monthly[8] * 1.12;
  values[11] = it.monthly[8] * 1.18;

  months.forEach((m, i) => {
    const v = values[i] || 0;
    const h = (v / maxV) * (H - top - bottom);
    const x = left + (chartW / 12) * (m - 1) + 5;
    const y = H - bottom - h;
    const isPred = m > 9;
    const color = isPred ? "#c9a44a" : m === 8 || m === 9 ? "#d64545" : "#185fa5";
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", barW);
    rect.setAttribute("height", h);
    rect.setAttribute("rx", 3);
    rect.setAttribute("fill", color);
    if (isPred) rect.setAttribute("stroke-dasharray", "4 3");
    svg.appendChild(rect);
    const tx = document.createElementNS("http://www.w3.org/2000/svg", "text");
    tx.setAttribute("x", x + barW / 2);
    tx.setAttribute("y", H - 8);
    tx.setAttribute("text-anchor", "middle");
    tx.setAttribute("font-size", "11");
    tx.setAttribute("fill", "#9098ab");
    tx.textContent = m + "月";
    svg.appendChild(tx);
  });

  const lineY = H - bottom - (it.budget / maxV) * (H - top - bottom);
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", left);
  line.setAttribute("y1", lineY);
  line.setAttribute("x2", W - right);
  line.setAttribute("y2", lineY);
  line.setAttribute("stroke", "#d64545");
  line.setAttribute("stroke-width", "1.2");
  line.setAttribute("stroke-dasharray", "5 4");
  svg.appendChild(line);
  const lt = document.createElementNS("http://www.w3.org/2000/svg", "text");
  lt.setAttribute("x", W - right - 4);
  lt.setAttribute("y", lineY - 6);
  lt.setAttribute("text-anchor", "end");
  lt.setAttribute("font-size", "11");
  lt.setAttribute("fill", "#d64545");
  lt.textContent = "预算线 80 万";
  svg.appendChild(lt);

  wrap.appendChild(svg);
  wrap.appendChild(
    el("div", "chart-legend",
      `<span><span class="legend-dot" style="background:#185fa5"></span>1-9 月已用</span>
       <span><span class="legend-dot" style="background:#c9a44a"></span>10-12 月预测（虚线）</span>
       <span><span class="legend-dot" style="background:#d64545"></span>集中采购月</span>`)
  );
  return wrap;
}

/* ---- 组织树视角（v0.6：客户真实四级结构 公司→事业部→生产单元→部门） ---- */
function companyAdminBudget(code) {
  /* 以对标 5 个归口科目之和作为该公司费用预算代理（脱敏 mock） */
  let sum = 0;
  Object.keys(BM.BENCHMARK).forEach((cat) => {
    const m = BM.BENCHMARK[cat];
    if (m[code]) sum += m[code];
  });
  return sum;
}

function renderOrgBody(page, scope) {
  const scopeVal = BM.state.orgScope || "2010";

  /* 组织切换器：单公司 ↔ 集团 */
  const sw = el("div", "filter-bar");
  sw.style.marginBottom = "12px";
  const sel = el("select");
  const opts = ['<option value="all"' + (scopeVal === "all" ? " selected" : "") + '>集团视角（全部公司）</option>']
    .concat(BM.COMPANIES.map((c) => `<option value="${c.code}"${c.code === scopeVal ? " selected" : ""}>${esc(c.name)}</option>`));
  sel.innerHTML = opts.join("");
  sel.addEventListener("change", () => {
    BM.state.orgScope = sel.value;
    BM.saveState();
    renderDashboard(_dashBox);
  });
  sw.appendChild(el("span", "hint-text", "组织范围："));
  sw.appendChild(sel);
  sw.appendChild(el("span", "hint-text", "公司 → 事业部 → 生产单元 → 部门（四级）"));
  page.appendChild(sw);

  const companies = scopeVal === "all" ? BM.COMPANIES : BM.COMPANIES.filter((c) => c.code === scopeVal);

  companies.forEach((comp) => {
    const leaves = BM.ORG_TREE.filter((o) => o.company === comp.code);
    const compBudget = companyAdminBudget(comp.code);
    const perLeaf = leaves.length ? Math.round(compBudget / leaves.length) : 0;
    page.appendChild(
      el("div", "section-title",
        `${esc(comp.name)}（${comp.code}） · 费用预算合计 ${BM.money(compBudget)} · ${leaves.length} 个末级部门`)
    );

    /* 分组：事业部 → 生产单元 → 部门 */
    const bus = {};
    leaves.forEach((l) => {
      if (!bus[l.bu]) bus[l.bu] = {};
      if (!bus[l.bu][l.unit]) bus[l.bu][l.unit] = [];
      bus[l.bu][l.unit].push(l.dept);
    });

    const tree = el("div", "org-tree");
    Object.keys(bus).forEach((buId) => {
      const bu = BM.BUSINESS_UNITS.find((b) => b.id === buId) || { name: buId, unit: "" };
      const buNode = el("div", "org-node bu");
      buNode.innerHTML = `<div class="org-name">${esc(bu.name)} <span class="org-tag">事业部</span></div>`;
      Object.keys(bus[buId]).forEach((unit) => {
        const unitNode = el("div", "org-node unit");
        unitNode.innerHTML = `<div class="org-name">${esc(unit)} <span class="org-tag">生产单元</span></div>`;
        const deptList = el("div", "org-depts");
        bus[buId][unit].forEach((dCode) => {
          const d = BM.LEVEL1_DEPTS.find((x) => x.code === dCode) || { name: dCode };
          const dNode = el("div", "org-node dept");
          dNode.innerHTML = `<div class="org-name">${esc(d.name)} <span class="org-tag">部门</span></div>
            <div class="org-budget">${BM.money(perLeaf)}</div>`;
          deptList.appendChild(dNode);
        });
        unitNode.appendChild(deptList);
        buNode.appendChild(unitNode);
      });
      tree.appendChild(buNode);
    });
    page.appendChild(tree);
  });

  page.appendChild(
    el("div", "plan-statusbar",
      `<span class="badge badge-info">v0.6 新增</span>
       <span class="hint-text">客户真实组织字典（典型子集，金额脱敏）；末级部门预算按公司行政总盘均摊展示，正式实施接入后按真实归口口径聚合。</span>`)
  );
}

/* ---- 事业部维度（CEO 视角，映射文档 §4.1.2） ---- */
/* TODO（V2 §8-17 / 设计稿 §8.2-3）：真实「事业部 ↔ 法人公司归属清单」待客户确认，
 * 当前 BM.BUSINESS_DIVISIONS 为占位样例；聚合金额基于 BM.BENCHMARK 同科目预算求和（mock）。 */
function divBudget(d) {
  let sum = 0;
  Object.keys(BM.BENCHMARK).forEach((cat) => {
    const row = BM.BENCHMARK[cat];
    (d.companies || []).forEach((c) => { if (row[c]) sum += row[c]; });
  });
  return sum;
}
function renderBizDivBody(page, scope) {
  const divisions = BM.BUSINESS_DIVISIONS || [];
  const note = el("div", "plan-statusbar");
  note.innerHTML = `<span class="hint-text">⚠️ 占位样例：真实「事业部 ↔ 法人公司归属清单」待客户确认（V2 §8-17）；聚合金额基于 BM.BENCHMARK 同科目预算求和（mock）。</span>`;
  page.appendChild(note);

  const grandTotal = divisions.reduce((s, d) => s + divBudget(d), 0);
  const kpi = el("div", "kpi-grid");
  kpi.appendChild(el("div", "kpi accent", `<div class="kpi-label">事业部数</div><div class="kpi-value">${divisions.length}</div><div class="kpi-sub">占位样例</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">归属法人公司</div><div class="kpi-value">${divisions.reduce((s, d) => s + (d.companies || []).length, 0)}</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">预算合计（mock 同科目求和）</div><div class="kpi-value">${BM.money(grandTotal)}</div>`));
  page.appendChild(kpi);

  page.appendChild(el("div", "section-title", "按事业部聚合（占位样例 · TODO V2 §8-17）"));
  const tbl = el("div", "tbl-wrap");
  const table = el("table");
  table.innerHTML = `<thead><tr><th>事业部</th><th>归属法人公司</th><th style="text-align:right">预算合计（mock）</th><th>说明</th></tr></thead>`;
  const tbody = el("tbody");
  divisions.forEach((d) => {
    const tr = el("tr");
    tr.innerHTML = `<td><b>${esc(d.name)}</b></td>
      <td class="hint-text">${(d.companies || []).join("、")}</td>
      <td class="tbl-num" style="text-align:right"><b>${BM.money(divBudget(d))}</b></td>
      <td class="hint-text">占位样例数据</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tbl.appendChild(table);
  page.appendChild(tbl);
}

/* ---- 职能中心维度（归口责任人跨公司看归口科目，映射文档 §4.1.3） ---- */
/* TODO（V2 §8-15 / 设计稿 §8.2-1）：11 职能中心完整清单与「中心×科目归口矩阵」待确认；
 * 当前 BM.FUNCTIONAL_CENTERS 为占位样例；金额基于 BM.RULES.lastYear 求和（mock）。
 * 归口责任人（centerOwner）仅看本人归口中心；集团层可看全部中心。 */
function centerBudget(c) {
  return (c.subjects || []).reduce((s, cat) => {
    const r = BM.RULES.find((x) => x.cat === cat);
    return s + (r && r.lastYear ? r.lastYear : 0);
  }, 0);
}
function renderCenterBody(page, scope) {
  const sd = BM.scopedData ? BM.scopedData() : { level: "group" };
  let centers = BM.FUNCTIONAL_CENTERS || [];
  if (sd.level === "center" && sd.center) centers = [sd.center];
  const note = el("div", "plan-statusbar");
  note.innerHTML = `<span class="hint-text">⚠️ 占位样例：11 职能中心清单与「中心×科目归口矩阵」待确认（V2 §8-15）；金额基于 BM.RULES.lastYear 求和（mock）。${sd.level === "center" ? "归口责任人仅展示本人归口中心。" : ""}</span>`;
  page.appendChild(note);

  const grandTotal = centers.reduce((s, c) => s + centerBudget(c), 0);
  const kpi = el("div", "kpi-grid");
  kpi.appendChild(el("div", "kpi accent", `<div class="kpi-label">职能中心数</div><div class="kpi-value">${centers.length}</div><div class="kpi-sub">占位样例</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">归口科目数</div><div class="kpi-value">${centers.reduce((s, c) => s + (c.subjects || []).length, 0)}</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">归口预算合计（mock）</div><div class="kpi-value">${BM.money(grandTotal)}</div>`));
  page.appendChild(kpi);

  page.appendChild(el("div", "section-title", "按职能中心聚合（跨公司 · 占位样例 · TODO V2 §8-15）"));
  const tbl = el("div", "tbl-wrap");
  const table = el("table");
  table.innerHTML = `<thead><tr><th>职能中心</th><th>牵头部门</th><th>归口科目</th><th style="text-align:right">归口预算（mock）</th></tr></thead>`;
  const tbody = el("tbody");
  centers.forEach((c) => {
    const tr = el("tr");
    tr.innerHTML = `<td><b>${esc(c.name)}</b></td>
      <td class="hint-text">${esc(c.owner || "—")}</td>
      <td class="hint-text">${(c.subjects && c.subjects.length) ? c.subjects.join("、") : "（待确认）"}</td>
      <td class="tbl-num" style="text-align:right"><b>${BM.money(centerBudget(c))}</b></td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tbl.appendChild(table);
  page.appendChild(tbl);
}

window.BM.renderDashboard = renderDashboard;
window.BM = BM;
