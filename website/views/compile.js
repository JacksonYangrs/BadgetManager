/* ================================================================
 * compile.js — 编制工作台（M3 + M6 规则预填 · v0.13 · P0）
 * 设计（产品设计稿 V1 §M3 / §3.0）：
 *   - 预算控制的方法（自上而下定义：历史参考/同比/固定/数量×单价/人均标准/业务量/管理标准/关键事件/人工，由上面挂到各事项，基层不自选）
 *   - 经济事项（以客户规则科目为最细事实源）一次填报
 *   - 月度分解 1~12（确定性权重分解，和=年度额）
 *   - 规则预填基线（BM.applyRule，来自 M6 规则）；偏离须填原因
 *   - 保存草稿（本地持久化 BM.compileSaveDraft）
 *   - 两个视角：经济事项视角（8 列填报表）/ 财务会计视角（会计科目聚合）；月度拆分走方案 B 二级页（monthly-split.js）
 * 计算：全部走 BM.calc（确定性纯函数）。
 * ================================================================ */

var BM = window.BM || {};



/* 取某科目的方法计算上下文（mock 派生，确定性） */
function methodContext(r) {
  const ly = r.lastYear || 0;
  return {
    lastYear: ly,
    growth: 1.05,
    qty: 100,
    price: Math.round(ly / 100) || 0,
    headcount: 50,
    perCapita: Math.round(ly / 50) || 0,
    volume: Math.round(ly / 8000) || 0,
    unitCost: 8000,
    manageBaseline: BM.applyRule(r.cat, r.lastYear).ok ? BM.applyRule(r.cat, r.lastYear).baseline : ly,
    eventDelta: Math.round(ly * 0.08),
    manualAmount: ly,
  };
}

/* 月度合计实时校验 */
function monthSum(inputs) {
  return inputs.reduce((a, i) => a + (parseInt(i.value, 10) || 0), 0);
}

/* ================================================================
 * 数据源：优先后端 API（/api/events，server/ 模块），失败回退本地 mock
 * ================================================================ */
BM.eventsData = null;   /* 后端经济事项列表（8 列结构） */
BM.apiMode = false;     /* true = 已连接后端，保存走 PUT */
BM.subjectCache = null; /* 科目编码 → 名称缓存（由 /api/subjects 填充） */
let _apiChecked = false;

BM.initEventsApi = function () {
  if (_apiChecked) return;
  _apiChecked = true;
  if (typeof fetch !== "function") return;
  BM.apiGet("/api/events")
    .then((list) => {
      BM.eventsData = Array.isArray(list) ? list : [];
      BM.apiMode = true;
    })
    .catch(() => { BM.eventsData = null; BM.apiMode = false; })
    .finally(() => {
      /* 仅当当前正停留在编制页时，用后端数据重渲染；其他视图（看板等）不跳转 */
      if (BM.apiMode) {
        const t = document.querySelector("#viewPanel .page-title");
        if (t && (t.textContent || "").indexOf("预算编制") >= 0) BM.openView("compile");
      }
    });
};

/* 本地 mock：从规则字典构造与 API 相同结构（离线兜底，标注数据源） */
function buildMockList() {
  return BM.RULES.map((r) => {
    const ctrlMethod = BM.CTRL_METHOD_ASSIGN[r.cat] || "history";
    const ctrlCtx = methodContext(r);
    ctrlCtx.method = ctrlMethod;
    const baseline = BM.calc.compileByMethod(ctrlCtx).amount;
    const sug = BM.aiSuggestion(r.cat);
    return {
      id: r.id, cat: r.cat, acctCode: r.acctCode || "—",
      amount: baseline, monthly: BM.calc.decomposeMonthly(baseline),
      lastBudget: r.lastBudget != null ? r.lastBudget : null,
      lastYear: r.lastYear != null ? r.lastYear : null,
      deviation: r.lastBudget != null && r.lastYear != null ? r.lastYear - r.lastBudget : null,
      method: ctrlMethod, ai: sug, sortNo: 0,
    };
  });
}

