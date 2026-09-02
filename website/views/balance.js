/* ================================================================
 * balance.js — 汇总平衡（上级领导视角 · M3 汇总平衡工作台）
 * 场景：上级领导收到下级提交的预算后，按「弹性分类 + 偏离度」做汇总平衡。
 * 平衡原则（松哥 2026-08-24）：规则4 弹性分类（刚性/半刚性/弹性/项目型）
 *   + 规则2/6 偏离度排序，优先对「弹性/项目型 + 偏高」项差异化压降。
 * 该能力原内嵌于编制页「上级平衡预览」，现独立成页，编制页不再内置。
 * ================================================================ */

var BM = window.BM || {};



/* method → 弹性类型（规则 4：刚性/半刚性/弹性/项目型） */
const BAL_ELASTIC = {
  fixed:     { type: "刚性",   tag: "合同驱动",       E: 0 },
  manageStd: { type: "半刚性", tag: "人数/业务量驱动", E: 0.3 },
  perCapita: { type: "半刚性", tag: "人数驱动",        E: 0.3 },
  history:   { type: "弹性",   tag: "历史+业务驱动",   E: 0.6 },
  yoy:       { type: "弹性",   tag: "历史+趋势",       E: 0.6 },
  volume:    { type: "弹性",   tag: "业务量驱动",       E: 0.8 },
  keyEvent:  { type: "项目型", tag: "事件驱动",         E: null },
  manual:    { type: "项目型", tag: "据实事件",         E: null },
};

function buildBalanceRows() {
  const src = BM.buildCompileSource();
  const rows = src.map((r) => {
    const advice = BM.budgetAdvice(r);
    const amt = r.amount != null ? r.amount : (advice.mid || 0);
    const dev = BM.adviceDeviation(advice, amt);
    const et = BAL_ELASTIC[advice.method] || BAL_ELASTIC.history;
    const overPct = dev.pct != null && dev.pct > 0 ? dev.pct : 0;
    return {
      cat: r.cat, method: advice.method, kind: et.type, tag: et.tag,
      amt: amt, lo: advice.lo, hi: advice.hi, mid: advice.mid,
      overPct: overPct, inRange: dev.inRange,
    };
  });
  /* 按"高于区间的偏离度"降序，给上级看"该压哪些" */
  rows.sort((a, b) => b.overPct - a.overPct);
  return rows;
}

