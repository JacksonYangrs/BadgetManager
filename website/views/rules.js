/* ================================================================
 * rules.js — 预算规划（财务/管理员，D4 版本化，三 Tab 重构 2026-08-25；预算规则为预算规划核心内容）
 *  - Tab1 当前版本：baseline 卡片（单选 → 解释区）+ 财务流程规则子区 + 调整发布
 *  - Tab2 历史版本：列表 + 恢复为当前版本（发布/回滚）+ 删除（active 守卫）
 *  - Tab3 适用经济事项：左规则卡 + 右科目多选 + 整版本映射持久化
 *  版本生成向导（克隆/AI 抽取/发布）复用既有实现
 * ================================================================ */

(function () {
var BM = window.BM || {};



/* 财务流程规则元数据（flow 类条目的可选值与中文标签） */
const FLOW_META = {
  planMode: { label: "编制方式", options: { topdown: "自上而下", bottomup: "自下而上" } },
  trackMode: { label: "执行追踪方式", options: { reimburse: "实际报销为准", advance: "申请单预跟踪" } },
  surplusAction: { label: "期末余量处理", options: { reclaim: "收回", suspend: "挂起", carry: "结转" } },
  allowOverBudget: { label: "超预算处理", options: { true: "允许超预算", false: "不允许超预算" } },
};
const SOURCE_LABEL = { meeting: "预算会议", "income-plan": "收入方案", "budget-file": "预算文件", manual: "手动调整", rollback: "回滚" };

/* 发布后把版本化 flow 项同步到业务全局 BM.state.rules（修复隐藏双轨不同步：
 * 报销/采购拦截、编制方式等业务逻辑读的是 BM.state.rules，发布新版本必须回写才真正生效） */
BM.syncStateRules = function (version) {
  const flow = flowItems(version || null);
  if (!flow.length) return;
  BM.state.rules = BM.state.rules || {};
  flow.forEach((it) => {
    if (it.scopeKey === "allowOverBudget") BM.state.rules.allowOverBudget = (String(it.value) === "true");
    else BM.state.rules[it.scopeKey] = it.value;
  });
};

BM.authHeaders = BM.authHeaders || function () {
  return BM.state.token ? { Authorization: "Bearer " + BM.state.token, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

BM.loadRuleVersions = function () {
  return BM.apiGet("/api/rule-versions");
};

BM.loadSubjects = function () {
  return BM.apiGet("/api/subjects");
};

BM.loadSubjectTree = function () {
  return BM.apiGet("/api/subjects?tree=1");
};

BM.renderRules = function (container) {
  container.innerHTML = "";
  const page = el("div", "page");
  const role = BM.state.role;

  const head = el("div", "page-head");
  head.appendChild(el("div", "", `<div class="page-title">预算规划</div>
    <div class="page-desc">预算规则是预算规划的核心内容 · 规则独立版本化管理 · 基线因子即对明年的预测 · 规则变更形成新版本并发布后全系统生效</div>`));
  page.appendChild(head);
  BM.renderRoleHint(page, "rules");

  if (["cooAnalyst", "centerOwner", "companyBudgeter", "admin"].indexOf(role) < 0) {
    page.appendChild(el("div", "empty", `<div class="empty-ico">🔒</div>仅总经办预算管理员 / 归口责任人 / 公司预算管理员 / 系统管理员可管理预算规划`));
    container.appendChild(page);
    return;
  }

  /* ---- Tab 导航 ---- */
  const tabs = el("div", "rules-tabs");
  const tabDefs = [
    { id: "current", label: "当前版本" },
    { id: "history", label: "历史版本" },
    { id: "events", label: "适用经济事项" },
    { id: "createNext", label: "创建新规划" },
  ];
  tabDefs.forEach((t, i) => {
    const b = el("button", "rtab-btn" + (i === 0 ? " active" : ""), t.label);
    b.dataset.tab = t.id;
    b.addEventListener("click", () => switchTab(page, t.id));
    tabs.appendChild(b);
  });
  page.appendChild(tabs);

  /* ---- 四个 Tab 内容区 ---- */
  const panes = el("div", "rules-panes");
  const pCurrent = el("div", "rtab-pane", ""); pCurrent.dataset.pane = "current";
  const pHistory = el("div", "rtab-pane hidden", ""); pHistory.dataset.pane = "history";
  const pEvents = el("div", "rtab-pane hidden", ""); pEvents.dataset.pane = "events";
  const pCreateNext = el("div", "rtab-pane hidden", ""); pCreateNext.dataset.pane = "createNext";
  panes.appendChild(pCurrent); panes.appendChild(pHistory); panes.appendChild(pEvents); panes.appendChild(pCreateNext);
  page.appendChild(panes);
  container.appendChild(page);

  /* ---- 数据加载（版本 + 科目主数据 + 科目树） ---- */
  Promise.all([BM.loadRuleVersions(), BM.loadSubjects().catch(() => []), BM.loadSubjectTree().catch(() => [])])
    .then(([versions, subjects, subjectTree]) => {
      page._data = { versions, subjects, subjectTree };
      renderCurrentTab(page);
      renderHistoryTab(page);
      renderEventsTab(page);
      renderCreateNextTab(page);
    })
    .catch(() => {
      panes.querySelectorAll(".rtab-pane").forEach((p) => { p.innerHTML = '<div class="empty"><div class="empty-ico">⚠️</div>数据加载失败</div>'; });
    });
};

function switchTab(page, id) {
  page.querySelectorAll(".rtab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
  page.querySelectorAll(".rtab-pane").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== id));
}

function activeVersion(versions) { return versions.find((v) => v.status === "active"); }
function baselineItems(v) { return (v ? v.items : []).filter((i) => i.category === "baseline"); }
function flowItems(v) { return (v ? v.items : []).filter((i) => i.category === "flow"); }

/* ---------- Tab1 当前版本 ---------- */
function renderCurrentTab(page) {
  const pane = page.querySelector('[data-pane="current"]');
  const active = activeVersion(page._data.versions);
  if (!active) { pane.appendChild(el("div", "empty", "无生效版本")); return; }
  renderRuleCards(pane, active);
}

/* 规则卡片渲染（Tab1 当前版本 与 Tab4 草案预览 共用——实现"把 Tab1 内容已过来"） */
function renderRuleCards(pane, version) {
  pane.innerHTML = "";
  const card = el("div", "rule-version-card");
  card.appendChild(el("div", "rv-head", `<span class="rv-title">${esc(version.version)}</span>
    ${version.status === "active" ? '<span class="rv-badge rv-active">执行中</span>' : (version.status === "draft" ? '<span class="rv-badge rv-draft">草稿</span>' : "")}
    <span class="rv-meta">${esc(version.name || "")}</span>`));
  pane.appendChild(card);

  const bl = baselineItems(version);
  const flow = flowItems(version);
  const planMode = flow.find((i) => i.scopeKey === "planMode");
  const supervise = flow.filter((i) => ["trackMode", "surplusAction", "allowOverBudget"].includes(i.scopeKey));

  /* ---- 组1 编制规则 ---- */
  const g1 = el("div", "rule-group");
  g1.appendChild(el("div", "rule-group-title", "编制规则"));
  g1.appendChild(el("div", "wb-section-title", "规则卡片"));
  const cGrid = el("div", "scope-cards");
  bl.forEach((it, idx) => {
    const pct = it.factor != null ? Math.round(it.factor * 1000) / 10 : null;
    const c = el("div", "scope-card" + (idx === 0 ? " active" : ""));
    c.dataset.scope = it.scopeKey;
    const name = ruleNameFor(it.scopeKey).desc || it.scopeKey;
    c.innerHTML = `<div class="sc-k">${esc(name)}</div>
      <div class="sc-v">${pct != null ? pct : "—"}<span class="sc-unit">%</span></div>
      <div class="sc-l">${esc(it.baseLogic || "")}</div>`;
    c.addEventListener("click", () => {
      cGrid.querySelectorAll(".scope-card").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      renderScopeExplain(pane, it);
    });
    cGrid.appendChild(c);
  });
  g1.appendChild(cGrid);

  const explain = el("div", "scope-explain");
  explain.dataset.role = "explain";
  g1.appendChild(explain);
  if (bl[0]) renderScopeExplain(pane, bl[0]);

  if (planMode) {
    g1.appendChild(el("div", "wb-section-title", "编制方式"));
    const pmFlow = el("div", "rv-flow");
    pmFlow.appendChild(renderFlowItem(planMode));
    g1.appendChild(pmFlow);
  }
  pane.appendChild(g1);

  /* ---- 组2 监督规则 ---- */
  const g2 = el("div", "rule-group");
  g2.appendChild(el("div", "rule-group-title", "监督规则"));
  g2.appendChild(el("div", "wb-section-title", "执行追踪 / 期末余量 / 超预算处理"));
  const svFlow = el("div", "rv-flow");
  supervise.forEach((it) => svFlow.appendChild(renderFlowItem(it)));
  g2.appendChild(svFlow);
  pane.appendChild(g2);
}

function renderFlowItem(it) {
  const meta = FLOW_META[it.scopeKey] || { label: it.scopeKey, options: {} };
  const label = (meta.options && meta.options[String(it.value)]) || it.value;
  return el("div", "rv-flow-item", `<span class="rv-flow-k">${esc(meta.label)}</span>
    <span class="rv-flow-v">${esc(label)}</span>`);
}

function renderScopeExplain(pane, it) {
  const box = pane.querySelector('[data-role="explain"]');
  if (!box || !it) return;
  const staticMap = (BM.RULE_EVENT_MAP || []).find((m) => m.scopeKey === it.scopeKey) || {};
  const pct = it.factor != null ? Math.round(it.factor * 1000) / 10 : "—";
  box.innerHTML = `<div class="se-head">${esc(it.scopeKey)} · 规则解释</div>
    <div class="se-row"><span class="se-k">基线因子</span><span class="se-v">${pct}%</span></div>
    <div class="se-row"><span class="se-k">计算口径</span><span class="se-v">${esc(it.baseLogic || "")}</span></div>
    ${staticMap.policy ? `<div class="se-row"><span class="se-k">政策表述</span><span class="se-v">${esc(staticMap.policy)}</span></div>` : ""}
    ${staticMap.desc ? `<div class="se-row"><span class="se-k">说明</span><span class="se-v">${esc(staticMap.desc)}</span></div>` : ""}
    ${staticMap.typeLabel ? `<div class="se-row"><span class="se-k">类型</span><span class="se-v">${esc(staticMap.typeLabel)}</span></div>` : ""}`;
}

/* ---------- Tab2 历史版本 ---------- */
function renderHistoryTab(page) {
  const pane = page.querySelector('[data-pane="history"]');
  const versions = page._data.versions;
  pane.innerHTML = "";
  pane.appendChild(el("div", "wb-section-title", "版本历史（可恢复为当前版本 / 删除草稿与归档版本）"));
  const hist = el("div", "rv-history");
  versions.forEach((v) => hist.appendChild(renderHistoryRow(page, v)));
  pane.appendChild(hist);
}

function statusBadge(status) {
  if (status === "active") return `<span class="rv-badge rv-active">执行中</span>`;
  if (status === "draft") return `<span class="rv-badge rv-draft">草稿</span>`;
  return `<span class="rv-badge rv-archived">已归档</span>`;
}

function renderHistoryRow(page, v) {
  const row = el("div", "rv-hist-row");
  const srcLabel = SOURCE_LABEL[v.sourceType] || v.sourceType || "—";
  row.innerHTML = `<div class="rv-hist-main">
      <div class="rv-hist-top"><b>${esc(v.version)}</b> ${statusBadge(v.status)}
        <span class="rv-meta">来源：${esc(srcLabel)}</span>
        ${v.sourceRef ? `<span class="rv-meta">· ${esc(v.sourceRef)}</span>` : ""}</div>
      <div class="rv-hist-note">${esc(v.note || "")}</div>
      <div class="rv-hist-time">${esc(v.effectiveDate || v.createdAt || "")}</div>
    </div>
    <div class="rv-hist-ops"></div>`;
  const ops = row.querySelector(".rv-hist-ops");

  const viewBtn = el("button", "btn btn-ghost btn-sm", "查看");
  viewBtn.addEventListener("click", () => toggleVersionDetail(row, v));
  ops.appendChild(viewBtn);

  if (v.status === "active") {
    const del = el("button", "btn btn-ghost btn-sm", "删除");
    del.disabled = true;
    del.title = "生效版本不可删除";
    del.classList.add("disabled");
    ops.appendChild(del);
  } else {
    const restore = el("button", "btn btn-accent btn-sm", v.status === "draft" ? "发布并生效" : "恢复为当前版本");
    restore.addEventListener("click", () => {
      if (!confirm(`确认将 ${v.version} 恢复为当前生效版本？当前生效版本将被归档。`)) return;
      publishVersion(page, v.id, { sourceType: v.status === "draft" ? "manual" : "rollback", note: "恢复为当前版本" });
    });
    ops.appendChild(restore);

    const del = el("button", "btn btn-ghost btn-sm", "删除");
    del.addEventListener("click", () => {
      if (!confirm(`确认删除版本 ${v.version}？该操作不可恢复（草稿/归档版本可删，生效版本受保护）。`)) return;
      BM.apiSend(`/api/rule-versions/${v.id}`, "DELETE")
        .then(() => {
          BM.toast("已删除版本 " + v.version);
          BM.loadRuleVersions().then((vs) => { page._data.versions = vs; renderHistoryTab(page); renderCurrentTab(page); });
        })
        .catch((e) => BM.toast("删除失败：" + (e && e.error ? e.error : "未知错误")));
    });
    ops.appendChild(del);
  }
  return row;
}

function toggleVersionDetail(row, v) {
  const ex = row.querySelector(".rv-detail");
  if (ex) { ex.remove(); return; }
  const detail = el("div", "rv-detail");
  const baseline = baselineItems(v);
  const flow = flowItems(v);
  let html = `<div class="rv-detail-sub">控制基线</div><div class="rv-detail-grid">`;
  baseline.forEach((it) => {
    const pct = it.factor != null ? Math.round(it.factor * 1000) / 10 : "—";
    html += `<span class="rv-chip">${esc(it.scopeKey)} ${pct}%</span>`;
  });
  html += `</div><div class="rv-detail-sub">财务流程</div><div class="rv-detail-grid">`;
  flow.forEach((it) => {
    const meta = FLOW_META[it.scopeKey] || { label: it.scopeKey, options: {} };
    const label = (meta.options && meta.options[String(it.value)]) || it.value;
    html += `<span class="rv-chip">${esc(meta.label)}：${esc(label)}</span>`;
  });
  html += `</div>`;
  detail.innerHTML = html;
  row.appendChild(detail);
}

/* ---------- Tab3 适用经济事项 ---------- */
function ruleNameFor(scopeKey) {
  const m = (BM.RULE_EVENT_MAP || []).find((r) => r.scopeKey === scopeKey);
  return m ? { desc: m.desc, typeLabel: m.typeLabel || "", policy: m.policy || "" } : { desc: scopeKey, typeLabel: "", policy: "" };
}
function updateCounter(page, counterEl) {
  const pane = page.querySelector('[data-pane="events"]');
  if (!counterEl) return;
  if ((pane._evtMode || "card") === "event") {
    const subj = pane._currentSubject;
    let cnt = 0;
    if (subj != null) {
      Object.keys(pane._byScope || {}).forEach((k) => {
        if ((pane._byScope[k] || []).map(Number).indexOf(Number(subj)) >= 0) cnt++;
      });
    }
    counterEl.textContent = subj != null ? ("当前事项已绑定 " + cnt + " 张规则卡") : "请选择经济事项节点";
    return;
  }
  const scope = pane._currentScope;
  const ids = (pane._byScope && scope && pane._byScope[scope]) || [];
  counterEl.textContent = "当前规则卡已选 " + ids.length + " / " + page._data.subjects.length + " 科目";
}
function renderEventsTab(page) {
  const pane = page.querySelector('[data-pane="events"]');
  const { versions, subjects, subjectTree } = page._data;
  pane.innerHTML = "";
  const active = activeVersion(versions);
  if (!active) { pane.appendChild(el("div", "empty", "无生效版本")); return; }
  const targetId = page._data.eventsVersionId;
  const target = (targetId ? versions.find((v) => v.id === targetId) : null) || active;
  const bl = baselineItems(target);

  /* 头部卡片（与 Tab1 .rule-version-card 风格一致） */
  const card = el("div", "rule-version-card");
  card.appendChild(el("div", "rv-head", `<span class="rv-title">${esc(target.version)}</span> ${statusBadge(target.status)}
    <span class="rv-meta">适用经济事项 · 为规则卡勾选关联科目</span>`));
  pane.appendChild(card);

  /* 工具栏：版本切换 + 已选计数 + 保存 */
  const toolbar = el("div", "evt-toolbar");
  const verGroup = el("div", "evt-toolbar-group");
  verGroup.appendChild(el("span", "evt-toolbar-label", "编辑版本"));
  const sel = el("select", "evt-ver-sel");
  versions.forEach((v) => {
    const o = document.createElement("option");
    o.value = String(v.id);
    const st = v.status === "active" ? "（执行中）" : v.status === "draft" ? "（草案）" : "（已归档）";
    o.textContent = `${esc(v.version)} ${st}`;
    if (v.id === target.id) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener("change", () => { page._data.eventsVersionId = Number(sel.value); renderEventsTab(page); });
  verGroup.appendChild(sel);
  toolbar.appendChild(verGroup);

  /* RK1 绑定视角切换器：① 规则卡→事项 ② 事项→规则卡 */
  const modeGroup = el("div", "evt-toolbar-group");
  modeGroup.appendChild(el("span", "evt-toolbar-label", "绑定视角"));
  const modeBar = el("div", "evt-mode-sel");
  [["card", "规则卡 → 事项"], ["event", "事项 → 规则卡"]].forEach((m) => {
    const b = el("button", "evt-mode-btn" + ((pane._evtMode || "card") === m[0] ? " active" : ""), m[1]);
    b.dataset.mode = m[0];
    b.addEventListener("click", () => { pane._evtMode = m[0]; renderDualBody(page, pane, bl, subjectTree, toolbar); });
    modeBar.appendChild(b);
  });
  modeGroup.appendChild(modeBar);
  toolbar.appendChild(modeGroup);

  const counter = el("span", "evt-counter", "");
  toolbar.appendChild(counter);

  const saveBtn = el("button", "btn btn-accent", "保存映射");
  saveBtn.addEventListener("click", () => saveEventMap(page, target.id));
  toolbar.appendChild(saveBtn);
  pane.appendChild(toolbar);

  /* 主体：双栏（规则卡面板 + 树形经济事项面板，可切换左右） */
  pane.appendChild(el("div", "wb-section-title", "规则卡与适用经济事项"));
  const wrap = el("div", "evt-map");
  pane.appendChild(wrap);

  /* 状态初始化（切换版本/重渲染时保留绑定视角与注释） */
  if (!pane._evtMode) pane._evtMode = "card";
  if (!pane._currentScope) pane._currentScope = bl[0] ? bl[0].scopeKey : null;
  pane._comments = pane._comments || {};
  bl.forEach((it) => {
    if (pane._comments[it.scopeKey] == null) {
      const meta = ruleNameFor(it.scopeKey);
      pane._comments[it.scopeKey] = meta.policy || it.baseLogic || "";
    }
  });

  /* 加载已存映射后渲染双栏主体（映射契约 subjectIds 不变） */
  pane._byScope = {};
  BM.apiGet(`/api/rule-versions/${target.id}/event-map`)
    .then((map) => {
      const byScope = {};
      (map || []).forEach((m) => { byScope[m.scopeKey] = m.subjectIds; });
      pane._byScope = byScope;
      renderDualBody(page, pane, bl, subjectTree, toolbar);
    })
    .catch(() => {
      renderDualBody(page, pane, bl, subjectTree, toolbar);
    });
}

/* ================================================================
 * RK1 · 双栏主体：规则卡面板 ↔ 树形经济事项面板（两种绑定视角可切换）
 *   mode = "card"（默认）：左规则卡 + 右树形事项（选卡 → 勾选/高亮事项）
 *   mode = "event"：左树形事项 + 右规则卡（选事项节点 → 勾选/高亮规则卡）
 *   共享 pane._byScope（scopeKey → subjectIds[]），保存契约不变。
 * ================================================================ */
function renderDualBody(page, pane, bl, subjectTree, toolbar) {
  const wrap = pane.querySelector(".evt-map");
  if (!wrap) return;
  wrap.innerHTML = "";
  const mode = pane._evtMode || "card";

  const cardPanel = el("div", "evt-panel evt-cards-panel");
  const treePanel = el("div", "evt-panel evt-tree-panel");
  pane._cardPanel = cardPanel;
  pane._treePanel = treePanel;
  pane._bl = bl;
  pane._subjectTree = subjectTree;
  pane._toolbar = toolbar;

  renderCardPanel(page, pane, bl, mode);
  renderTreePanel(page, pane, subjectTree, mode);

  if (mode === "card") { wrap.appendChild(cardPanel); wrap.appendChild(treePanel); }
  else { wrap.appendChild(treePanel); wrap.appendChild(cardPanel); }
}

/* 规则卡面板：mode=card 点卡高亮树；mode=event 卡带勾选表示「当前事项是否绑定该卡」 */
function renderCardPanel(page, pane, bl, mode) {
  const panel = pane._cardPanel;
  panel.innerHTML = "";
  panel.appendChild(el("div", "evt-panel-title", mode === "card" ? "① 规则卡" : "② 规则卡"));

  const cardList = el("div", "evt-cards evt-cards-col");
  bl.forEach((it) => {
    const meta = ruleNameFor(it.scopeKey);
    const badge = meta.typeLabel ? `<span class="sc-badge">${esc(meta.typeLabel)}</span>` : "";
    const c = el("div", "scope-card" + ((mode === "card" && pane._currentScope === it.scopeKey) ? " active" : ""));
    c.dataset.scope = it.scopeKey;
    c.innerHTML = `<div class="sc-k">${esc(meta.desc)}</div>${badge}`;

    if (mode === "card") {
      /* 模式①：点卡片 → 切换当前规则卡 → 高亮树勾选 + 注释 */
      c.addEventListener("click", () => {
        pane._currentScope = it.scopeKey;
        cardList.querySelectorAll(".scope-card").forEach((x) => x.classList.toggle("active", x.dataset.scope === it.scopeKey));
        highlightTreeForScope(page, pane, it.scopeKey);
        setCommentValue(pane, pane._commentBox, it.scopeKey);
        updateCounter(page, pane._toolbar.querySelector(".evt-counter"));
      });
      cardList.appendChild(c);
    } else {
      /* 模式②：卡片带勾选 = 当前选中事项是否绑定该卡 */
      const subj = pane._currentSubject;
      const bound = subj != null ? ((pane._byScope[it.scopeKey] || []).map(Number).indexOf(Number(subj)) >= 0) : false;
      if (bound) c.classList.add("bound");
      const chk = el("input", "evt-card-check");
      chk.type = "checkbox";
      chk.checked = bound;
      c.prepend(chk);
      chk.addEventListener("change", () => {
        const list = (pane._byScope[it.scopeKey] = pane._byScope[it.scopeKey] || []);
        const i = list.map(Number).indexOf(Number(subj));
        if (chk.checked) { if (i < 0) list.push(Number(subj)); }
        else { if (i >= 0) list.splice(i, 1); }
        c.classList.toggle("bound", chk.checked);
        updateCounter(page, pane._toolbar.querySelector(".evt-counter"));
      });
      cardList.appendChild(c);
    }
  });
  panel.appendChild(cardList);

  /* 注释框（保留 M16 规则说明 / 注释，随规则卡切换） */
  const commentRow = el("div", "evt-comment-row");
  commentRow.appendChild(el("span", "evt-comment-label", "规则说明 / 注释"));
  const commentBox = el("div", "evt-comment");
  commentBox.setAttribute("contenteditable", "true");
  commentBox.setAttribute("data-ph", "点击规则卡查看说明，可在此补充注释…");
  commentBox.addEventListener("input", () => {
    const scope = pane._currentScope;
    if (scope) { pane._comments[scope] = commentBox.innerText; }
  });
  commentRow.appendChild(commentBox);
  panel.appendChild(commentRow);
  pane._commentBox = commentBox;
  if (pane._currentScope) setCommentValue(pane, commentBox, pane._currentScope);
}

/* 树形经济事项面板：mode=card 节点勾选=绑定当前规则卡；mode=event 节点点击选中→刷新规则卡 */
function renderTreePanel(page, pane, subjectTree, mode) {
  const panel = pane._treePanel;
  panel.innerHTML = "";
  panel.appendChild(el("div", "evt-panel-title", mode === "card" ? "② 经济事项（树形）" : "① 经济事项（树形）"));

  const treeBox = el("div", "evt-tree");
  const tree = (subjectTree && subjectTree.length) ? subjectTree : buildFlatTree(page._data.subjects);
  tree.forEach((n) => treeBox.appendChild(buildTreeNode(n, 1, page, pane, mode)));
  panel.appendChild(treeBox);
  if (!tree.length) panel.appendChild(el("div", "hint-text", "未获取到经济事项树"));
}

function buildTreeNode(node, depth, page, pane, mode) {
  const hasChildren = !!(node.children && node.children.length);
  const collapsed = hasChildren && depth >= 2; /* L1 默认展开，L2+ 折叠 */
  const nodeDiv = el("div", "evt-tree-node" + (hasChildren ? "" : " leaf") + (collapsed ? " collapsed" : ""));
  const row = el("div", "evt-tree-row");
  row.style.paddingLeft = ((depth - 1) * 18) + "px";

  const toggle = el("span", "evt-tree-toggle", hasChildren ? (collapsed ? "▸" : "▾") : "");
  if (hasChildren) {
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const c = nodeDiv.classList.toggle("collapsed");
      toggle.textContent = c ? "▸" : "▾";
    });
  }
  row.appendChild(toggle);

  if (mode === "card") {
    /* 模式①：checkbox 勾选 = 该事项绑定到当前规则卡 */
    const chk = el("input", "evt-tree-check");
    chk.type = "checkbox";
    chk.dataset.sub = node.id;
    const ids = (pane._byScope && pane._byScope[pane._currentScope]) || [];
    chk.checked = ids.map(Number).indexOf(Number(node.id)) >= 0;
    chk.addEventListener("change", () => { syncChecks(page); updateCounter(page, pane._toolbar.querySelector(".evt-counter")); });
    row.appendChild(chk);
  } else {
    /* 模式②：点击节点选中，刷新右侧规则卡勾选态 */
    if (pane._currentSubject === node.id) row.classList.add("selected");
    row.addEventListener("click", () => {
      pane._currentSubject = node.id;
      pane._treeBox = pane._treeBox || null;
      const box = pane._treePanel.querySelector(".evt-tree");
      box.querySelectorAll(".evt-tree-row").forEach((r) => r.classList.remove("selected"));
      row.classList.add("selected");
      renderCardPanel(page, pane, pane._bl, "event");
      updateCounter(page, pane._toolbar.querySelector(".evt-counter"));
    });
  }

  const name = el("span", "evt-tree-name");
  name.innerHTML = esc(node.name) + (node.level ? `<span class="evt-tree-level">L${node.level}</span>` : "");
  row.appendChild(name);
  nodeDiv.appendChild(row);

  if (hasChildren) {
    const childWrap = el("div", "evt-tree-children");
    node.children.forEach((c) => childWrap.appendChild(buildTreeNode(c, depth + 1, page, pane, mode)));
    nodeDiv.appendChild(childWrap);
  }
  return nodeDiv;
}

/* 回退：subjectTree 缺失时，按 parentId 从平铺 subjects 组装单层/多层树 */
function buildFlatTree(subjects) {
  const map = {};
  (subjects || []).forEach((s) => { map[s.id] = Object.assign({}, s, { children: [] }); });
  const roots = [];
  (subjects || []).forEach((s) => {
    const n = map[s.id];
    if (s.parentId != null && map[s.parentId]) map[s.parentId].children.push(n);
    else roots.push(n);
  });
  return roots;
}

function setCommentValue(pane, box, scopeKey) {
  if (!box) return;
  const text = (pane._comments && pane._comments[scopeKey]) || "";
  box.innerText = text;
}

/* RK1 模式①：选中规则卡后，把树形事项的 checkbox 勾选态同步为该卡的映射 */
function highlightTreeForScope(page, pane, scopeKey) {
  const ids = (pane._byScope && pane._byScope[scopeKey]) || [];
  const set = new Set(ids.map(Number));
  pane.querySelectorAll('input[type=checkbox][data-sub]').forEach((cb) => { cb.checked = set.has(Number(cb.dataset.sub)); });
}

function syncChecks(page) {
  const pane = page.querySelector('[data-pane="events"]');
  const scope = pane._currentScope;
  if (!scope) return;
  const ids = Array.from(pane.querySelectorAll('input[type=checkbox][data-sub]:checked')).map((cb) => Number(cb.dataset.sub));
  pane._byScope = pane._byScope || {};
  pane._byScope[scope] = ids;
}

function saveEventMap(page, versionId) {
  const pane = page.querySelector('[data-pane="events"]');
  syncChecks(page);
  const ver = page._data.versions.find((v) => v.id === versionId) || activeVersion(page._data.versions);
  const bl = baselineItems(ver);
  const byScope = pane._byScope || {};
  const payload = bl.map((it) => ({ scopeKey: it.scopeKey, subjectIds: byScope[it.scopeKey] || [] }));
  BM.apiSend(`/api/rule-versions/${versionId}/event-map`, "PUT", payload)
    .then(() => BM.toast("已保存适用经济事项映射"))
    .catch(() => BM.toast("保存失败"));
}

/* ---------- 生成新版本向导（复用既有克隆/抽取/发布流程） ---------- */
function openDraftWizard(page) {
  page.innerHTML = "";
  const wrap = el("div", "draft-editor");

  wrap.appendChild(el("div", "page-head", `<div class="page-title">生成新预测版本</div>
    <div class="page-desc">已从当前生效版本克隆为草稿，调整后标注来源并发布</div>`));

  BM.apiSend("/api/rule-versions", "POST", { name: "新预测版本（草稿）" })
    .then((draft) => buildDraftEditor(wrap, draft))
    .catch(() => { wrap.innerHTML = ""; wrap.appendChild(el("div", "empty", `<div class="empty-ico">⚠️</div>创建草稿失败`)); });

  const back = el("button", "btn btn-ghost", "← 返回");
  back.addEventListener("click", () => BM.renderRules(document.getElementById("viewPanel")));
  wrap.appendChild(back);
  page.appendChild(wrap);
}

function buildDraftEditor(wrap, draft) {
  wrap.innerHTML = "";
  const baseline = baselineItems(draft);
  const flow = flowItems(draft);

  /* 基线因子编辑 */
  wrap.appendChild(el("div", "wb-section-title", "控制基线比例（相对上年决算，单位 %）"));
  const bGrid = el("div", "draft-factors");
  const factorInputs = {};
  baseline.forEach((it) => {
    const row = el("div", "factor-row");
    const pct = it.factor != null ? Math.round(it.factor * 1000) / 10 : 100;
    row.innerHTML = `<label class="fr-k">${esc(it.scopeKey)}</label>
      <input class="fr-input" type="number" step="0.1" min="0" max="200" value="${pct}">
      <span class="fr-unit">%</span>
      <span class="fr-logic">${esc(it.baseLogic || "")}</span>`;
    factorInputs[it.scopeKey] = row.querySelector("input");
    bGrid.appendChild(row);
  });
  wrap.appendChild(bGrid);

  /* 财务流程规则编辑 */
  wrap.appendChild(el("div", "wb-section-title", "财务流程规则"));
  const fGrid = el("div", "draft-flow");
  const flowInputs = {};
  flow.forEach((it) => {
    const meta = FLOW_META[it.scopeKey] || { label: it.scopeKey, options: {} };
    const row = el("div", "factor-row");
    const sel = `<select class="fr-select">${Object.keys(meta.options).map((k) => `<option value="${k}" ${String(k) === String(it.value) ? "selected" : ""}>${esc(meta.options[k])}</option>`).join("")}</select>`;
    row.innerHTML = `<label class="fr-k">${esc(meta.label)}</label>${sel}`;
    flowInputs[it.scopeKey] = row.querySelector("select");
    fGrid.appendChild(row);
  });
  wrap.appendChild(fGrid);

  /* 入口 A：AI 抽取（确定性占位） */
  wrap.appendChild(el("div", "wb-section-title", "入口 A · 会议纪要 / 预算文件抽取（AI 辅助，仅供核对）"));
  const extractBox = el("div", "extract-box");
  extractBox.innerHTML = `<textarea class="extract-area" placeholder="粘贴预算会议纪要或预算方案文本，例如：总办办公费下调6%，食堂据实申报…"></textarea>
    <div class="extract-ops"><button class="btn btn-ghost btn-sm" id="extractBtn">AI 抽取建议</button></div>
    <div class="extract-result" id="extractResult"></div>`;
  wrap.appendChild(extractBox);
  extractBox.querySelector("#extractBtn").addEventListener("click", () => {
    const text = extractBox.querySelector(".extract-area").value;
    BM.apiSend(`/api/rule-versions/${draft.id}/extract`, "POST", { text })
      .then((d) => renderExtractResult(d.proposals || [], baseline, factorInputs))
      .catch(() => BM.toast("抽取失败"));
  });

  /* 来源标注 */
  wrap.appendChild(el("div", "wb-section-title", "来源标注（必填）"));
  const srcBox = el("div", "src-box");
  srcBox.innerHTML = `<div class="src-row"><label>来源类型</label>
      <select class="src-select" id="srcType">
        <option value="meeting">预算会议</option>
        <option value="income-plan">收入方案</option>
        <option value="budget-file">预算文件</option>
        <option value="manual">手动调整</option>
      </select></div>
    <div class="src-row"><label>来源引用</label><input class="src-input" id="srcRef" placeholder="如：8 月预算会议纪要 / 方案编号"></div>
    <div class="src-row"><label>版本说明</label><input class="src-input" id="srcNote" placeholder="如：根据会议决议整体下调 1%"></div>`;
  wrap.appendChild(srcBox);

  /* 操作按钮 */
  const ops = el("div", "draft-ops");
  const saveBtn = el("button", "btn btn-ghost", "保存修改");
  saveBtn.addEventListener("click", () => saveDraft(draft.id, baseline, flow, factorInputs, flowInputs).then(() => BM.toast("草稿已保存")));
  const pubBtn = el("button", "btn btn-primary", "发布为新版本");
  pubBtn.addEventListener("click", () => {
    saveDraft(draft.id, baseline, flow, factorInputs, flowInputs).then(() => {
      publishVersion(document.getElementById("viewPanel"), draft.id, {
        sourceType: srcBox.querySelector("#srcType").value,
        sourceRef: srcBox.querySelector("#srcRef").value,
        note: srcBox.querySelector("#srcNote").value,
      });
    });
  });
  const cancel = el("button", "btn btn-ghost", "取消");
  cancel.addEventListener("click", () => BM.renderRules(document.getElementById("viewPanel")));
  ops.appendChild(saveBtn); ops.appendChild(pubBtn); ops.appendChild(cancel);
  wrap.appendChild(ops);
}

function saveDraft(draftId, baseline, flow, factorInputs, flowInputs) {
  const items = [];
  baseline.forEach((it) => {
    const v = parseFloat(factorInputs[it.scopeKey].value);
    if (!isNaN(v)) items.push({ scopeKey: it.scopeKey, factor: Math.round((v / 100) * 1000) / 1000 });
  });
  flow.forEach((it) => {
    items.push({ scopeKey: it.scopeKey, value: String(flowInputs[it.scopeKey].value) });
  });
  return BM.apiSend(`/api/rule-versions/${draftId}/items`, "PUT", { items });
}

function renderExtractResult(proposals, baseline, factorInputs) {
  const box = document.getElementById("extractResult");
  if (!box) return;
  if (!proposals.length) { box.innerHTML = `<div class="hint-text">未解析到明确的下调比例，请确认文本表述（如"XX 下调 6%"）。</div>`; return; }
  box.innerHTML = "";
  const scopeKeys = baseline.map((b) => b.scopeKey);
  proposals.forEach((p) => {
    const item = el("div", "extract-item");
    const sel = `<select class="ex-select">${scopeKeys.map((k) => `<option value="${k}">${esc(k)}</option>`).join("")}</select>`;
    item.innerHTML = `<div class="ex-info"><b>${esc(p.hint)}</b> · 建议比例 ${(Math.round(p.factor * 1000) / 10)}%（${esc(p.logic)}）</div>
      <div class="ex-apply">应用到 ${sel}<button class="btn btn-accent btn-sm ex-btn">应用</button></div>`;
    item.querySelector(".ex-btn").addEventListener("click", () => {
      const key = item.querySelector(".ex-select").value;
      if (factorInputs[key]) {
        factorInputs[key].value = Math.round(p.factor * 1000) / 10;
        BM.toast("已应用：" + key + " → " + (Math.round(p.factor * 1000) / 10) + "%");
      }
    });
    box.appendChild(item);
  });
}

function publishVersion(panel, versionId, source) {
  BM.apiSend(`/api/rule-versions/${versionId}/publish`, "POST", source)
    .then(() => {
      BM.toast("✅ 已发布为新生效版本，全系统基线已同步");
      BM.renderRules(panel);
    })
    .catch(() => BM.toast("发布失败"));
}

window.BM.renderRules = BM.renderRules;
window.BM = BM;

/* ---------- Tab4 创建新规划（政策驱动 + AI 抽取生成草案 → 人核对发布） ---------- */
function nextYear() { return new Date().getFullYear() + 1; }

function renderCnExtract(box, proposals, baseline) {
  box.innerHTML = "";
  if (!proposals.length) {
    box.appendChild(el("div", "hint-text", "未解析到明确的下调比例，请确认政策文本表述（如『食堂下降 3%』）。"));
    return;
  }
  const byKey = {};
  baseline.forEach((b) => { byKey[b.scopeKey] = b; });
  proposals.forEach((p) => {
    const cur = p.scopeKey && byKey[p.scopeKey] ? Math.round(byKey[p.scopeKey].factor * 1000) / 10 : null;
    const item = el("div", "cn-ex-item");
    item.innerHTML = `<div class="cn-ex-info"><b>${esc(p.hint)}</b> → 建议 ${esc(p.scopeKey || "未识别规则卡")} · ${Math.round(p.factor * 1000) / 10}%（${esc(p.logic)}）${cur != null ? " · 现行 " + cur + "%" : ""}</div>`;
    if (!p.scopeKey) item.appendChild(el("div", "cn-ex-warn", "⚠ 未匹配到规则卡，生成时将忽略（可手写调整）"));
    box.appendChild(item);
  });
}

function renderCreateNextTab(page) {
  const pane = page.querySelector('[data-pane="createNext"]');
  const versions = page._data.versions;
  const active = activeVersion(versions);
  pane.innerHTML = "";
  if (!active) { pane.appendChild(el("div", "empty", "无生效版本")); return; }

  pane.appendChild(el("div", "create-next-head", `目标年度：<b>${nextYear()}</b> 年 · 基于当前生效版本（${esc(active.version)}）+ 导入政策文件 + AI 抽取生成新年度规则`));

  /* ① 上传 */
  const upBox = el("div", "cn-upload");
  upBox.appendChild(el("div", "wb-section-title", "① 导入集团预算政策文件"));
  const fileInput = el("input", "cn-file");
  fileInput.type = "file"; fileInput.multiple = true; fileInput.accept = ".pdf,.docx,.xlsx,.pptx,.md,.txt,.csv";
  fileInput.id = "policyFile";
  const pickLabel = el("label", "btn btn-primary file-pick-label", "选择文件");
  pickLabel.setAttribute("for", "policyFile");
  const pickName = el("span", "file-picker-name empty", "未选择文件");
  const filePicker = el("div", "file-picker");
  filePicker.appendChild(pickLabel);
  filePicker.appendChild(pickName);
  filePicker.appendChild(fileInput);
  const upHint = el("div", "cn-hint", "支持 PDF / Word / Excel / Markdown / TXT / CSV（多文件）。图片 OCR 后续支持。");
  const pasteArea = el("textarea", "cn-paste");
  pasteArea.placeholder = "或直接粘贴政策文本 / 会议纪要…";
  const upOps = el("div", "cn-ops");
  const upBtn = el("button", "btn btn-primary", "生成新的规则");
  upOps.appendChild(upBtn);
  const mapBtn = el("button", "btn btn-outline", "调整经济事项适用的规则");
  mapBtn.addEventListener("click", () => {
    page._data.eventsVersionId = active.id;
    switchTab(page, "events");
    renderEventsTab(page);
  });
  upOps.appendChild(mapBtn);
  const txtBox = el("div", "cn-text");
  upBox.appendChild(filePicker); upBox.appendChild(upHint); upBox.appendChild(pasteArea);
  upBox.appendChild(upOps); upBox.appendChild(txtBox);
  pane.appendChild(upBox);
  fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files || []);
    if (files.length) {
      pickName.classList.remove("empty");
      pickName.innerHTML = "<b>" + files.map((f) => esc(f.name)).join("</b> · <b>") + "</b>";
    } else {
      pickName.classList.add("empty");
      pickName.textContent = "未选择文件";
    }
  });

  /* ② 抽取对照 */
  const exBox = el("div", "cn-extract");
  exBox.appendChild(el("div", "wb-section-title", "② AI 抽取建议（核对后可微调，最终由你确认）"));
  const exResult = el("div", "cn-ex-result");
  exBox.appendChild(exResult);
  pane.appendChild(exBox);

  /* ②.5 监督规则下拉设置（默认继承当前生效版本） */
  const activeFlow = {};
  flowItems(active).forEach((it) => { activeFlow[it.scopeKey] = String(it.value); });
  const flowKeys = ["trackMode", "surplusAction", "allowOverBudget"];
  const flowSel = {};
  const flowBox = el("div", "cn-flow");
  flowBox.appendChild(el("div", "wb-section-title", "监督规则设置（下拉选择，默认继承当前生效版本）"));
  const flowGrid = el("div", "cn-flow-grid");
  flowKeys.forEach((key) => {
    const meta = FLOW_META[key];
    const field = el("div", "cn-flow-field");
    field.appendChild(el("label", "cn-flow-label", esc(meta.label)));
    const sel = el("select", "cn-flow-select");
    Object.keys(meta.options).forEach((ov) => {
      const o = document.createElement("option");
      o.value = ov; o.textContent = meta.options[ov];
      sel.appendChild(o);
    });
    const def = activeFlow[key] != null ? activeFlow[key] : (BM.DEFAULT_RULES ? BM.DEFAULT_RULES[key] : undefined);
    if (def != null) sel.value = String(def);
    sel.dataset.key = key;
    flowSel[key] = sel;
    field.appendChild(sel);
    flowGrid.appendChild(field);
  });
  flowBox.appendChild(flowGrid);
  pane.appendChild(flowBox);

  function currentFlowValues() {
    const out = {};
    flowKeys.forEach((k) => { out[k] = flowSel[k] ? flowSel[k].value : undefined; });
    return out;
  }
  function pushFlowOverrides() {
    if (!draft) return;
    const ov = currentFlowValues();
    const items = baselineItems(draft).map((it) => ({ scopeKey: it.scopeKey, factor: it.factor, value: it.value }))
      .concat(flowItems(draft).map((it) => ({ scopeKey: it.scopeKey, value: ov[it.scopeKey] != null ? String(ov[it.scopeKey]) : String(it.value) })));
    (draft.items || []).forEach((it) => { if (it.category === "flow" && ov[it.scopeKey] != null) it.value = String(ov[it.scopeKey]); });
    BM.apiSend(`/api/rule-versions/${draft.id}/items`, "PUT", { items })
      .then(() => { draftView.innerHTML = ""; renderRuleCards(draftView, draft); })
      .catch(() => BM.toast("同步监督规则失败"));
  }
  flowKeys.forEach((k) => { if (flowSel[k]) flowSel[k].addEventListener("change", pushFlowOverrides); });

  /* ③ 草案预览 + 操作 */
  const draftBox = el("div", "cn-draft");
  draftBox.appendChild(el("div", "wb-section-title", "③ 草案预览（生成后显示，复用当前版本卡片样式）"));
  const draftView = el("div", "cn-draft-view");
  draftBox.appendChild(draftView);
  const draftOps = el("div", "cn-draft-ops");
  const genBtn = el("button", "btn btn-primary", "生成草案版本");
  const pubBtn = el("button", "btn btn-accent", "正式发布"); pubBtn.disabled = true;
  const discardBtn = el("button", "btn btn-ghost", "丢弃草案"); discardBtn.disabled = true;
  draftOps.appendChild(genBtn); draftOps.appendChild(pubBtn); draftOps.appendChild(discardBtn);
  draftBox.appendChild(draftOps);
  pane.appendChild(draftBox);

  let policyText = "";
  let draft = null;

  function getPolicyText() {
    const edit = txtBox.querySelector(".cn-text-edit");
    return edit ? edit.value : policyText;
  }

  upBtn.addEventListener("click", () => {
    const files = Array.from(fileInput.files || []);
    const pasted = pasteArea.value.trim();
    const finish = (text) => {
      policyText = text;
      txtBox.innerHTML = `<textarea class="cn-text-edit">${esc(policyText)}</textarea>`;
      runExtract();
    };
    if (files.length) {
      Promise.all(files.map((f) => new Promise((res) => {
        const r = new FileReader();
        r.onload = () => res({ filename: f.name, content: String(r.result).split(",")[1] });
        r.readAsDataURL(f);
      }))).then((parts) => Promise.all(parts.map((p) =>
        BM.apiSend("/api/policy-upload", "POST", p)
          .then((d) => d.text || "").catch(() => ""))))
        .then((texts) => finish(texts.join("\n")))
        .catch(() => BM.toast("文件解析失败"));
    } else if (pasted) {
      finish(pasted);
    } else {
      BM.toast("请先选择文件或粘贴文本");
    }
  });

  function runExtract() {
    BM.apiSend(`/api/rule-versions/${active.id}/extract`, "POST", { text: getPolicyText() })
      .then((d) => renderCnExtract(exResult, d.proposals || [], baselineItems(active)))
      .catch(() => BM.toast("抽取失败"));
  }

  genBtn.addEventListener("click", () => {
    const text = getPolicyText();
    if (!text) { BM.toast("请先导入政策文件或粘贴文本"); return; }
    BM.apiSend(`/api/rule-versions/${active.id}/extract`, "POST", { text })
      .then((d) => {
        const proposals = d.proposals || [];
        const name = nextYear() + " 年度预算规则（政策 AI 生成）";
        return BM.apiSend("/api/rule-versions", "POST", { year: nextYear(), name, note: "ai_policy：基于政策文件抽取生成" })
          .then((dv) => {
            const items = baselineItems(dv).map((it) => {
              const pr = proposals.find((p) => p.scopeKey === it.scopeKey);
              return { scopeKey: it.scopeKey, factor: pr ? pr.factor : it.factor, value: it.value };
            });
            const ov = currentFlowValues();
            flowItems(dv).forEach((it) => items.push({ scopeKey: it.scopeKey, value: ov[it.scopeKey] != null ? String(ov[it.scopeKey]) : String(it.value) }));
            return BM.apiSend(`/api/rule-versions/${dv.id}/items`, "PUT", { items })
              .then(() => dv);
          });
      })
      .then((dv) => {
        draft = dv;
        BM.apiSend("/api/policy-document", "POST", { versionId: dv.id, filename: "policy", text }).catch(() => {});
        draftView.innerHTML = "";
        renderRuleCards(draftView, dv);
        pubBtn.disabled = false; discardBtn.disabled = false; genBtn.disabled = true;
        BM.toast("已生成草案版本 " + dv.version + "，请核对后发布");
      })
      .catch((e) => BM.toast("生成草案失败：" + (e && e.error ? e.error : "未知")));
  });

  pubBtn.addEventListener("click", () => {
    if (!draft) return;
    if (!confirm(`确认将 ${draft.version} 正式发布为 ${nextYear()} 年生效版本？当前生效版本将归档。`)) return;
    BM.apiSend(`/api/rule-versions/${draft.id}/publish`, "POST", { sourceType: "budget-file", sourceRef: "政策文件 AI 生成", note: nextYear() + " 年度预算规则" })
      .then(() => {
        BM.syncStateRules(draft);
        BM.loadRuleVersions().then((vs) => { page._data.versions = vs; renderCreateNextTab(page); switchTab(page, "createNext"); BM.toast("✅ 已发布为 " + nextYear() + " 年生效版本"); });
      })
      .catch(() => BM.toast("发布失败"));
  });

  discardBtn.addEventListener("click", () => {
    if (!draft) return;
    if (!confirm(`确认丢弃草案 ${draft.version}？`)) return;
    BM.apiSend(`/api/rule-versions/${draft.id}`, "DELETE")
      .then(() => { draft = null; draftView.innerHTML = ""; pubBtn.disabled = true; discardBtn.disabled = true; genBtn.disabled = false; BM.toast("已丢弃草案"); })
      .catch(() => BM.toast("丢弃失败"));
  });
}
})();
