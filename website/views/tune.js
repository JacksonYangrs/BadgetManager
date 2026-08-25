/* ================================================================
 * tune.js — 可嵌入「滑块调参 + 实时结果」组件（v0.13）
 * 复用 M5 碰撞调参模式（产品设计稿 V1 §3.0.4），供编制/压降等
 * 参数调整场景直接挂载。底层计算一律走 BM.calc.tuneNegotiation（确定性）。
 * 计算：金额 / 比率 / 压降 / 差异 全部确定性纯函数，可单测。
 * 用法：
 *   BM.renderReductionTune(container, { subject, baseline, apply, onApply });
 *     subject   科目名（展示）
 *     baseline  规则基线（确定性，来自 BM.applyRule）
 *     apply     初始申报额（可滑块调整）
 *     onApply  确认回调(amount, ratio)
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

/* 本地 KPI 卡（复用既有 .kpi / .kpi-grid 样式） */
function tuneKpi(label, value, sub, color) {
  const c = el("div", "kpi");
  c.innerHTML = `<div class="kpi-label">${esc(label)}</div>
    <div class="kpi-value" style="color:${color || "var(--c-text)"};font-size:18px">${esc(value)}</div>
    <div class="kpi-sub">${esc(sub)}</div>`;
  return c;
}

/* 本地差异条（复用 .diff-bar-row 样式） */
function tuneDiffBar(title, pct, color) {
  const wrap = el("div", "diff-bar-row");
  const w = Math.min(100, Math.abs(pct) * 100);
  const sign = pct >= 0 ? "+" : "−";
  wrap.innerHTML = `<div class="dbr-title">${esc(title)}</div>
    <div class="dbr-track"><div class="dbr-fill" style="width:${w}%;background:${color}"></div></div>
    <div class="dbr-val" style="color:${color}">${sign}${Math.abs(pct * 100).toFixed(1)}%</div>`;
  return wrap;
}

BM.renderReductionTune = function (container, opts) {
  container.innerHTML = "";
  const subject = opts.subject || "科目";
  const baseline = Math.max(0, Math.round(opts.baseline || 0));
  let apply = Math.max(0, Math.round(opts.apply != null ? opts.apply : baseline));
  let ratio = 0.1;

  const bounds = BM.calc.tuneBounds(baseline);

  const panel = el("div", "embed-tune");

  /* 头部 */
  const head = el("div", "et-head");
  head.innerHTML = `<div class="et-title">压降试算 · ${esc(subject)}</div>
    <div class="et-sub">规则基线 <b>${BM.money(baseline)}</b> · 拖动滑块试算压降，边调边看</div>`;
  panel.appendChild(head);

  const grid = el("div", "et-grid");

  /* 左：滑块 */
  const left = el("div", "et-left");
  function makeRow(labelText) {
    const row = el("div", "slider-row");
    const lab = el("div", "slider-label");
    lab.appendChild(el("span", null, labelText));
    const val = el("b", "slider-val");
    lab.appendChild(val);
    row.appendChild(lab);
    return { row, val };
  }

  const sApply = makeRow("申报额");
  sApply.val.textContent = BM.money(apply);
  const applyInput = el("input", "range");
  applyInput.type = "range";
  applyInput.min = bounds.applyMin;
  applyInput.max = bounds.applyMax;
  applyInput.step = bounds.applyStep;
  applyInput.value = apply;
  sApply.row.appendChild(applyInput);
  left.appendChild(sApply.row);

  const sRatio = makeRow("压降比率");
  sRatio.val.textContent = (ratio * 100).toFixed(1) + "%";
  const ratioInput = el("input", "range");
  ratioInput.type = "range";
  ratioInput.min = 0;
  ratioInput.max = 30;
  ratioInput.step = 0.5;
  ratioInput.value = 10;
  sRatio.row.appendChild(ratioInput);
  left.appendChild(sRatio.row);

  if (opts.onApply) {
    const btn = el("button", "btn btn-primary btn-sm", "采用此压降方案");
    btn.style.marginTop = "8px";
    btn.addEventListener("click", () => {
      const r = recompute();
      opts.onApply(r.agreed, ratio);
      BM.toast("✅ 已采用压降方案：" + BM.money(r.agreed));
    });
    left.appendChild(btn);
  }
  grid.appendChild(left);

  /* 右：实时结果 */
  const right = el("div", "et-right");
  right.id = "etResult";
  grid.appendChild(right);

  panel.appendChild(grid);
  container.appendChild(panel);

  function recompute() {
    const r = BM.calc.tuneNegotiation({
      baseline: baseline,
      apply: apply,
      reductionRatio: ratio,
      benchmark: [],
      acceptThreshold: 0.05,
    });
    renderResult(right, r);
    sApply.val.textContent = BM.money(apply);
    sRatio.val.textContent = (ratio * 100).toFixed(1) + "%";
    return r;
  }

  function renderResult(box, r) {
    box.innerHTML = "";
    const diffApplyCls = r.diffApply >= 0 ? "var(--c-danger)" : "var(--c-ok)";
    const diffAgreedCls = r.diffAgreed >= 0 ? "var(--c-danger)" : "var(--c-ok)";
    const kpi = el("div", "kpi-grid");
    kpi.appendChild(tuneKpi("压降幅度", "−" + BM.money(r.cut), "申报 × 比率", "var(--c-warn)"));
    kpi.appendChild(tuneKpi("压降后金额", BM.money(r.agreed), "申报 − 压降", "var(--c-primary)"));
    kpi.appendChild(tuneKpi("与基线差异额", (r.diffAgreed >= 0 ? "+" : "") + BM.money(r.diffAgreed), "压降后 − 基线", diffAgreedCls));
    box.appendChild(kpi);
    box.appendChild(tuneDiffBar("压降前（申报 vs 基线）", r.diffApplyPct, diffApplyCls));
    box.appendChild(tuneDiffBar("压降后（确认 vs 基线）", r.diffAgreedPct, r.accepted ? "var(--c-ok)" : "var(--c-warn)"));
    const note = el("div", "hint-text");
    note.style.marginTop = "6px";
    note.innerHTML = r.accepted
      ? `✅ 差异 ≤ 5%，可达成共识`
      : `⚠️ 与规则基线仍有差距，需附业务依据`;
    box.appendChild(note);
  }

  applyInput.addEventListener("input", () => {
    apply = Math.round(+applyInput.value);
    recompute();
  });
  ratioInput.addEventListener("input", () => {
    ratio = Math.min(0.3, Math.max(0, +ratioInput.value / 100));
    recompute();
  });

  recompute();
};

window.BM = BM;
