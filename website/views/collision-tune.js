/* ================================================================
 * collision-tune.js — M5 碰撞协商「即时反馈调参界面」原型（v0.7 · P0）
 * 交互（产品设计稿 V1 §3.0.4）：
 *   左侧滑块调参（申报额 / 压降比率 / 压降幅度，三滑块联动），
 *   右侧实时刷新 差异额 / 差异比例 / 可压降空间 / 协商确认额 / 同类对标。
 *   不提交即可边调边看，确认后回写争议项并留痕。
 * 计算：全部走 BM.calc.tuneNegotiation（确定性纯函数，可单测）。
 * 范围：cooLead / legalHead / adminHead 可见（集团提压降、法人子公司试反馈）。
 * ================================================================ */

var BM = window.BM || {};



function companyName(code) {
  const c = BM.COMPANIES.find((x) => x.code === code);
  return c ? c.name : code;
}

/* 取某争议项的对标样本（同类公司同科目预算数组） */
function benchmarkSample(catName) {
  const map = BM.BENCHMARK[catName];
  if (!map) return [];
  return Object.keys(map).map((k) => map[k]);
}

/* 当前选中的争议项 id（localStorage 记忆，避免每次切回重置） */
function tuneCurId() {
  let id = null;
  try { id = localStorage.getItem("bm-tune-id"); } catch (e) {}
  const items = BM.state.collisions || [];
  if (!id || !items.find((x) => x.id === id)) id = items.length ? items[0].id : null;
  return id;
}

/* 本地调参状态（apply / ratio），按争议项记忆 */
const TUNE_STATE = {};

