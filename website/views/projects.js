/* ================================================================
 * projects.js — 采购项目列表（v0.3）
 * 按角色数据范围：员工=我负责 / 经理=本部门 / 全局=全部
 * 每个项目卡片展示预算约束（额度/已用/冻结/剩余/执行率）
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

/* 角色说明条（供所有页面复用） */
BM.renderRoleHint = function (container, viewKey) {
  const hints = (BM.ROLE_HINTS[viewKey] || {})[BM.state.role];
  if (!hints) return;
  const bar = el("div", "role-hint-bar");
  bar.innerHTML = `<span class="rhb-ico">▍</span>${esc(hints)}`;
  container.appendChild(bar);
};

function renderProjects(container) {
  container.innerHTML = "";
  const page = el("div", "page");
  const role = BM.state.role;

  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">采购项目</div>
      <div class="page-desc">预算的颗粒度到项目 · 每个项目带独立预算约束</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "projects");

  renderProjBody(page, role);

  container.appendChild(page);
}

/* 项目视图主体（可嵌入预算总览双视图） */
BM.renderProjView = function (container, role) {
  container.innerHTML = "";
  renderProjBody(container, role || BM.state.role);
};

function renderProjBody(container, role) {
  const projects = BM.scopedProjects();
  if (!projects.length) {
    container.appendChild(el("div", "empty", `<div class="empty-ico">🗂</div>当前范围暂无采购项目`));
    return;
  }

  /* 统计 */
  const totalBudget = projects.reduce((a, p) => a + p.budget, 0);
  const totalUsed = projects.reduce((a, p) => a + p.used, 0);
  const totalRemain = projects.reduce((a, p) => a + p.remain, 0);
  const kpi = el("div", "kpi-grid");
  kpi.appendChild(el("div", "kpi accent", `<div class="kpi-label">项目预算总额</div><div class="kpi-value">${BM.money(totalBudget)}</div><div class="kpi-sub">${projects.length} 个项目</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">已用</div><div class="kpi-value">${BM.money(totalUsed)}</div><div class="kpi-sub">${projects.length} 个项目已用</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">剩余可支配</div><div class="kpi-value">${BM.money(totalRemain)}</div><div class="kpi-sub">含冻结项目</div>`));
  container.appendChild(kpi);

  /* 项目卡片 */
  container.appendChild(el("div", "section-title", role === "staff" ? "我负责的项目" : "项目列表"));
  const grid = el("div", "proj-grid");
  projects.forEach((p) => {
    grid.appendChild(renderProjectCard(p, role));
  });
  container.appendChild(grid);
}

function renderProjectCard(p, role) {
  const info = BM.projectInfo(p);
  const rateCls = p.execRate >= 100 ? "danger" : p.execRate >= 80 ? "warn" : "ok";
  const statusCls = p.status === "审批中" ? "badge-warn" : p.status === "已结项" ? "badge-gray" : "badge-info";
  const card = el("div", "proj-card" + (p.remain < 0 ? " over" : ""));
  card.innerHTML = `<div class="pc-head">
      <div class="pc-title">${esc(p.name)}</div>
      <span class="badge ${statusCls}">${esc(p.status)}</span>
    </div>
    <div class="pc-meta">
      <span>${esc(info.deptName)} · ${esc(info.catName)}</span>
      <span>负责人：${esc(p.owner)}</span>
    </div>
    <div class="pc-budget">
      <div class="pc-nums">
        <span class="pc-label">额度 <b>${BM.money(p.budget)}</b></span>
        <span class="pc-label">已用 <b style="color:var(--c-info)">${BM.money(p.used)}</b></span>
        <span class="pc-label">冻结 <b>${BM.money(p.frozen)}</b></span>
        <span class="pc-label" style="color:${p.remain < 0 ? "var(--c-danger)" : "var(--c-ok)"}">剩余 <b>${BM.money(p.remain)}</b></span>
      </div>
      <div class="pc-bar-row">
        <div class="progress" style="flex:1"><div class="progress-fill ${rateCls}" style="width:${Math.min(p.execRate, 100)}%"></div></div>
        <span class="pct">${p.execRate}%</span>
      </div>
      <div class="pc-desc">${esc(p.desc)}</div>
    </div>`;

  /* 行动按钮（按角色） */
  const actions = el("div", "pc-actions");
  if (role === "staff" && p.owner === "张伟") {
    const btn = el("button", "btn btn-primary btn-sm", "发起采购申请");
    btn.addEventListener("click", () => {
      const amount = 30000;
      const r = BM.requestPurchaseForProject(p.id, { title: p.name + " · 追加采购", amount });
      /* v0.5：预算规则影响拦截 */
      const blocked = !r.ok && BM.state.rules.allowOverBudget === false;
      if (blocked) {
        BM.toast("⛔ 预算规则：不允许超预算，已拦截并建议走追加预算流程");
        BM.openView("adjust");
      } else {
        BM.toast(r.ok ? "✅ 采购申请已生成，进入审批流" : "预算不足，AI 已标记需调整");
      }
      BM.renderProjects(document.getElementById("viewPanel"));
    });
    actions.appendChild(btn);
  }
  if (role === "finance") {
    const btn = el("button", "btn btn-outline btn-sm", "预算调整");
    btn.addEventListener("click", () => {
      BM.openView("adjust");
    });
    actions.appendChild(btn);
  }
  if (actions.children.length) card.appendChild(actions);

  return card;
}

window.BM.renderProjects = renderProjects;
window.BM = BM;
