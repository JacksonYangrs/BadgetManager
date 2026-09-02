/* ================================================================
 * final.js — 决算页
 * 全年预算 vs 预计执行（1-9 实际 + 10-12 预测）· 结余/超支处理
 * ================================================================ */

var BM = window.BM || {};



let _finalBox = null;
function renderFinal(container) {
  _finalBox = container;
  container.innerHTML = "";
  const page = el("div", "page");
  const role = BM.state.role;

  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">2026 年度决算</div>
      <div class="page-desc">预算 vs 预计执行对比 · 演示时点 9 月，全年口径含 10-12 预测</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "final");

  /* 汇总 KPI */
  const cats = BM.CATEGORIES;
  const totalBudget = BM.SUMMARY.totalBudget;
  const totalForecast = cats.reduce((a, c) => a + c.yearForecast, 0);
  const totalVar = totalForecast - totalBudget;

  const summary = el("div", "final-summary");
  summary.appendChild(el("div", "kpi accent", `<div class="kpi-label">年度预算总额</div><div class="kpi-value">${BM.money(totalBudget)}</div><div class="kpi-sub">8 个科目</div>`));
  summary.appendChild(el("div", "kpi", `<div class="kpi-label">预计全年执行</div><div class="kpi-value">${BM.money(totalForecast)}</div><div class="kpi-sub">1-9 实际 + 10-12 预测</div>`));
  /* totalVar > 0 = 总超支；< 0 = 总节余 */
  const totalOver = totalVar > 0;
  summary.appendChild(el("div", "kpi", `<div class="kpi-label">预计${totalOver ? "超支" : "节余"}</div><div class="kpi-value" style="color:${totalOver ? "var(--c-danger)" : "var(--c-ok)"}">${totalOver ? "+" : "-"}${BM.money(Math.abs(totalVar))}</div><div class="kpi-sub">${totalOver ? "预算超支" : "预算结余"}</div>`));
  page.appendChild(summary);

  /* 逐科目决算表 */
  page.appendChild(el("div", "section-title", "科目决算明细"));
  const tbl = el("div", "tbl-wrap");
  const table = el("table");
  table.innerHTML = `<thead><tr>
    <th>科目</th><th style="text-align:right">年度预算</th><th style="text-align:right">预计执行</th><th style="text-align:right">差额</th><th>结论</th><th>处理建议</th>
  </tr></thead>`;
  const tbody = el("tbody");

  cats.forEach((c) => {
    const varAmt = c.variance;
    /* varAmt > 0 = 预计 > 预算 = 超支；varAmt < 0 = 预计 < 预算 = 节余 */
    const isOver = varAmt > 0;
    const cls = isOver ? "danger" : "ok";
    const label = isOver ? "超支" : "节余";
    const advice =
      isOver
        ? (c.id === "it" ? "已建议从培训费调剂 30 万" : c.id === "vehicle" ? "建议供应商比价降本 6-9%" : "建议检查预算执行")
        : (c.id === "training" ? "建议调剂至 IT 设备（已生成建议）" : "可结余或调剂");
    const tr = el("tr");
    tr.innerHTML = `<td><b>${esc(c.name)}</b></td>
      <td class="tbl-num" style="text-align:right">${BM.money(c.budget)}</td>
      <td class="tbl-num" style="text-align:right">${BM.money(c.yearForecast)}</td>
      <td class="tbl-num" style="text-align:right;color:${isOver ? "var(--c-danger)" : "var(--c-ok)"};font-weight:600">${isOver ? "+" : ""}${BM.money(varAmt)}</td>
      <td><span class="badge ${cls === "ok" ? "badge-ok" : "badge-danger"}">${label}</span></td>
      <td class="hint-text">${esc(advice)}</td>`;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tbl.appendChild(table);
  page.appendChild(tbl);

  /* 决算操作 */
  const actions = el("div", "final-actions");
  if (role === "ceo" || role === "cooAnalyst") {
    if (BM.state.finalDone) {
      actions.appendChild(el("span", "badge badge-ok", "✅ 本年度决算已确认"));
      actions.appendChild(el("span", "hint-text", "决算报告已归档，可通过 Copilot 查看报告摘要"));
    } else {
      const btn = el("button", "btn btn-accent", "确认决算");
      btn.addEventListener("click", () => {
        BM.finalConfirm();
        BM.renderFinal(_finalBox);
        BM.toast("2026 年度决算已确认");
      });
      actions.appendChild(btn);
      actions.appendChild(el("span", "hint-text", "AI 已生成决算摘要与结余/超支处理建议"));
    }
  } else {
    actions.appendChild(el("span", "hint-text", "仅集团 CEO / 总经办预算管理员可确认决算"));
  }
  page.appendChild(actions);

  container.appendChild(page);
}

window.BM.renderFinal = renderFinal;
window.BM = BM;