function renderCollisionTune(container) {
  container.innerHTML = "";
  const page = el("div", "page");

  /* ---- 页头 ---- */
  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">碰撞调参 · 即时反馈</div>
      <div class="page-desc">拖滑块试算压降方案：调「申报额 / 压降比率 / 压降幅度」，右侧实时刷新差异与同类对标 · 对应 M5 协商闭环（§3.0.4）</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "collisionTune");

  const items = BM.state.collisions || [];
  if (!items.length) {
    page.appendChild(el("div", "empty", `<div class="empty-ico">⚖</div>暂无碰撞争议项，请先在「碰撞」中生成争议。`));
    container.appendChild(page);
    return;
  }

  const curId = tuneCurId();
  const cur = items.find((x) => x.id === curId);

  /* ---- 争议项选择 ---- */
  const selRow = el("div", "filter-bar");
  selRow.style.marginBottom = "14px";
  const sel = el("select");
  sel.innerHTML = items.map((c) =>
    `<option value="${c.id}" ${c.id === curId ? "selected" : ""}>${esc(c.cat)} · ${esc(companyName(c.company))}（${c.status}）</option>`
  ).join("");
  sel.addEventListener("change", () => {
    try { localStorage.setItem("bm-tune-id", sel.value); } catch (e) {}
    renderCollisionTune(container);
  });
  selRow.appendChild(el("span", "hint-text", "争议项："));
  selRow.appendChild(sel);
  page.appendChild(selRow);

  /* ---- 两栏布局：左调参 / 右即时结果 ---- */
  const grid = el("div", "tune-grid");

  /* ============ 左：调参面板 ============ */
  const left = el("div", "tune-panel");

  /* 集团建议值（基线，确定性，来自规则） */
  const baseline = cur.suggest;
  const bounds = BM.calc.tuneBounds(baseline);
  const sample = benchmarkSample(cur.cat);

  /* 初始化本地状态（记忆前次滑块值，否则取争议项当前申报额） */
  if (!TUNE_STATE[cur.id]) {
    TUNE_STATE[cur.id] = { apply: cur.apply, ratio: 0.1 };
  }
  const T = TUNE_STATE[cur.id];
  /* 保证 apply 落在边界内 */
  T.apply = Math.min(bounds.applyMax, Math.max(bounds.applyMin, T.apply));

  const panelHead = el("div", "tune-panel-head");
  panelHead.innerHTML = `<div class="tune-ph-title">${esc(cur.cat)} · ${esc(companyName(cur.company))}</div>
    <div class="tune-ph-sub">2025 实际 ${BM.money(cur.lastYear || 0)} · 集团建议值（基线） <b>${BM.money(baseline)}</b></div>`;
  left.appendChild(panelHead);

  /* 滑块行构造：label + 实时数值（真实元素引用，避免依赖 innerHTML 解析） */
  function makeSliderRow(labelText) {
    const row = el("div", "slider-row");
    const lab = el("div", "slider-label");
    lab.appendChild(el("span", null, labelText));
    const val = el("b", "slider-val");
    lab.appendChild(val);
    row.appendChild(lab);
    return { row: row, val: val };
  }

  /* 滑块 1：申报额 */
  const sApply = makeSliderRow("申报额");
  sApply.val.textContent = BM.money(T.apply);
  const applyInput = el("input", "range");
  applyInput.type = "range";
  applyInput.min = bounds.applyMin;
  applyInput.max = bounds.applyMax;
  applyInput.step = bounds.applyStep;
  applyInput.value = T.apply;
  sApply.row.appendChild(applyInput);
  left.appendChild(sApply.row);

  /* 滑块 2：压降比率 */
  const sRatio = makeSliderRow("压降比率");
  sRatio.val.textContent = (T.ratio * 100).toFixed(1) + "%";
  const ratioInput = el("input", "range");
  ratioInput.type = "range";
  ratioInput.min = 0;
  ratioInput.max = 30;
  ratioInput.step = 0.5;
  ratioInput.value = (T.ratio * 100).toFixed(1);
  sRatio.row.appendChild(ratioInput);
  left.appendChild(sRatio.row);

  /* 滑块 3：压降幅度（金额，联动） */
  const sCut = makeSliderRow("压降幅度（金额）");
  sCut.val.textContent = BM.money(Math.round(T.apply * T.ratio));
  const cutInput = el("input", "range");
  cutInput.type = "range";
  cutInput.min = 0;
  cutInput.max = Math.max(bounds.applyStep, Math.round(T.apply * 0.3));
  cutInput.step = bounds.applyStep;
  cutInput.value = Math.round(T.apply * T.ratio);
  sCut.row.appendChild(cutInput);
  left.appendChild(sCut.row);

  /* 确认按钮 */
  const note = el("textarea");
  note.rows = 2;
  note.className = "coll-textarea";
  note.placeholder = "协商说明 / 业务依据（可选）…";
  note.id = "tuneNote";
  left.appendChild(el("div", "coll-field-label", "协商说明（业务依据）："));
  left.appendChild(note);

  const actions = el("div", "plan-actions");
  const confirmBtn = el("button", "btn btn-primary", "确认协商方案");
  confirmBtn.id = "confirmTune";
  actions.appendChild(confirmBtn);
  const resetBtn = el("button", "btn btn-outline", "恢复初始申报");
  actions.appendChild(resetBtn);
  left.appendChild(actions);

  grid.appendChild(left);

  /* ============ 右：即时结果面板 ============ */
  const right = el("div", "tune-result");
  right.id = "tuneResult";
  grid.appendChild(right);

  page.appendChild(grid);
  container.appendChild(page);

  /* ---- 实时计算 + 渲染右侧 ---- */
  function recompute() {
    const r = BM.calc.tuneNegotiation({
      baseline: baseline,
      apply: T.apply,
      reductionRatio: T.ratio,
      benchmark: sample,
      acceptThreshold: 0.05,
    });
    renderResult(right, r, cur, baseline, sample);
    /* 同步派生显示（直接引用元素，避免依赖 innerHTML 解析） */
    sApply.val.textContent = BM.money(T.apply);
    sRatio.val.textContent = (T.ratio * 100).toFixed(1) + "%";
    sCut.val.textContent = BM.money(r.cut);
    return r;
  }

  /* 滑块事件（input 实时触发，不丢焦点） */
  applyInput.addEventListener("input", () => {
    T.apply = Math.round(+applyInput.value);
    /* 同步压降幅度上限（比率不变，幅度随申报额变化） */
    cutInput.max = Math.max(bounds.applyStep, Math.round(T.apply * 0.3));
    cutInput.value = Math.round(T.apply * T.ratio);
    ratioInput.value = (T.ratio * 100).toFixed(1);
    recompute();
  });

  ratioInput.addEventListener("input", () => {
    T.ratio = Math.min(0.3, Math.max(0, +ratioInput.value / 100));
    cutInput.value = Math.round(T.apply * T.ratio);
    recompute();
  });

  cutInput.addEventListener("input", () => {
    const cut = Math.round(+cutInput.value);
    T.ratio = T.apply > 0 ? Math.min(0.3, cut / T.apply) : 0;
    ratioInput.value = (T.ratio * 100).toFixed(1);
    recompute();
  });

  confirmBtn.addEventListener("click", () => {
    const r = recompute();
    BM.confirmTuneAgreement(cur.id, r.agreed, (note.value || "").trim());
    BM.toast("✅ 已确认「" + cur.cat + "」协商方案：" + BM.money(r.agreed));
    renderCollisionTune(container);
  });

  resetBtn.addEventListener("click", () => {
    T.apply = cur.apply;
    T.ratio = 0.1;
    applyInput.value = T.apply;
    ratioInput.value = 10;
    cutInput.max = Math.max(bounds.applyStep, Math.round(T.apply * 0.3));
    cutInput.value = Math.round(T.apply * T.ratio);
    recompute();
  });

  recompute();
}

