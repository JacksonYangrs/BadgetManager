/* ================================================================
 * monthly-split.js — 月度预算拆解二级页（重设计：手动编辑 12 个月为主）
 * 主交互：直接编辑 12 个月金额（手动式调整），占比/同比实时联动
 * 总量守恒：年度总额锁定，本页所有月份合计 = 年度总额
 * 工具：套用上年分布 / 均摊剩余（仅作用于未锁定月） / 单月锁定 🔒
 * 辅助：折叠的「微调分布」条形（拖动分隔线做微调，非主交互）
 * 入口：编制主表每行「月度分解 ›」；保存写回草稿 monthly[cat]
 * ================================================================ */
var BM = window.BM || {};

function el2(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function esc2(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

BM.renderMonthlySplit = function (container) {
  const st = BM.state.monthlySplit || {};
  const cat = st.cat;
  const total = Math.round(st.total || 0);
  container.innerHTML = "";
  const page = el2("div", "page");

  if (!cat) {
    page.appendChild(el2("div", "empty", "未选择经济事项，请从「预算编制」页进入"));
    container.appendChild(page);
    return;
  }

  /* 去年实际月度（用于同比与套用分布；无数据则用默认季节性占比） */
  const baseRatio = BM.baseMonthlyRatio.slice();
  const baseAmounts = BM.decomposeByRatio(total, baseRatio);

  /* 当前编辑态：金额数组（优先 monthly，否则按 ratio/默认分解） */
  let curAmounts;
  if (Array.isArray(st.monthly) && st.monthly.length === 12) {
    curAmounts = st.monthly.map((x) => Math.round(x || 0));
  } else if (Array.isArray(st.ratio) && st.ratio.length === 12) {
    curAmounts = BM.decomposeByRatio(total, st.ratio);
  } else {
    curAmounts = BM.decomposeByRatio(total, baseRatio);
  }
  const locked = new Array(12).fill(false); /* 锁定态：均摊/套用时不改这些月 */

  /* ---- 页头 ---- */
  const head = el2("div", "page-head");
  head.appendChild(
    el2("div", "", `<div class="page-title">月度预算拆解 · ${esc2(cat)}</div>
      <div class="page-desc">年度预算总额 <b>${BM.money(total)}</b>（锁定）· 直接编辑 12 个月金额 · 本页合计自动等于年度总额</div>`)
  );
  page.appendChild(head);

  /* ---- 工具条 ---- */
  const barRow = el2("div", "filter-bar");
  barRow.style.justifyContent = "space-between";
  const leftTools = el2("div", "ms-tools");
  const backBtn = el2("button", "btn btn-outline btn-sm", "← 返回编制");
  backBtn.addEventListener("click", () => BM.openView("compile"));
  const applyBtn = el2("button", "btn btn-ghost btn-sm", "套用上年分布");
  applyBtn.addEventListener("click", () => {
    const rem = total - lockedSum();
    if (rem <= 0) { BM.toast("锁定月份已占满总额，无法套用"); return; }
    const free = locked.map((l) => (l ? 0 : 1));
    const fSum = free.reduce((a, b) => a + b, 0);
    for (let i = 0; i < 12; i++) {
      if (locked[i]) continue;
      curAmounts[i] = Math.round((baseAmounts[i] / (baseFreeSum())) * rem);
    }
    rebalanceTail();
    render();
  });
  const avgBtn = el2("button", "btn btn-ghost btn-sm", "均摊剩余");
  avgBtn.addEventListener("click", () => {
    const rem = total - lockedSum();
    const free = locked.filter((l) => !l);
    const fCount = free.length;
    if (fCount === 0) { BM.toast("没有未锁定的月份可均摊"); return; }
    const each = Math.round(rem / fCount);
    let acc = 0;
    for (let i = 0; i < 12; i++) { if (!locked[i]) { curAmounts[i] = (acc < fCount - 1) ? each : (rem - each * (fCount - 1)); acc++; } }
    render();
  });
  leftTools.appendChild(backBtn);
  leftTools.appendChild(applyBtn);
  leftTools.appendChild(avgBtn);
  barRow.appendChild(leftTools);

  /* 模式切换：手动编辑 / 微调分布 */
  const modeWrap = el2("div", "ms-mode");
  const mEdit = el2("button", "btn btn-sm btn-active", "✎ 手动编辑");
  const mTune = el2("button", "btn btn-sm btn-outline", "⇆ 微调分布");
  mEdit.addEventListener("click", () => { setMode("edit"); });
  mTune.addEventListener("click", () => { setMode("tune"); });
  modeWrap.appendChild(mEdit);
  modeWrap.appendChild(mTune);
  barRow.appendChild(modeWrap);
  page.appendChild(barRow);

  /* ---- 手动编辑表（默认显示） ---- */
  const editWrap = el2("div", "ms-edit");
  const tbl = el2("div", "ms-table");
  /* 表头 */
  const thead = el2("div", "ms-tr ms-thead");
  ["月份", "金额（元）", "占全年", "同比去年", "偏移", "操作"].forEach((h) => thead.appendChild(el2("div", "ms-th", h)));
  tbl.appendChild(thead);

  const rows = [];
  for (let i = 0; i < 12; i++) {
    const tr = el2("div", "ms-tr");
    const mTd = el2("div", "ms-td ms-td-month", (i + 1) + " 月");
    const inpTd = el2("div", "ms-td");
    const inp = el2("input", "ms-input");
    inp.type = "number"; inp.step = "1000"; inp.min = "0"; inp.title = (i + 1) + " 月金额";
    inpTd.appendChild(inp);
    const pctTd = el2("div", "ms-td ms-td-pct", "");
    const yoyTd = el2("div", "ms-td ms-td-yoy", "");
    const barTd = el2("div", "ms-td ms-td-bar");
    const off = el2("div", "ms-off");
    const offFill = el2("div", "ms-off-fill");
    off.appendChild(offFill);
    const offBase = el2("div", "ms-off-base");
    barTd.appendChild(off); barTd.appendChild(offBase);
    const opTd = el2("div", "ms-td ms-td-op");
    const lockBtn = el2("button", "ms-lock", "🔓");
    lockBtn.title = "锁定该月（均摊/套用时不变）";
    lockBtn.addEventListener("click", () => {
      locked[i] = !locked[i];
      lockBtn.textContent = locked[i] ? "🔒" : "🔓";
      lockBtn.classList.toggle("locked", locked[i]);
      tr.classList.toggle("is-locked", locked[i]);
      render();
    });
    opTd.appendChild(lockBtn);
    tr.appendChild(mTd); tr.appendChild(inpTd); tr.appendChild(pctTd);
    tr.appendChild(yoyTd); tr.appendChild(barTd); tr.appendChild(opTd);
    tbl.appendChild(tr);
    rows.push({ inp, pctTd, yoyTd, offFill, offBase, tr, lockBtn });
  }
  editWrap.appendChild(tbl);
  page.appendChild(editWrap);

  /* ---- 微调分布（默认隐藏，折叠） ---- */
  const tuneWrap = el2("div", "ms-tune");
  tuneWrap.style.display = "none";
  tuneWrap.appendChild(el2("div", "ms-label", "本年度预算分解 · 拖动分隔线微调（总量仍 = 年度总额）"));
  const curBar = el2("div", "ms-bar ms-cur");
  const segs = [], divs = [];
  let curRatio = curAmounts.map((a) => (total ? a / total : 1 / 12));
  for (let i = 0; i < 12; i++) {
    const s = el2("div", "ms-seg" + (i % 2 ? " alt" : ""));
    s.style.width = (curRatio[i] * 100) + "%";
    curBar.appendChild(s); segs.push(s);
    if (i < 11) { const dv = el2("div", "ms-divider"); curBar.appendChild(dv); divs.push(dv); }
  }
  tuneWrap.appendChild(curBar);
  const scale = el2("div", "ms-scale");
  for (let i = 0; i < 12; i++) scale.appendChild(el2("span", "", (i + 1) + " 月"));
  tuneWrap.appendChild(scale);

  /* 微调模式实时数据面板：拖动时同步显示每月金额/占比，避免只有条形图像玩具 */
  const tuneData = el2("div", "ms-tune-data");
  const tuneCells = [];
  for (let i = 0; i < 12; i++) {
    const cell = el2("div", "ms-tune-cell");
    cell.innerHTML = `<b>${i + 1} 月</b><span class="ms-tune-amt"></span><span class="ms-tune-pct"></span>`;
    tuneData.appendChild(cell);
    tuneCells.push(cell);
  }
  tuneWrap.appendChild(tuneData);

  tuneWrap.appendChild(el2("div", "ms-tip", "拖动分隔线：相邻两月此消彼长，仅做微调；精确填数请在「手动编辑」。上方数字随拖动实时刷新。"));
  page.appendChild(tuneWrap);

  /* ---- 合计状态条 ---- */
  const totalLine = el2("div", "plan-statusbar ms-total");
  page.appendChild(totalLine);

  /* ---- 保存 ---- */
  const actions = el2("div", "plan-actions");
  const saveBtn = el2("button", "btn btn-primary", "保存拆解并返回");
  actions.appendChild(saveBtn);
  actions.appendChild(el2("span", "hint-text", "保存后写回该经济事项的月度分解，返回编制页可见"));
  page.appendChild(actions);

  /* ---------- 逻辑函数 ---------- */
  function lockedSum() { return curAmounts.reduce((a, b, i) => a + (locked[i] ? b : 0), 0); }
  function baseFreeSum() { /* 去年未锁定月占比之和，用于套用时按比例分配 */ return baseRatio.reduce((a, b, i) => a + (locked[i] ? 0 : b), 0) || 1; }
  function rebalanceTail() {
    /* 把合计与总额的差补到最后一个未锁定月，保证严格相等 */
    const sum = curAmounts.reduce((a, b) => a + b, 0);
    const diff = total - sum;
    for (let i = 11; i >= 0; i--) { if (!locked[i]) { curAmounts[i] += diff; return; } }
  }
  function setMode(m) {
    if (m === "edit") { editWrap.style.display = ""; tuneWrap.style.display = "none"; mEdit.className = "btn btn-sm btn-active"; mTune.className = "btn btn-sm btn-outline"; }
    else { editWrap.style.display = "none"; tuneWrap.style.display = ""; mTune.className = "btn btn-sm btn-active"; mEdit.className = "btn btn-sm btn-outline"; }
  }

  function render() {
    const sum = curAmounts.reduce((a, b) => a + b, 0);
    let maxAmt = Math.max.apply(null, curAmounts.concat([1]));
    for (let i = 0; i < 12; i++) {
      rows[i].inp.value = curAmounts[i];
      const pct = total ? (curAmounts[i] / total) * 100 : 0;
      rows[i].pctTd.textContent = (Math.round(pct * 10) / 10) + "%";
      const yoy = baseAmounts[i] ? ((curAmounts[i] - baseAmounts[i]) / baseAmounts[i]) * 100 : 0;
      rows[i].yoyTd.textContent = (yoy >= 0 ? "+" : "") + (Math.round(yoy * 10) / 10) + "%";
      rows[i].yoyTd.className = "ms-td ms-td-yoy " + (yoy > 1 ? "up" : yoy < -1 ? "down" : "");
      /* 偏移条：深蓝=今年金额，灰标=去年金额标尺 */
      rows[i].offFill.style.width = Math.min(100, (curAmounts[i] / maxAmt) * 100) + "%";
      rows[i].offBase.style.left = Math.min(100, (baseAmounts[i] / maxAmt) * 100) + "%";
    }
    const ok = sum === total;
    const diff = total - sum;
    totalLine.innerHTML = '月度合计 <b>' + BM.money(sum) + '</b> ' +
      '<span class="badge ' + (ok ? "badge-ok" : (diff > 0 ? "badge-danger" : "badge-warn")) + '">' +
      (ok ? "= 年度总额 ✓" : (diff > 0 ? "还差 " + BM.money(diff) : "超出 " + BM.money(-diff))) + "</span>" +
      '<span class="hint-text" style="margin-left:10px">锁定 ' + locked.filter(Boolean).length + ' 个月</span>';
    /* 同步微调模式比例与分隔线位置 */
    curRatio = curAmounts.map((a) => (total ? a / total : 1 / 12));
    segs.forEach((s, i) => { s.style.width = (curRatio[i] * 100) + "%"; });
    let acc = 0; for (let i = 0; i < 11; i++) { acc += curRatio[i]; divs[i].style.left = (acc * 100) + "%"; }
    /* 同步微调模式实时数据面板 */
    tuneCells.forEach((cell, i) => {
      cell.querySelector(".ms-tune-amt").textContent = BM.money(curAmounts[i]);
      cell.querySelector(".ms-tune-pct").textContent = (Math.round(curRatio[i] * 1000) / 10) + "%";
      cell.classList.toggle("is-locked", locked[i]);
    });
  }

  /* ---------- 事件：手动输入（直接改该月金额，其余不变，差额在合计提示） ---------- */
  rows.forEach((r, i) => {
    r.inp.addEventListener("input", () => {
      let v = parseInt(r.inp.value, 10);
      if (!Number.isFinite(v) || v < 0) v = 0;
      if (v > total) { v = total; r.inp.value = total; }
      curAmounts[i] = v;
      render();
    });
    r.inp.addEventListener("blur", rebalanceTailAndRender);
  });
  function rebalanceTailAndRender() {
    /* 失焦时把差额补平到最后一个未锁定月，保持合计 = 总额 */
    const sum = curAmounts.reduce((a, b) => a + b, 0);
    if (sum !== total) rebalanceTail();
    render();
  }

  /* ---------- 事件：微调分隔线拖动（仅辅助） ---------- */
  let dragging = -1;
  divs.forEach((dv, idx) => {
    dv.addEventListener("pointerdown", (e) => { e.preventDefault(); dragging = idx; dv.setPointerCapture(e.pointerId); });
    dv.addEventListener("pointermove", (e) => {
      if (dragging !== idx) return;
      const rect = curBar.getBoundingClientRect();
      if (!rect.width) return;
      let acc = 0; for (let k = 0; k <= idx; k++) acc += curRatio[k];
      const target = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / rect.width));
      const delta = target - acc;
      const a = curRatio[idx] + delta, b = curRatio[idx + 1] - delta;
      if (a >= 0.01 && b >= 0.01) { curRatio[idx] = a; curRatio[idx + 1] = b; }
      curAmounts = BM.decomposeByRatio(total, curRatio);
      render();
    });
    dv.addEventListener("pointerup", () => { dragging = -1; });
    dv.addEventListener("pointercancel", () => { dragging = -1; });
  });

  /* ---------- 保存 ---------- */
  saveBtn.addEventListener("click", () => {
    rebalanceTail();
    const out = curAmounts.slice();
    if (BM.apiMode && st.id != null && Number.isFinite(Number(st.id))) {
      fetch("/api/events/" + st.id + "/monthly", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthly: out }),
      }).then((res) => res.json()).then(() => {
        BM.toast("✅ 月度拆解已保存到数据库：" + cat); BM.openView("compile");
      }).catch(() => BM.toast("保存失败：后端不可用"));
      return;
    }
    const draft = BM.compileLoadDraft();
    const monthly = Object.assign({}, draft.monthly || {});
    monthly[cat] = out;
    BM.compileSaveDraft({ items: draft.items || {}, monthly: monthly, method: draft.method || {} });
    BM.state.monthlySplit.monthly = out.slice();
    BM.toast("✅ 月度拆解已保存：" + cat);
    BM.openView("compile");
  });

  render();
  container.appendChild(page);
};

window.BM = BM;