/* 保存本年度预算值：API 模式 PUT，否则写本地草稿 */
function persistAmount(r, amt) {
  const ctrlMethod = r.method || BM.CTRL_METHOD_ASSIGN[r.cat] || "history";
  if (BM.apiMode && r.id != null && Number.isFinite(Number(r.id))) {
    return BM.apiSend("/api/events/" + r.id + "/amount", "PUT", { amount: amt }).catch(() => {});
  }
  BM.compileSaveSubject(r.cat, { method: ctrlMethod, amount: amt, monthly: BM.calc.decomposeMonthly(amt), reason: "" });
  return Promise.resolve();
}

function renderCompile(container) {
  container.innerHTML = "";
  const page = el("div", "page");
  const role = BM.state.role;
  const draft = BM.compileLoadDraft();

  /* 数据源：尝试接后端；renderFillTable/renderAccountView 用 src（API 或 mock） */
  BM.initEventsApi();
  const src = BM.eventsData && BM.eventsData.length ? BM.eventsData : buildMockList();

  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">预算编制 · 2026</div>
      <div class="page-desc">两个视角：经济事项视角（填报）· 财务会计视角（按会计科目聚合）——同一份数据</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "compile");

  /* 数据源状态条（在线 = 后端 SQLite / 离线 = 本地样例） */
  const srcBar = el("div", "plan-statusbar");
  srcBar.innerHTML = BM.apiMode
    ? `<span class="badge badge-ok">数据源 · 在线</span><span class="hint-text">已连接经济事项模块数据库（SQLite），改动实时保存</span>`
    : `<span class="badge badge-warn">数据源 · 离线</span><span class="hint-text">未连接后端（示例数据，改动存本地草稿）</span>`;
  page.appendChild(srcBar);

  /* 两个视角切换（Sponsor 定稿：经济事项视角 / 财务会计视角） */
  const dualToggle = el("div", "filter-bar");
  dualToggle.style.marginBottom = "10px";
  const dualModes = [["event", "经济事项视角"], ["account", "财务会计视角"]];
  const dualBtns = {};
  dualModes.forEach((m) => {
    const b = el("button", "btn btn-outline btn-sm" + (m[0] === "event" ? " active" : ""), m[1]);
    dualToggle.appendChild(b);
    dualBtns[m[0]] = b;
  });
  page.appendChild(dualToggle);

  const dualBox = el("div", "tbl-wrap");
  page.appendChild(dualBox);

  /* 作用域 tbody：8 列填报表（经济事项视角）的表格体，供保存/提交遍历 */
  let tbody = null;

  /* 按会计科目聚合（财务会计视角：同一份数据，不同主轴） */
  function aggBy(keyFn) {
    const map = {};
    src.forEach((d) => {
      const k = keyFn(d) || "—";
      if (!map[k]) map[k] = { key: k, events: 0, amount: 0 };
      map[k].events += 1;
      map[k].amount += (d.amount || 0);
    });
    return Object.keys(map).map((k) => map[k]);
  }

  /* 经济事项视角：8 列填报表（Sponsor 定稿列序） */
  function renderFillTable() {
    dualBox.innerHTML = "";
    const table = el("table");
    table.innerHTML = `<thead><tr>
      <th>经济事项</th><th>会计科目</th>
      <th style="text-align:right">本年度预算值</th>
      <th style="text-align:right">上年预算</th><th style="text-align:right">上年决算</th><th>偏差</th>
      <th class="ai-suggest-th">AI 建议</th>
      <th>月度拆分</th>
    </tr></thead>`;
    tbody = el("tbody");
    src.forEach((r) => {
      const ctrlMethod = r.method || BM.CTRL_METHOD_ASSIGN[r.cat] || "history";
      const ctrlCtx = methodContext(r);
      ctrlCtx.method = ctrlMethod;
      const baseline = BM.calc.compileByMethod(ctrlCtx).amount;
      const curAmount = r.amount != null ? r.amount : baseline;
      const savedMonthly = r.monthly && r.monthly.length === 12 ? r.monthly : null;

      const tr = el("tr");
      tr.appendChild(el("td", "", `<b>${esc(r.cat)}</b>`));
      tr.appendChild(el("td", "hint-text", esc(r.acctCode || "—")));

      /* 3 本年度预算值：滑块 + 数值联动 */
      const applyTd = el("td");
      applyTd.style.textAlign = "right";
      const applyWrap = el("div", "cmp-slider-wrap");
      const applyInput = el("input", "cmp-apply");
      applyInput.type = "number";
      applyInput.step = "10000";
      applyInput.value = curAmount;
      const applySlider = el("input", "cmp-slider");
      applySlider.type = "range";
      const maxAmt = Math.round(Math.max(baseline, r.lastYear || 0) * 1.3) || 1000000;
      applySlider.min = "0";
      applySlider.max = String(maxAmt);
      applySlider.step = "10000";
      applySlider.value = curAmount;
      applyWrap.appendChild(applySlider);
      applyWrap.appendChild(applyInput);
      applyTd.appendChild(applyWrap);
      tr.appendChild(applyTd);

      /* 4 月度拆分按钮（方案 B 二级页 · 双堆叠条） */
      const monthTd = el("td");
      const openSplit = () => {
        const total = parseInt(applyInput.value, 10) || curAmount;
        const curMonths = savedMonthly && savedMonthly.length === 12 ? savedMonthly : BM.calc.decomposeMonthly(total);
        BM.state.monthlySplit = { id: r.id, cat: r.cat, total: total, ratio: curMonths.map((m) => (total ? m / total : 0)) };
        BM.openView("monthlySplit");
      };
      const monthBtn = el("button", "btn btn-primary btn-sm", "月度拆分 ›");
      monthBtn.title = "打开月度拆解二级页（方案 B：双堆叠条 · 总量守恒）";
      monthBtn.addEventListener("click", openSplit);
      monthTd.appendChild(monthBtn);

      /* 5 上年预算（年初下达） | 6 上年决算（实际执行） */
      tr.appendChild(el("td", "tbl-num", `<span>${r.lastBudget != null ? BM.money(r.lastBudget) : "—"}</span>`));
      tr.appendChild(el("td", "tbl-num", `<span>${r.lastYear != null ? BM.money(r.lastYear) : "—"}</span>`));

      /* 7 偏差（决算 − 预算：超支红 / 节支绿） */
      const devTd = el("td");
      if (r.lastBudget != null && r.lastYear != null) {
        const diff = r.lastYear - r.lastBudget;
        devTd.appendChild(el("span", "badge " + (diff > 0 ? "badge-danger" : "badge-ok"),
          (diff > 0 ? "超支 " : "节支 ") + BM.money(Math.abs(diff))));
      } else {
        devTd.appendChild(el("span", "hint-text", "—"));
      }
      tr.appendChild(devTd);

      /* 8 AI 建议（区间 + 采纳中值 + 编制建议；单行排列） */
      const aiTd = el("td");
      const sug = r.ai || BM.aiSuggestion(r.cat);
      /* 💡 动态编制建议按钮（松哥 2026-08-24：不写死，按适配规则给建议；独立弹层） */
      const adviceBtn = el("button", "btn btn-outline btn-sm", "💡 编制建议");
      if (sug && sug.lo != null) {
        const aiRow = el("div", "ai-suggest-row-inline");
        const range = el("span", "ai-range-compact", BM.money(sug.lo) + " ~ " + BM.money(sug.hi));
        const useBtn = el("button", "btn btn-outline-primary btn-sm", "采纳中值");
        useBtn.addEventListener("click", () => {
          applyInput.value = sug.mid;
          applySlider.value = sug.mid;
          persistAmount(r, sug.mid);
          BM.toast(r.cat + " · 已采纳 AI 建议中值 " + BM.money(sug.mid));
        });
        aiRow.appendChild(range);
        aiRow.appendChild(useBtn);
        aiRow.appendChild(adviceBtn);
        aiTd.appendChild(aiRow);
        aiTd.title = (sug.policy || "") + "；" + (sug.basis || "") + "；" + (sug.exec || "");
      } else {
        aiTd.appendChild(el("span", "hint-text", "—"));
        adviceBtn.style.marginTop = "6px";
        aiTd.appendChild(adviceBtn);
      }
      tr.appendChild(aiTd);
      tr.appendChild(monthTd);

      /* 独立弹层：遮罩 + 居中卡片（默认隐藏，点击 💡 打开） */
      const adviceOverlay = el("div", "advice-overlay");
      adviceOverlay.style.display = "none";
      const adviceCard = el("div", "advice-card");
      const adviceCardTitle = el("div", "advice-card-title");
      const adviceCardClose = el("button", "advice-card-close", "✕");
      adviceCardTitle.appendChild(el("span", "", "💡 编制建议 · " + esc(r.cat)));
      adviceCardTitle.appendChild(adviceCardClose);
      const adviceTd = el("div", "advice-card-body");
      adviceCard.appendChild(adviceCardTitle);
      adviceCard.appendChild(adviceTd);
      adviceOverlay.appendChild(adviceCard);
      document.body.appendChild(adviceOverlay);

      function renderAnalysisHTML(a, dev) {
        if (!a || !a.analysis) return "";
        const p = a.analysis.profile || {};
        const steps = (a.analysis.steps || []).map((s) => `
          <div class="ca-step">
            <div class="ca-step-rule">${esc(s.rule)}</div>
            <div class="ca-step-conclusion">${esc(s.conclusion)}</div>
            <div class="ca-step-why">${esc(s.why)}</div>
          </div>
        `).join("");
        const deviation = a.analysis.deviation;
        const devBlock = !deviation ? "" : `
          <div class="ca-block ca-block-${deviation.status === "合理" ? "ok" : "warn"}">
            <div class="ca-block-title">偏离分析 · ${esc(deviation.status)}</div>
            ${deviation.possibleCauses.length ? `<ul class="ca-list">${deviation.possibleCauses.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : "<div class=\"ca-step-why\">当前申报处于建议区间内。</div>"}
          </div>
        `;
        const qBlock = !a.analysis.questions ? "" : `
          <div class="ca-block">
            <div class="ca-block-title">AI 追问（建议补充）</div>
            <ul class="ca-list ca-questions">${a.analysis.questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>
          </div>
        `;
        return `
          <div class="ca-section-title">AI 规则应用分析</div>
          <div class="ca-profile">
            <span class="ca-chip">弹性分类：${esc(p.elasticityName || "—")}</span>
            <span class="ca-chip">去年执行率：${p.execRate != null ? p.execRate + "%" : "—"}</span>
            <span class="ca-chip">历史实际：${BM.money(p.lastYear || 0)}</span>
            <span class="ca-chip">去年预算：${BM.money(p.lastBudget || 0)}</span>
          </div>
          <div class="ca-steps">${steps}</div>
          <div class="ca-block">
            <div class="ca-block-title">区间推导</div>
            <div class="ca-step-why">${esc(a.analysis.rangeReasoning)}</div>
          </div>
          ${devBlock}
          ${qBlock}
        `;
      }

      /* 刷新建议面板（随金额实时更新） */
      function refreshAdvice() {
        const advice = BM.budgetAdvice(r);
        const amt = parseInt(applyInput.value, 10) || 0;
        const dev = BM.adviceDeviation(advice, amt);
        const devClass = dev.inRange === true ? "badge-ok" : (dev.inRange === false ? "badge-danger" : "");
        const devBadge = dev.inRange === null ? "" : `<span class="badge ${devClass}">${dev.label}</span>`;
        adviceTd.innerHTML = `<div class="cmp-advice">
          <div class="ca-head">
            <span class="ca-rule">${esc(advice.kind)} · 适配${esc(advice.ruleName)}（规则${esc(advice.rule)}）</span>
            ${devBadge}
          </div>
          <div class="ca-ref"><b>建议参照：</b>${esc(advice.ref)}</div>
          <div class="ca-basis">${esc(advice.basisNote)}</div>
          <div class="ca-hint">⚠️ ${esc(advice.devHint)}</div>
          <div class="ca-range">建议区间：${advice.lo != null ? BM.money(advice.lo) + " ~ " + BM.money(advice.hi) : "—"}　|　你填：${BM.money(amt)}　|　偏离中值：${dev.pct != null ? (dev.pct > 0 ? "+" : "") + dev.pct + "%" : "—"}</div>
          ${renderAnalysisHTML(advice, dev)}
        </div>`;
      }

      /* 💡 按钮：打开/关闭独立弹层 */
      function openAdvice() { adviceOverlay.style.display = "flex"; refreshAdvice(); }
      function closeAdvice() { adviceOverlay.style.display = "none"; }
      adviceBtn.addEventListener("click", openAdvice);
      adviceCardClose.addEventListener("click", closeAdvice);
      adviceOverlay.addEventListener("click", (e) => { if (e.target === adviceOverlay) closeAdvice(); });
      document.addEventListener("keydown", function onEsc(e) { if (e.key === "Escape" && adviceOverlay.style.display !== "none") { closeAdvice(); document.removeEventListener("keydown", onEsc); } });

      /* 先把事项行加入表体 */
      tbody.appendChild(tr);

      /* 实时联动：改本年度预算值 → 保存（API 或本地草稿） */
      function persist() {
        const amt = parseInt(applyInput.value, 10) || 0;
        persistAmount(r, amt);
        if (adviceOverlay.style.display !== "none") refreshAdvice();
      }
      applyInput.addEventListener("input", () => { applySlider.value = applyInput.value; persist(); });
      applySlider.addEventListener("input", () => { applyInput.value = applySlider.value; persist(); });
    });
    table.appendChild(tbody);
    dualBox.appendChild(table);
  }

  /* 财务会计视角：按会计科目聚合（本年度预算值合计） */
  function renderAccountView() {
    dualBox.innerHTML = "";
    const loading = el("div", "hint-text", "正在加载科目字典…");
    dualBox.appendChild(loading);

    const buildTable = (acctName) => {
      dualBox.innerHTML = "";
      const table = el("table");
      table.innerHTML = `<thead><tr>
        <th>科目编码</th><th>科目名称</th>
        <th style="text-align:right">经济事项数</th>
        <th style="text-align:right">金额合计（本年度预算值）</th>
      </tr></thead>`;
      const tb = el("tbody");
      aggBy((d) => d.acctCode).forEach((row) => {
        const tr = el("tr");
        tr.innerHTML = `<td><b>${esc(row.key)}</b></td>
          <td>${esc(acctName[row.key] || "—")}</td>
          <td class="tbl-num" style="text-align:right">${row.events}</td>
          <td class="tbl-num" style="text-align:right"><b>${BM.money(row.amount)}</b></td>`;
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      dualBox.appendChild(table);
    };

    const fallback = () => {
      const acctName = {};
      (BM.RULES || []).forEach((r) => { if (r.acctCode && !acctName[r.acctCode]) acctName[r.acctCode] = r.cat; });
      buildTable(acctName);
    };

    if (BM.subjectCache) {
      buildTable(BM.subjectCache);
      return;
    }
    if (typeof fetch !== "function") { fallback(); return; }
    BM.apiGet("/api/subjects")
      .then((subjects) => {
        const acctName = {};
        (subjects || []).forEach((s) => { if (s.code) acctName[s.code] = s.name || "—"; });
        (BM.RULES || []).forEach((r) => { if (r.acctCode && !acctName[r.acctCode]) acctName[r.acctCode] = r.cat; });
        BM.subjectCache = acctName;
        buildTable(acctName);
      })
      .catch(() => fallback());
  }

  function renderDual(mode) {
    dualBox.innerHTML = "";
    Object.keys(dualBtns).forEach((k) => dualBtns[k].classList.toggle("active", k === mode));
    if (mode === "account") renderAccountView();
    else renderFillTable();
  }
  Object.keys(dualBtns).forEach((k) => dualBtns[k].addEventListener("click", () => renderDual(k)));
  renderDual("event");

  /* 编制页已收敛为两个视角（Sponsor 定稿）：经济事项视角（8 列填报表）/ 财务会计视角（科目聚合）。
   * 原「独立经济事项填报表」与「压降参数试算」已按松哥要求移除，不在此页显示。 */


  /* 操作按钮 */
  const actions = el("div", "plan-actions");
  const saveBtn = el("button", "btn btn-primary", "保存草稿");
  const submitBtn = el("button", "btn btn-accent", "提交编制 → 汇总");
  const resetBtn = el("button", "btn btn-outline", "清空草稿");
  actions.appendChild(saveBtn);
  actions.appendChild(submitBtn);
  actions.appendChild(resetBtn);
  actions.appendChild(el("span", "hint-text", "保存草稿后刷新页面仍可恢复；提交后进入汇总/审批流"));
  page.appendChild(actions);

  saveBtn.addEventListener("click", () => {
    if (BM.apiMode) { BM.toast("✅ 数据已实时保存到数据库（SQLite）"); return; }
    const items = {}, monthly = {}, method = {};
    tbody.querySelectorAll("tr").forEach((row) => {
      const nameCell = row.querySelector("td b");
      if (!nameCell) return;
      const cat = nameCell.textContent;
      const apply = row.querySelector(".cmp-apply");
      if (!apply) return;
      const amt = parseInt(apply.value, 10) || 0;
      const ctrl = BM.CTRL_METHOD_ASSIGN[cat] || "history"; /* 预算控制方法由上级定义，随行记录但不可改 */
      const saved = (draft.monthly && draft.monthly[cat]) || null;
      items[cat] = { amount: amt, reason: "", method: ctrl };
      monthly[cat] = saved && saved.length === 12 ? saved.slice() : BM.calc.decomposeMonthly(amt);
      method[cat] = ctrl;
    });
    BM.compileSaveDraft({ items, monthly, method });
    BM.toast("✅ 编制草稿已保存");
  });

  submitBtn.addEventListener("click", () => {
    if (BM.apiMode) {
      BM.toast("✅ 编制已提交（模块演示：汇总/审批流程待接入）");
      return;
    }
    /* 先存草稿，再进入提交流 */
    saveBtn.click();
    if (role === "adminHead") { BM.planSubmit(); BM.toast("✅ 已提交，等待公司预算管理员汇总"); }
    else if (role === "companyBudgeter") { BM.planSubmit(); BM.toast("✅ 已提交，等待集团审批"); }
    else { BM.toast("✅ 编制已提交（待汇总）"); }
    BM.openView("compile");
  });

  resetBtn.addEventListener("click", () => {
    if (BM.apiMode) { BM.toast("数据库模式：请直接修改数值，无需清空草稿"); return; }
    BM.compileSaveDraft({ items: {}, monthly: {}, method: {} });
    BM.toast("已清空草稿");
    BM.openView("compile");
  });

  container.appendChild(page);
}

/* 供「汇总平衡」视图等复用同一份经济事项数据源（API 优先，离线回退 mock） */
BM.buildCompileSource = function () {
  return BM.eventsData && BM.eventsData.length ? BM.eventsData : buildMockList();
};

window.BM.renderCompile = renderCompile;
window.BM = BM;