/* 右侧即时结果渲染（纯展示，数据来自确定性计算 r） */
function renderResult(box, r, cur, baseline, sample) {
  box.innerHTML = "";

  /* 共识判定条 */
  const acceptBadge = r.accepted
    ? `<span class="badge badge-ok">可达成共识（差异 ≤ 5%）</span>`
    : `<span class="badge badge-warn">仍有差距（差异 &gt; 5%）</span>`;
  box.appendChild(el("div", "tune-result-head",
    `<div class="trh-title">即时结果</div><div class="trh-badge">${acceptBadge}</div>`));

  /* KPI 网格 */
  const kpi = el("div", "kpi-grid");
  const diffApplyCls = r.diffApply >= 0 ? "var(--c-danger)" : "var(--c-ok)";
  const diffAgreedCls = r.diffAgreed >= 0 ? "var(--c-danger)" : "var(--c-ok)";
  kpi.appendChild(kpiCard("申报 vs 建议 差异额",
    (r.diffApply >= 0 ? "+" : "") + BM.money(r.diffApply),
    "申报 − 集团建议", diffApplyCls));
  kpi.appendChild(kpiCard("差异比例（压降前）",
    (r.diffApplyPct >= 0 ? "+" : "") + (r.diffApplyPct * 100).toFixed(1) + "%",
    "相对建议基线", diffApplyCls));
  kpi.appendChild(kpiCard("可压降空间",
    r.reducible > 0 ? BM.money(r.reducible) : "无需压降",
    r.reducible > 0 ? "申报超出建议部分" : "申报未超建议",
    r.reducible > 0 ? "var(--c-warn)" : "var(--c-ok)"));
  kpi.appendChild(kpiCard("协商后差异比例",
    (r.diffAgreedPct >= 0 ? "+" : "") + (r.diffAgreedPct * 100).toFixed(1) + "%",
    "协商确认 − 建议", diffAgreedCls));
  box.appendChild(kpi);

  /* 协商确认额 + 压降幅度 */
  const agreedCard = el("div", "tune-agreed-show");
  agreedCard.innerHTML = `<div class="tas-item"><span class="hint-text">协商确认额</span><b>${BM.money(r.agreed)}</b></div>
    <div class="tas-item"><span class="hint-text">压降幅度</span><b style="color:var(--c-warn)">−${BM.money(r.cut)}</b><span class="hint-text">（${ (r.ratio * 100).toFixed(1) }%）</span></div>
    <div class="tas-item"><span class="hint-text">集团建议值</span><b>${BM.money(baseline)}</b></div>`;
  box.appendChild(agreedCard);

  /* 差异可视化（压降前 vs 压降后） */
  box.appendChild(el("div", "section-title", "差异收敛"));
  box.appendChild(diffBar("压降前（申报 vs 建议）", r.diffApplyPct, "var(--c-danger)"));
  box.appendChild(diffBar("协商后（确认 vs 建议）", r.diffAgreedPct, r.accepted ? "var(--c-ok)" : "var(--c-warn)"));

  /* 同类对标分布条 */
  box.appendChild(el("div", "section-title", "同类公司横向对标 · " + esc(cur.cat)));
  if (sample.length) {
    box.appendChild(benchBar(r, baseline, sample));
    const posPct = Math.round(r.position * 100);
    const devTxt = (r.devFromAvg >= 0 ? "+" : "") + (r.devFromAvg * 100).toFixed(1) + "%";
    box.appendChild(el("div", "plan-statusbar",
      `<span class="hint-text">协商确认额位于同类区间第 <b>${posPct}%</b> 分位（${BM.money(r.bmMin)} ~ ${BM.money(r.bmMax)}），与集团均值偏差 <b style="color:${r.devFromAvg >= 0 ? "var(--c-danger)" : "var(--c-ok)"}">${devTxt}</b>。</span>`));
  } else {
    box.appendChild(el("div", "empty", "该科目暂无对标样本。"));
  }

  /* M5 状态机提示 */
  box.appendChild(el("div", "tune-foot",
    `协商状态机：总部建议 → 子公司反馈 → 接受/再调整 → 确认（回写批准版）。本页试算结果确认后即写入争议项并留痕。`));
}

