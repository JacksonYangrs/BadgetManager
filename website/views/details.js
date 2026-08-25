/* ================================================================
 * details.js — 部门 / 科目明细（钻取到单据流水）
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

let detailFilter = { catId: "", deptId: "", keyword: "" };

BM.filterDetails = function (f) {
  detailFilter = Object.assign(detailFilter, f);
  const panel = document.getElementById("viewPanel");
  if (panel) BM.renderDetails(panel);
};

function renderDetails(container) {
  container.innerHTML = "";
  const page = el("div", "page");

  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">部门 · 科目明细</div>
      <div class="page-desc">从 AI 结论直达明细 · 每一笔都可追溯</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "details");

  /* ---- 筛选 ---- */
  const bar = el("div", "filter-bar");
  const selCat = el("select");
  selCat.innerHTML = `<option value="">全部科目</option>` + BM.CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === detailFilter.catId ? "selected" : ""}>${c.name}</option>`).join("");
  selCat.addEventListener("change", () => BM.filterDetails({ catId: selCat.value }));
  const selDept = el("select");
  selDept.innerHTML = `<option value="">全部部门</option>` + BM.DEPTS.map((d) => `<option value="${d.id}" ${d.id === detailFilter.deptId ? "selected" : ""}>${d.name}</option>`).join("");
  selDept.addEventListener("change", () => BM.filterDetails({ deptId: selDept.value }));
  const input = el("input");
  input.placeholder = "搜索单据描述 / 供应商…";
  input.value = detailFilter.keyword;
  input.style.width = "180px";
  input.addEventListener("input", () => BM.filterDetails({ keyword: input.value }));
  const clear = el("button", "btn btn-outline btn-sm", "清除筛选");
  clear.addEventListener("click", () => {
    detailFilter = { catId: "", deptId: "", keyword: "" };
    BM.renderDetails(document.getElementById("viewPanel"));
  });
  bar.appendChild(selCat);
  bar.appendChild(selDept);
  bar.appendChild(input);
  bar.appendChild(clear);

  /* 统计（按角色范围过滤数据源） */
  let docs = BM.scopedDocs().filter((d) => {
    if (detailFilter.catId && d.catId !== detailFilter.catId) return false;
    if (detailFilter.deptId && d.deptId !== detailFilter.deptId) return false;
    if (detailFilter.keyword) {
      const k = detailFilter.keyword;
      return d.desc.indexOf(k) >= 0 || d.supplier.indexOf(k) >= 0 || d.catName.indexOf(k) >= 0;
    }
    return true;
  });
  docs = docs.slice().sort((a, b) => (a.date < b.date ? 1 : -1));

  const total = docs.reduce((a, d) => a + d.amount, 0);
  const stat = el("div", "hint-text", `筛选结果：${docs.length} 笔 · 合计 ${BM.money(total)}`);
  stat.style.margin = "10px 0";

  const summary = el("div", "kpi-grid");
  summary.style.margin = "12px 0";
  summary.innerHTML = `<div class="kpi"><div class="kpi-label">筛选金额</div><div class="kpi-value" style="font-size:20px">${BM.money(total)}</div></div>
    <div class="kpi"><div class="kpi-label">单据笔数</div><div class="kpi-value" style="font-size:20px">${docs.length}</div></div>
    <div class="kpi"><div class="kpi-label">供应商</div><div class="kpi-value" style="font-size:20px">${new Set(docs.map((d) => d.supplier)).size}</div></div>`;

  const tbl = el("div", "tbl-wrap");
  const table = el("table");
  table.innerHTML = `<thead><tr>
    <th>日期</th><th>单据</th><th>类型</th><th>科目</th><th>部门</th><th>供应商</th><th style="text-align:right">金额</th><th>状态</th>
  </tr></thead>`;
  const tbody = el("tbody");
  if (docs.length === 0) {
    tbody.appendChild(el("tr", "", `<td colspan="8"><div class="empty"><div class="empty-ico">🗂</div>没有符合条件的单据</div></td>`));
  } else {
    const statusCls = { "已付款": "badge-ok", "审批中": "badge-warn", "草稿": "badge-gray" };
    docs.forEach((d) => {
      tbody.appendChild(
        el("tr", "", `<td class="tbl-num">${d.date}</td>
          <td><b>${esc(d.desc)}</b><br><span class="hint-text">${d.id}</span></td>
          <td><span class="badge badge-info">${esc(d.type)}</span></td>
          <td>${esc(d.catName)}</td>
          <td>${esc(BM.DEPTS.find((x) => x.id === d.deptId)?.name || "-")}</td>
          <td>${esc(d.supplier)}</td>
          <td class="tbl-num" style="text-align:right">${BM.money(d.amount)}</td>
          <td><span class="badge ${statusCls[d.status] || "badge-gray"}">${esc(d.status)}</span></td>`)
      );
    });
  }
  table.appendChild(tbody);
  tbl.appendChild(table);

  page.appendChild(bar);
  page.appendChild(stat);
  page.appendChild(summary);
  page.appendChild(tbl);

  container.appendChild(page);
}

window.BM.renderDetails = renderDetails;
window.BM = BM;