BM.renderBalance = function (container) {
  container.innerHTML = "";
  const page = el("div", "page");

  const head = el("div", "page-head");
  head.appendChild(el("div", "", `<div class="page-title">预算调整 · 2026</div>
    <div class="page-desc">上级领导收到下级提交的预算后，按「弹性分类 + 偏离度」做预算调整——优先差异化压降，不一刀切</div>`));
  page.appendChild(head);
  BM.renderRoleHint(page, "balance");

  const rows = buildBalanceRows();
  const total = rows.reduce((s, x) => s + x.amt, 0);
  const overItems = rows.filter((x) => x.overPct > 0);
  const overSum = overItems.reduce((s, x) => s + x.amt, 0);
  const byType = {};
  rows.forEach((x) => { byType[x.kind] = (byType[x.kind] || 0) + x.amt; });

  /* KPI 卡（优化：一眼看清总量与风险分布） */
  const kpi = el("div", "bal-kpis");
  const kpiData = [
    { k: "编制总额", v: BM.money(total), cls: "primary" },
    { k: "偏高项", v: overItems.length + " 个", cls: overItems.length ? "danger" : "ok" },
    { k: "偏高涉及金额", v: BM.money(overSum), cls: overItems.length ? "danger" : "ok" },
    { k: "刚性占比", v: byType["刚性"] != null ? Math.round((byType["刚性"] / total) * 100) + "%" : "0%", cls: "" },
  ];
  kpiData.forEach((d) => {
    kpi.appendChild(el("div", "bal-kpi " + (d.cls ? "bal-kpi-" + d.cls : ""),
      `<div class="bk-val">${d.v}</div><div class="bk-label">${d.k}</div>`));
  });
  page.appendChild(kpi);

  /* 弹性分布条 */
  const dist = el("div", "bal-dist");
  dist.appendChild(el("div", "bal-dist-title", "弹性分布"));
  const distBar = el("div", "bal-dist-bar");
  const maxType = Math.max(1, ...Object.values(byType));
  Object.keys(byType).forEach((k) => {
    const pct = Math.round((byType[k] / total) * 100);
    const seg = el("div", "bal-dist-seg");
    seg.style.width = (byType[k] / maxType * 100) + "%";
    seg.setAttribute("data-kind", k);
    seg.innerHTML = `<span class="bds-kind">${k}</span><span class="bds-pct">${pct}%</span>`;
    distBar.appendChild(seg);
  });
  dist.appendChild(distBar);
  page.appendChild(dist);

  /* 平衡建议提示 */
  page.appendChild(el("div", "bl-tip", "👉 平衡建议：优先对「弹性/项目型 + 偏高」项做差异化压降（规则6 压降潜力），刚性项直接核对合同；不建议集团一刀切。"));

  /* 分类筛选（优化：点击只看某一弹性类别） */
  const filterRow = el("div", "bal-filter");
  filterRow.appendChild(el("span", "bal-filter-label", "筛选："));
  const kinds = ["全部"].concat(Object.keys(byType));
  kinds.forEach((k, i) => {
    const b = el("button", "bal-filter-btn" + (i === 0 ? " active" : ""), k);
    b.addEventListener("click", () => {
      filterRow.querySelectorAll(".bal-filter-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      renderTable(k === "全部" ? rows : rows.filter((x) => x.kind === k));
    });
    filterRow.appendChild(b);
  });
  page.appendChild(filterRow);

  /* 明细表 */
  const tableWrap = el("div", "balance-table-wrap");
  page.appendChild(tableWrap);

  function renderTable(list) {
    tableWrap.innerHTML = "";
    const table = el("table", "balance-table");
    table.innerHTML = `<thead><tr>
      <th>经济事项</th><th>弹性分类</th>
      <th style="text-align:right">本年度预算值</th>
      <th style="text-align:right">建议区间</th>
      <th>平衡标记</th><th>平衡动作</th>
    </tr></thead>`;
    const tb = el("tbody");
    list.forEach((x) => {
      const flag = x.overPct > 0
        ? `<span class="badge badge-danger">偏高 +${x.overPct}%</span>`
        : (x.inRange === true ? `<span class="badge badge-ok">区间内</span>` : `<span class="hint-text">—</span>`);
      const range = x.lo != null ? BM.money(x.lo) + "~" + BM.money(x.hi) : "—";
      const tr = el("tr");
      tr.innerHTML = `<td><b>${esc(x.cat)}</b></td><td>${x.kind}·${x.tag}</td>
        <td class="tbl-num">${BM.money(x.amt)}</td>
        <td class="tbl-num hint-text">${range}</td>
        <td>${flag}</td>`;
      const actTd = el("td");
      if (x.overPct > 0 && x.kind !== "刚性") {
        const cut = el("button", "btn btn-outline-primary btn-sm", "建议压降");
        cut.addEventListener("click", () => {
          BM.toast("已标记「" + x.cat + "」建议压降 " + x.overPct + "%（待下发部门）");
          cut.textContent = "已标记";
          cut.disabled = true;
        });
        actTd.appendChild(cut);
      } else {
        actTd.appendChild(el("span", "hint-text", x.kind === "刚性" ? "核对合同" : "保持"));
      }
      tr.appendChild(actTd);
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    tableWrap.appendChild(table);
  }
  renderTable(rows);

  /* 底部确认 */
  const foot = el("div", "bal-foot");
  const confirmBtn = el("button", "btn btn-primary", "确认平衡结果 → 下发");
  confirmBtn.addEventListener("click", () => {
    BM.toast("✅ 预算调整已确认，调整结论已下发至各编制部门");
  });
  foot.appendChild(confirmBtn);
  foot.appendChild(el("span", "hint-text", "确认后将平衡结论（差异化压降指令）下发至对应部门，进入执行跟踪"));
  page.appendChild(foot);

  container.appendChild(page);
};

window.BM = BM;
