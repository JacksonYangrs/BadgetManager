/* ================================================================
 * benchmark.js — 横向对标视角（v0.6 · P1）
 * 选定科目，按各子公司排列预算，自动计算集团均值/红线，
 * 标红偏离超过阈值的单位（对应客户文件2 汇总表横向排列，系统自动标异）。
 * 仅集团层（ceo / cooLead / cooAnalyst）可见。
 * ================================================================ */

var BM = window.BM || {};



/* 偏离阈值：与集团均值偏差 > 10% 即标红 */
const BENCH_THRESHOLD = 0.1;

function renderBenchmark(container) {
  container.innerHTML = "";
  const page = el("div", "page");

  /* ---- 页头 ---- */
  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">横向对标</div>
      <div class="page-desc">同类科目跨子公司横向排列 · 系统自动计算集团均值并标红偏离 · 对应客户「预算汇总表」横向逻辑</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "dashboard");

  /* ---- 科目选择 ---- */
  const cats = Object.keys(BM.BENCHMARK);
  const curCat = state_bench_cat();

  const selRow = el("div", "filter-bar");
  selRow.style.marginBottom = "12px";
  const sel = el("select");
  sel.innerHTML = cats.map((c) => `<option value="${esc(c)}" ${c === curCat ? "selected" : ""}>${esc(c)}</option>`).join("");
  sel.addEventListener("change", () => {
    try { localStorage.setItem("bm-bench-cat", sel.value); } catch (e) {}
    renderBenchmark(container);
  });
  selRow.appendChild(el("span", "hint-text", "对标科目："));
  selRow.appendChild(sel);
  selRow.appendChild(el("span", "hint-text", `偏离阈值：与集团均值偏差 > ${Math.round(BENCH_THRESHOLD * 100)}% 标红`));
  page.appendChild(selRow);

  /* ---- 计算 ---- */
  const data = BM.BENCHMARK[curCat] || {};
  const rows = Object.keys(data).map((code) => {
    const comp = BM.COMPANIES.find((c) => c.code === code) || { name: code };
    return { code, name: comp.name, budget: data[code] };
  }).sort((a, b) => b.budget - a.budget);

  const total = rows.reduce((a, r) => a + r.budget, 0);
  const avg = rows.length ? Math.round(total / rows.length) : 0;

  /* ---- KPI ---- */
  const kpi = el("div", "kpi-grid");
  kpi.appendChild(el("div", "kpi accent", `<div class="kpi-label">参标公司</div><div class="kpi-value">${rows.length}</div><div class="kpi-sub">家子公司</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">集团均值</div><div class="kpi-value">${BM.money(avg)}</div><div class="kpi-sub">对标基准线</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">最高</div><div class="kpi-value">${BM.money(rows.length ? rows[0].budget : 0)}</div><div class="kpi-sub">${esc(rows.length ? rows[0].name : "-")}</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">最低</div><div class="kpi-value">${BM.money(rows.length ? rows[rows.length - 1].budget : 0)}</div><div class="kpi-sub">${esc(rows.length ? rows[rows.length - 1].name : "-")}</div>`));
  page.appendChild(kpi);

  /* ---- 对标表 ---- */
  page.appendChild(el("div", "section-title", `${esc(curCat)} · 各子公司预算对标`));
  const tbl = el("div", "tbl-wrap");
  const table = el("table");
  table.innerHTML = `<thead><tr>
    <th>子公司</th><th style="text-align:right">年度预算</th><th style="text-align:right">与集团均值差</th><th style="width:160px">偏离</th><th>判定</th>
  </tr></thead>`;
  const tbody = el("tbody");

  rows.forEach((r) => {
    const diff = r.budget - avg;
    const diffPct = avg ? Math.round((diff / avg) * 1000) / 10 : 0;
    const deviated = Math.abs(diffPct) / 100 > BENCH_THRESHOLD;
    const tr = el("tr");
    tr.innerHTML = `<td><b>${esc(r.name)}</b></td>
      <td class="tbl-num" style="text-align:right">${BM.money(r.budget)}</td>
      <td class="tbl-num" style="text-align:right;color:${diff < 0 ? "var(--c-ok)" : "var(--c-danger)"}">${diff >= 0 ? "+" : ""}${BM.money(diff)}</td>
      <td><div style="display:flex;align-items:center;gap:8px"><div class="progress" style="flex:1"><div class="progress-fill ${deviated ? "danger" : "ok"}" style="width:${Math.min(Math.abs(diffPct), 100)}%"></div></div><span class="pct">${diffPct}%</span></div></td>
      <td>${deviated
        ? `<span class="badge badge-danger">偏离 ${diffPct > 0 ? "偏高" : "偏低"}</span>`
        : `<span class="badge badge-ok">对标正常</span>`}</td>`;
    tbody.appendChild(tr);
  });

  /* 集团均值行 */
  const avgTr = el("tr");
  avgTr.innerHTML = `<td><b>集团均值（基准线）</b></td>
    <td class="tbl-num" style="text-align:right;font-weight:700">${BM.money(avg)}</td>
    <td class="tbl-num" style="text-align:right">—</td>
    <td colspan="2"><span class="badge badge-info">自动计算</span></td>`;
  tbody.appendChild(avgTr);

  table.appendChild(tbody);
  tbl.appendChild(table);
  page.appendChild(tbl);

  /* ---- 说明 ---- */
  const devList = rows.filter((r) => Math.abs((r.budget - avg) / (avg || 1)) / 100 > BENCH_THRESHOLD);
  if (devList.length) {
    page.appendChild(el("div", "plan-statusbar",
      `<span class="badge badge-danger">${devList.length} 家偏离</span>
       <span class="hint-text">${devList.map((r) => esc(r.name)).join("、")} 与集团均值偏差超阈值，建议复核编制依据或推动集团内对标压降。</span>`));
  } else {
    page.appendChild(el("div", "plan-statusbar",
      `<span class="badge badge-ok">全部对标正常</span>
       <span class="hint-text">当前科目各子公司预算与集团均值偏差均在阈值内。</span>`));
  }

  container.appendChild(page);
}

function state_bench_cat() {
  let c = null;
  try { c = localStorage.getItem("bm-bench-cat"); } catch (e) {}
  if (!c || !BM.BENCHMARK[c]) c = Object.keys(BM.BENCHMARK)[0];
  return c;
}

window.BM.renderBenchmark = renderBenchmark;
window.BM = BM;
