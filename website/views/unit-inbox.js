/* ================================================================
 * unit-inbox.js — 上级部门汇总 · 消息收件箱（模块二 · 2026-08-23）
 * 上级部门工作台收到管辖单位「预算编制完成」的消息（下级单位数按组织结构自动确定）；
 * 每条消息可展开查看该单位填报（与基层所见一致：经济事项 8 列）；
 * 可打勾多选 → 建立组合 → 「组合汇总」进入部门级预算汇总。
 * 数据：GET /api/orgs + GET /api/unit-budgets?org=
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

/* 只读 8 列经济事项表（与基层编制表一致） */
function renderUnitTable(container, list) {
  container.innerHTML = "";
  const table = el("table");
  table.innerHTML = `<thead><tr>
    <th>经济事项</th><th>会计科目</th>
    <th style="text-align:right">本年度预算值</th><th style="text-align:right">月度拆分</th>
    <th style="text-align:right">上年预算</th><th style="text-align:right">上年决算</th><th>偏差</th>
    <th>AI 建议</th>
  </tr></thead>`;
  const tb = el("tbody");
  list.forEach((r) => {
    const tr = el("tr");
    tr.appendChild(el("td", "", `<b>${esc(r.cat)}</b>`));
    tr.appendChild(el("td", "hint-text", esc(r.acctCode || "—")));
    tr.appendChild(el("td", "tbl-num", `<b>${BM.money(r.amount)}</b>`));
    tr.appendChild(el("td", "tbl-num", `${BM.money(r.monthly.reduce((a, b) => a + b, 0))}`));
    tr.appendChild(el("td", "tbl-num", r.lastBudget != null ? BM.money(r.lastBudget) : "—"));
    tr.appendChild(el("td", "tbl-num", r.lastYear != null ? BM.money(r.lastYear) : "—"));
    const dev = el("td");
    if (r.lastBudget != null && r.lastYear != null) {
      const diff = r.lastYear - r.lastBudget;
      dev.appendChild(el("span", "badge " + (diff > 0 ? "badge-danger" : "badge-ok"), (diff > 0 ? "超支 " : "节支 ") + BM.money(Math.abs(diff))));
    } else dev.appendChild(el("span", "hint-text", "—"));
    tr.appendChild(dev);
    const ai = r.ai && r.ai.lo != null ? `${BM.money(r.ai.lo)} ~ ${BM.money(r.ai.hi)}` : "—";
    tr.appendChild(el("td", "hint-text", esc(ai)));
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  container.appendChild(table);
}

BM.renderUnitInbox = function (container) {
  container.innerHTML = "";
  const page = el("div", "page");

  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">部门预算汇总 · 消息收件箱</div>
      <div class="page-desc">管辖单位「预算编制完成」消息（单位数按组织结构自动确定）· 打勾多选 → 组合汇总</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "unitInbox");

  const box = el("div", "");
  page.appendChild(box);
  box.appendChild(el("div", "empty", "正在加载组织结构…"));

  const selBox = el("div", "filter-bar");
  selBox.style.justifyContent = "space-between";
  const selInfo = el("span", "hint-text", "已选 0 个单位");
  const sumBtn = el("button", "btn btn-accent", "组合汇总 →");
  sumBtn.disabled = true;
  sumBtn.addEventListener("click", () => {
    const orgs = Array.from(document.querySelectorAll(".ui-check:checked")).map((c) => c.dataset.code);
    if (!orgs.length) return;
    BM.state.unitSummaryOrgs = orgs;
    BM.openView("unitSummary");
  });
  selBox.appendChild(selInfo);
  selBox.appendChild(sumBtn);
  page.appendChild(selBox);

  fetch("/api/orgs")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then(({ root, units }) => {
      box.innerHTML = "";
      if (!units || !units.length) { box.appendChild(el("div", "empty", "暂无下级单位（组织结构未配置）")); return; }
      units.forEach((u) => {
        const card = el("div", "todo-item ui-unit");
        card.innerHTML = `<div class="td-ico">🏢</div>
          <div class="td-main"><div class="td-title">${esc(u.name)}</div>
          <div class="td-sub">预算编制已完成 · 点击查看填报明细</div></div>
          <input type="checkbox" class="ui-check" data-code="${esc(u.code)}" title="勾选加入组合">
          <div class="td-go">›</div>`;
        const detail = el("div", "ui-detail");
        detail.style.display = "none";
        const tbWrap = el("div", "tbl-wrap");
        detail.appendChild(tbWrap);
        card.appendChild(detail);
        card.addEventListener("click", (e) => {
          if (e.target.classList.contains("ui-check")) return;
          if (detail.style.display === "none") {
            detail.style.display = "block";
            if (!tbWrap.children.length) {
              tbWrap.appendChild(el("div", "hint-text", "加载该单位预算…"));
              fetch("/api/unit-budgets?org=" + u.code)
                .then((r) => r.json())
                .then((list) => renderUnitTable(tbWrap, list))
                .catch(() => (tbWrap.innerHTML = '<div class="hint-text">加载失败</div>'));
            }
          } else detail.style.display = "none";
        });
        box.appendChild(card);
      });
      document.querySelectorAll(".ui-check").forEach((c) =>
        c.addEventListener("change", () => {
          const n = document.querySelectorAll(".ui-check:checked").length;
          selInfo.textContent = "已选 " + n + " 个单位";
          sumBtn.disabled = n === 0;
        })
      );
    })
    .catch(() => { box.innerHTML = '<div class="empty">加载失败：后端未启动（请运行 server/ 模块）</div>'; });

  container.appendChild(page);
};

window.BM = BM;
