/* ================================================================
 * views/plan-topdown.js — 自上而下分解（子视图）
 * 迁移自 views/plan.js（原 1120 行上帝文件，2026-09-04 拆分）
 * 依赖：data/*、core/*（先于本文件加载）；plan 系列第一个加载
 * 挂载 BM.plan.renderTopdown / BM.plan.renderDecomposeView / BM.plan.checkDecomposeTotal，
 *   共享可变态 BM.plan.decomposeInputs（原闭包 let decomposeInputs）
 * 说明：renderPlan 经 BM.plan.xxx 引用本文件子渲染；其余函数（getDecomposeScope/readDecomposeInputs/
 *   calcDecomposeTotal 等）为 IIFE 私有。
 * ================================================================ */

(function () {
var BM = window.BM || {};
BM.plan = BM.plan || {};

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
BM.plan.decomposeInputs = {};
function readDecomposeInputs() {
  const scope = getDecomposeScope();
  const detail = {};
  scope.projects.forEach((p) => {
    const mats = BM.MATERIALS.filter((m) => m.projectId === p.id);
    mats.forEach((m) => {
      const key = p.id + ":" + m.id;
      const v = BM.plan.decomposeInputs[key];
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
      const cur = BM.plan.decomposeInputs[key] !== undefined ? BM.plan.decomposeInputs[key] : (m.budget || 0);
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
        BM.plan.decomposeInputs[inp.dataset.key] = parseInt(inp.value, 10) || 0;
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

BM.plan.renderTopdown = renderTopdown;
BM.plan.renderDecomposeView = renderDecomposeView;
BM.plan.checkDecomposeTotal = checkDecomposeTotal;

window.BM = BM;
})();
