/* ================================================================
 * track.js — 预算追踪页
 * 月度执行追踪（1-9 实际 + 10-12 预测）· 偏差高亮 · AI 预警
 * ================================================================ */

var BM = window.BM || {};



function renderTrack(container) {
  container.innerHTML = "";
  const page = el("div", "page");
  const role = BM.state.role;

  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">预算追踪</div>
      <div class="page-desc">月度执行 vs 预算 · 偏差自动归因 · AI 预警（演示时点 9 月，10-12 为预测）</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "track");

  /* 数据范围 */
  const deptIds = BM.scopeDeptIds();
  const allCats = BM.CATEGORIES.filter((c) => {
    if (!deptIds) return true;
    return BM.DOCS.some((d) => d.catId === c.id && deptIds.indexOf(d.deptId) >= 0);
  });

  /* 三态筛选：all 全部 / over 当前超预算 / remain 当前有结余 / forecast 预计有结余 */
  let filter = "all";

  /* 分类函数 */
  const classify = (c) => {
    const budget = BM.getCatBudget(c.id);
    const remain = budget - c.used - c.frozen;
    const over = remain < 0; // 当前超预算
    const hasRemain = remain > 0; // 当前有结余
    const forecastSurplus = c.variance < 0; // 预计有结余（yearForecast < budget）
    if (filter === "over") return over;
    if (filter === "remain") return hasRemain;
    if (filter === "forecast") return forecastSurplus;
    return true;
  };

  /* AI 预警摘要 */
  const warnBox = el("div", "plan-statusbar");
  const dangers = allCats.filter((c) => c.forecast.status === "danger");
  const warns = allCats.filter((c) => c.forecast.status === "warn");
  if (dangers.length || warns.length) {
    warnBox.innerHTML = `🔍 AI 追踪预警：${dangers.length ? `<span class="badge badge-danger">${dangers.map((c) => esc(c.name) + " " + c.forecast.label).join(" · ")}</span>` : ""}
      ${warns.length ? `<span class="badge badge-warn">${warns.map((c) => esc(c.name) + " " + c.forecast.label).join(" · ")}</span>` : ""}
      <span class="hint-text">均基于 1-9 月趋势外推，点击科目可看明细</span>`;
  } else {
    warnBox.innerHTML = `<span class="badge badge-ok">✅ 范围内科目暂无超支风险</span>`;
  }
  page.appendChild(warnBox);

  /* 三态筛选按钮组 */
  const filterBar = el("div", "filter-bar");
  filterBar.style.marginBottom = "12px";
  const filters = [
    { key: "all", label: "全部科目", cls: "" },
    { key: "over", label: "当前超预算", cls: "badge-danger" },
    { key: "remain", label: "当前有结余", cls: "badge-ok" },
    { key: "forecast", label: "预计有结余", cls: "badge-info" },
  ];
  filters.forEach((f) => {
    const cnt = f.key === "all" ? allCats.length : allCats.filter(classifyWith(f.key)).length;
    const btn = el("button", "track-filter-btn" + (filter === f.key ? " active" : ""), `${f.label} <span class="badge ${f.cls}" style="margin-left:4px">${cnt}</span>`);
    btn.addEventListener("click", () => {
      filter = f.key;
      renderTable();
      filterBar.querySelectorAll(".track-filter-btn").forEach((b, i) => b.classList.toggle("active", i === filters.findIndex((x) => x.key === f.key)));
    });
    filterBar.appendChild(btn);
  });
  page.appendChild(filterBar);

  /* 月度执行表 */
  const tblWrap = el("div", "");
  page.appendChild(tblWrap);

  function classifyWith(key) {
    return (c) => {
      const budget = BM.getCatBudget(c.id);
      const remain = budget - c.used - c.frozen;
      if (key === "over") return remain < 0;
      if (key === "remain") return remain > 0;
      if (key === "forecast") return c.variance < 0;
      return true;
    };
  }

  function renderTable() {
    tblWrap.innerHTML = "";
    const cats = allCats.filter(classifyWith(filter));
    tblWrap.appendChild(el("div", "section-title", `月度执行明细（万元）· ${filter === "all" ? "全部" : filters.find((x) => x.key === filter).label} ${cats.length} 项`));

    if (!cats.length) {
      tblWrap.appendChild(el("div", "empty", `<div class="empty-ico">🗂</div>当前筛选条件下没有科目`));
      return;
    }

    const tbl = el("div", "tbl-wrap");
    const table = el("table");
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    table.innerHTML = `<thead><tr><th>科目</th>${months.map((m) => `<th style="text-align:right">${m}月</th>`).join("")}<th style="text-align:right">合计</th><th>状态</th></tr></thead>`;
    const tbody = el("tbody");

    cats.forEach((c) => {
      const tr = el("tr");
      let cells = `<td><b>${esc(c.name)}</b></td>`;
      const lastAvg = (c.monthly[6] + c.monthly[7] + c.monthly[8]) / 3;
      const predVals = [lastAvg * 1.06, lastAvg * 1.12, lastAvg * 1.18];
      months.forEach((m, i) => {
        const isPred = m > 9;
        const v = isPred ? predVals[m - 10] : c.monthly[i];
        const val = (v / 10000).toFixed(1);
        const style = isPred ? 'style="color:var(--c-text-3);text-align:right"' : 'style="text-align:right"';
        cells += `<td ${style}>${val}</td>`;
      });
      cells += `<td class="tbl-num" style="text-align:right">${(c.used / 10000).toFixed(1)}</td>
        <td><span class="badge ${c.forecast.status === "danger" ? "badge-danger" : c.forecast.status === "warn" ? "badge-warn" : "badge-ok"}">${esc(c.forecast.label)}</span></td>`;
      tr.innerHTML = cells;
      tr.style.cursor = "pointer";
      tr.addEventListener("click", () => {
        BM.showView("dashboard");
        BM.filterDetails({ catId: c.id });
      });
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tbl.appendChild(table);
    tblWrap.appendChild(tbl);
  }

  renderTable();

  /* 偏差归因 */
  page.appendChild(el("div", "section-title", "AI 偏差归因"));
  const reasons = el("div", "factor-list");
  allCats.forEach((c) => {
    const f = c.forecast;
    if (f.status === "danger") {
      reasons.appendChild(el("div", "factor", `<div class="factor-name" style="width:110px">${esc(c.name)}</div>
        <div class="factor-val">${esc(f.label)}</div>
        <span class="factor-delta badge badge-danger">需 9 月内决策</span>`));
    }
  });
  if (!reasons.children.length) {
    reasons.appendChild(el("div", "empty", `<div class="empty-ico">✅</div>当前范围内无超支风险科目`));
  }
  page.appendChild(reasons);

  container.appendChild(page);
}

window.BM.renderTrack = renderTrack;
window.BM = BM;