function kpiCard(label, value, sub, color) {
  const c = el("div", "kpi");
  c.innerHTML = `<div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value" style="color:${color};font-size:20px">${esc(value)}</div>
    <div class="kpi-sub">${esc(sub)}</div>`;
  return c;
}

function diffBar(title, pct, color) {
  const wrap = el("div", "diff-bar-row");
  const w = Math.min(100, Math.abs(pct) * 100);
  const sign = pct >= 0 ? "+" : "−";
  wrap.innerHTML = `<div class="dbr-title">${esc(title)}</div>
    <div class="dbr-track"><div class="dbr-fill" style="width:${w}%;background:${color}"></div></div>
    <div class="dbr-val" style="color:${color}">${sign}${Math.abs(pct * 100).toFixed(1)}%</div>`;
  return wrap;
}

/* 对标分布条：bmMin..bmMax 上打 集团均值 / 建议基线 / 协商确认额 三个点 */
function benchBar(r, baseline, sample) {
  const wrap = el("div", "bench-bar-wrap");
  const track = el("div", "bench-track");
  /* 均值点 */
  const avgPos = r.bmMax > r.bmMin ? (r.bmAvg - r.bmMin) / (r.bmMax - r.bmMin) : 0.5;
  const avgDot = el("div", "bench-dot bench-avg");
  avgDot.style.left = (Math.min(1, Math.max(0, avgPos)) * 100) + "%";
  avgDot.title = "集团均值 " + BM.money(r.bmAvg);
  /* 基线点 */
  const basePos = r.bmMax > r.bmMin ? (baseline - r.bmMin) / (r.bmMax - r.bmMin) : 0.5;
  const baseDot = el("div", "bench-dot bench-base");
  baseDot.style.left = (Math.min(1, Math.max(0, basePos)) * 100) + "%";
  baseDot.title = "集团建议值 " + BM.money(baseline);
  /* 协商确认点 */
  const agDot = el("div", "bench-dot bench-agreed");
  agDot.style.left = (r.position * 100) + "%";
  agDot.title = "协商确认额 " + BM.money(r.agreed);
  track.appendChild(avgDot);
  track.appendChild(baseDot);
  track.appendChild(agDot);
  wrap.appendChild(track);
  const legend = el("div", "bench-legend");
  legend.innerHTML = `<span><i class="bl-dot bench-avg"></i>集团均值 ${BM.money(r.bmAvg)}</span>
    <span><i class="bl-dot bench-base"></i>建议基线 ${BM.money(baseline)}</span>
    <span><i class="bl-dot bench-agreed"></i>协商确认 ${BM.money(r.agreed)}</span>`;
  wrap.appendChild(legend);
  return wrap;
}

window.BM.renderCollisionTune = renderCollisionTune;
window.BM = BM;
