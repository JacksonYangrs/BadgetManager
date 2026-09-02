/* ================================================================
 * kanban.js — 预算跟踪（2026-08-24 重构：三层时间 + 角色范围 + 双维度嵌套）
 *  - 三层时间粒度：年 / 季 / 月（面包屑下钻）
 *  - 角色 × 组织范围：事业部经理看自己事业部+下属；管理中心看自己中心+下属；总经理/财务看全部
 *  - 节点内嵌双维度：进入组织节点后，按「经济事项 / 财务科目」切换（同一份数据两种切法）
 *  - 展示：当期切片（预算 / 执行 / 偏差 / 预警），活泼卡片化
 * 数据源：优先后端 /api/events + /api/orgs/tree，离线回退本地 mock
 * ================================================================ */
var BM = window.BM || {};


/* 看板真实数据：按当前组织范围拉 unit_budget 汇总（替代原 mock CATEGORIES） */
function kanbanItemSource() {
  return []; /* 占位：实际数据在 renderGrid 内异步经 BM.loadKanbanData 拉取 */
}

BM.renderKanban = function (container) {
  container.innerHTML = "";
  if (typeof BM.initEventsApi === "function") BM.initEventsApi();

  const page = el("div", "page");
  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">预算跟踪</div>
      <div class="page-desc">三层时间（年 › 季 › 月）· 按角色看组织范围 · 经济事项 / 财务双维度嵌套</div>`)
  );
  /* 右上角：费控导入入口（弹出二级子页面，非左侧菜单） */
  const headRight = el("div", "page-head-right");
  const importBtn = el("button", "btn btn-primary", "费控导入");
  importBtn.addEventListener("click", () => BM.openImportModal && BM.openImportModal());
  headRight.appendChild(importBtn);
  head.appendChild(headRight);
  page.appendChild(head);
  BM.renderRoleHint(page, "kanban");

  const role = BM.state.role;
  /* 受限角色（事业部/中心/公司/部门负责人）：初始定位到自己组织，不能看全部 */
  const myOrg = BM.RESTRICTED_ROLES.has(role) ? BM.userOrgCode() : null;

  /* 状态：当前时间层 + 当前组织层 + 当前维度 */
  const state = {
    period: { type: "year" },
    rootCode: null,          /* 组织下钻路径栈用 breadcrumb */
    orgPath: myOrg ? [{ code: myOrg, name: (BM.state.user && BM.state.user.org && BM.state.user.org.name) || myOrg }] : [],
    dim: "event",            /* event / account */
  };

  const crumb = el("div", "kb-crumb");
  const scopeBar = el("div", "kb-scope");
  const dimBar = el("div", "kb-dim");
  const grid = el("div", "kb-grid");
  const box = el("div", "kb-box");
  box.appendChild(crumb);
  box.appendChild(scopeBar);
  box.appendChild(dimBar);
  box.appendChild(grid);
  page.appendChild(box);

  /* 角色范围描述 */
  const scopeText = myOrg ? `当前视角：仅看 ${BM.state.user && BM.state.user.org ? BM.state.user.org.name : myOrg} 及其下属（${role}）` : "当前视角：全部（总经理 / 财务 / 管理员）";
  scopeBar.appendChild(el("div", "kb-scope-text", scopeText));

  /* 维度切换（节点内嵌双维度） */
  const dimModes = [["event", "按经济事项"], ["account", "按财务科目"]];
  const dimBtns = {};
  dimModes.forEach((m) => {
    const b = el("button", "btn btn-sm btn-outline" + (m[0] === state.dim ? " active" : ""), m[1]);
    b.addEventListener("click", () => { state.dim = m[0]; render(); });
    dimBar.appendChild(b);
    dimBtns[m[0]] = b;
  });

  function periodLabel(p) {
    if (p.type === "year") return "2026 全年";
    if (p.type === "quarter") return "Q" + p.q;
    return p.m + " 月";
  }
  function renderCrumb() {
    crumb.innerHTML = "";
    const parts = [{ type: "year", label: "2026 全年" }];
    if (state.period.type === "quarter") parts.push({ type: "quarter", q: state.period.q, label: "Q" + state.period.q });
    if (state.period.type === "month") { parts.push({ type: "quarter", q: Math.ceil(state.period.m / 3), label: "Q" + Math.ceil(state.period.m / 3) }); parts.push({ type: "month", m: state.period.m, label: state.period.m + " 月" }); }
    parts.forEach((p, i) => {
      const seg = el("span", "kb-crumb-seg" + (i === parts.length - 1 ? " cur" : ""), p.label);
      if (i < parts.length - 1) seg.addEventListener("click", () => { state.period = { type: p.type, q: p.q, m: p.m }; render(); });
      crumb.appendChild(seg);
      if (i < parts.length - 1) crumb.appendChild(el("span", "kb-crumb-sep", "›"));
    });
    /* 时间下钻快捷入口：年层补 Q1-Q4，季层补 3 个月，方便三层切换 */
    if (state.period.type === "year") {
      [1, 2, 3, 4].forEach((q) => {
        const seg = el("span", "kb-crumb-seg kb-crumb-jump", "Q" + q);
        seg.addEventListener("click", () => { state.period = { type: "quarter", q: q }; render(); });
        crumb.appendChild(seg);
      });
    } else if (state.period.type === "quarter") {
      const base = (state.period.q - 1) * 3;
      [1, 2, 3].forEach((off) => {
        const m = base + off;
        const seg = el("span", "kb-crumb-seg kb-crumb-jump", m + " 月");
        seg.addEventListener("click", () => { state.period = { type: "month", q: state.period.q, m: m }; render(); });
        crumb.appendChild(seg);
      });
    }
    /* 组织面包屑（若已下钻） */
    if (state.orgPath.length) {
      crumb.appendChild(el("span", "kb-crumb-sep", "|"));
      const all = el("span", "kb-crumb-seg", "组织根");
      all.addEventListener("click", () => { state.orgPath = []; render(); });
      crumb.appendChild(all);
      state.orgPath.forEach((n, i) => {
        crumb.appendChild(el("span", "kb-crumb-sep", "›"));
        const seg = el("span", "kb-crumb-seg" + (i === state.orgPath.length - 1 ? " cur" : ""), n.name);
        if (i < state.orgPath.length - 1) seg.addEventListener("click", () => { state.orgPath = state.orgPath.slice(0, i + 1); render(); });
        crumb.appendChild(seg);
      });
    }
  }

  function renderGrid() {
    grid.innerHTML = "";
    Object.keys(dimBtns).forEach((k) => dimBtns[k].classList.toggle("active", k === state.dim));

    /* 组织视角：先列组织子节点（可下钻），再列当前维度聚合卡 */
    const tree = BM.orgTreeCache || [];
    let children;
    if (state.orgPath.length) {
      children = BM.orgChildren(state.orgPath[state.orgPath.length - 1].code, tree);
      /* 进入某节点后，仅展示其下的"聚合节点"（事业部/管理中心/部门），公司级单位不单独成卡 */
      children = children.filter((n) => n.type === "center" || n.type === "dept" || (n.code && /^(BU|MC)-/.test(n.code)));
    } else {
      /* 根层：展示 HQ 下的事业部和中心（聚合维度），单位公司通过 buCode 被聚合 */
      const rootKids = (tree[0] && tree[0].children) ? tree[0].children : tree;
      children = rootKids.filter((n) => n.type === "center" || (n.code && /^BU-/.test(n.code)));
    }

    /* 角色范围：受限角色（事业部/中心负责人）已通过初始 orgPath 定位到自己子树，
     * 不需要额外过滤；非受限角色（总经理/财务/管理员）看全部。 */
    const visibleChildren = children;

    /* 组织节点卡（可下钻） */
    visibleChildren.forEach((node) => {
      const card = el("div", "kb-card kb-org-card");
      const isCenter = node.type === "center";
      const typed = isCenter ? "管理中心" : (node.type === "unit" ? "事业部" : node.type === "dept" ? "单位" : "组织");
      card.innerHTML = `<div class="kb-card-head"><span class="kb-org-type ${isCenter ? "center" : "bu"}">${typed}</span><b>${esc(node.name)}</b></div>
        <div class="kb-card-sub">${esc(node.code)}</div>`;
      const drill = el("button", "btn btn-ghost btn-sm kb-drill", "进入 ›");
      drill.addEventListener("click", () => { state.orgPath = state.orgPath.concat([{ code: node.code, name: node.name }]); render(); });
      card.appendChild(drill);
      grid.appendChild(card);
    });

    /* 当前维度聚合卡（经济事项 / 财务科目）：异步拉真实 unit_budget 汇总 */
    const curRoot = state.orgPath.length ? state.orgPath[state.orgPath.length - 1].code : null;
    const companyCodes = BM.orgCompanyCodes(curRoot, tree);
    const aggBox = el("div", "kb-agg-box");
    if (!companyCodes.length && !visibleChildren.length) {
      grid.appendChild(el("div", "empty", "当前范围无数据"));
      return;
    }
    if (companyCodes.length) {
      aggBox.appendChild(el("div", "kb-loading", "加载真实预算/执行数据…"));
      grid.appendChild(aggBox);
      BM.loadKanbanData(companyCodes, state.period).then((items) => {
        /* 若期间/维度已切换，放弃过期结果 */
        if (grid.querySelector(".kb-agg-box") !== aggBox) return;
        aggBox.innerHTML = "";
        const groups = BM.kanbanAgg(items, state.period, state.dim);
        if (!groups.length) { aggBox.appendChild(el("div", "empty", "当前范围无预算数据")); return; }
        groups.forEach((g) => {
          const ratePct = Math.min(100, g.rate);
          const warnCls = g.warn === "danger" ? "danger" : g.warn === "warn" ? "warn" : "ok";
          const card = el("div", "kb-card");
          card.innerHTML = `
            <div class="kb-card-head"><b>${esc(g.key)}</b>${g.devPct !== 0 ? `<span class="kb-badge ${warnCls}">${g.devPct > 0 ? "超支" : "节支"} ${Math.abs(g.devPct)}%</span>` : ""}</div>
            <div class="kb-card-nums">
              <div class="kb-num"><span class="kb-num-k">预算</span><span class="kb-num-v">${BM.money(g.budget)}</span></div>
              <div class="kb-num"><span class="kb-num-k">执行</span><span class="kb-num-v ${g.warn === "danger" ? "over" : ""}">${BM.money(g.exec)}</span></div>
            </div>
            <div class="kb-bar"><div class="kb-bar-fill ${warnCls}" style="width:${ratePct}%"></div></div>
            <div class="kb-card-foot"><span class="kb-rate ${warnCls}">执行率 ${g.rate}%</span>${g.estimated ? `<span class="kb-est">推算执行</span>` : ""}${g.warn !== "ok" ? `<span class="kb-warn-ico ${warnCls}">${g.warn === "danger" ? "⚠ 超支预警" : "⚡ 临界"}</span>` : ""}</div>`;
          aggBox.appendChild(card);
        });
      }).catch(() => { aggBox.innerHTML = ""; aggBox.appendChild(el("div", "empty", "数据加载失败")); });
    }
  }

  function render() {
    renderCrumb();
    renderGrid();
  }

  /* 组织树异步加载后重渲染 */
  if (typeof BM.loadOrgTree === "function") {
    BM.loadOrgTree().then(() => render());
  } else {
    render();
  }

  container.appendChild(page);
};

window.BM = BM;
