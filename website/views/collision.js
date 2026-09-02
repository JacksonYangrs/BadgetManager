/* ================================================================
 * collision.js — 预算碰撞/争议原型（v0.6 · P1）
 * 对选定科目/公司，展示「公司申报值」vs「集团建议值（规则基线）」。
 * 重大差异生成争议项：业务方说明 → 补充证据 → 状态（待协商/已共识）。
 * 对应 V2 §5.2；同时验证 V1「预算碰撞与协商」假设（系统化协商价值）。
 * 仅集团层（ceo / cooLead / cooAnalyst）可见。
 * ================================================================ */

var BM = window.BM || {};



function companyName(code) {
  const c = BM.COMPANIES.find((x) => x.code === code);
  return c ? c.name : code;
}

const COLLISION_STATUS = {
  "待协商": { cls: "badge-warn", label: "待协商" },
  "已共识": { cls: "badge-ok", label: "已共识" },
  "集团裁定": { cls: "badge-info", label: "集团裁定" },
};

function renderCollision(container) {
  container.innerHTML = "";
  const page = el("div", "page");

  /* ---- 页头 ---- */
  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">预算碰撞 / 争议</div>
      <div class="page-desc">公司申报值 vs 集团建议值（规则基线）· 重大差异进入争议协商 · 对应 V2 §5.2</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "dashboard");

  const items = BM.state.collisions || [];
  const totalApply = items.reduce((a, c) => a + c.apply, 0);
  const totalSuggest = items.reduce((a, c) => a + c.suggest, 0);
  const pending = items.filter((c) => c.status === "待协商").length;

  /* ---- KPI ---- */
  const kpi = el("div", "kpi-grid");
  kpi.appendChild(el("div", "kpi accent", `<div class="kpi-label">争议项</div><div class="kpi-value">${items.length}</div><div class="kpi-sub">${pending} 项待协商</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">申报合计</div><div class="kpi-value">${BM.money(totalApply)}</div><div class="kpi-sub">各公司上报</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">建议合计</div><div class="kpi-value">${BM.money(totalSuggest)}</div><div class="kpi-sub">规则基线</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">整体差异</div><div class="kpi-value" style="color:${totalApply - totalSuggest >= 0 ? "var(--c-danger)" : "var(--c-ok)"}">${totalApply - totalSuggest >= 0 ? "+" : ""}${BM.money(totalApply - totalSuggest)}</div><div class="kpi-sub">申报 − 建议</div>`));
  page.appendChild(kpi);

  /* ---- 碰撞表 ---- */
  page.appendChild(el("div", "section-title", "申报值 vs 建议值 · 差异一览"));
  const tbl = el("div", "tbl-wrap");
  const table = el("table");
  table.innerHTML = `<thead><tr>
    <th>科目</th><th>公司</th><th style="text-align:right">申报值</th><th style="text-align:right">建议值</th><th style="text-align:right">差异</th><th>差异%</th><th>状态</th><th></th>
  </tr></thead>`;
  const tbody = el("tbody");

  items.forEach((c) => {
    const st = COLLISION_STATUS[c.status] || COLLISION_STATUS["待协商"];
    const deviated = Math.abs(c.diffPct) >= 5 && c.status === "待协商";
    const tr = el("tr");
    tr.innerHTML = `<td><b>${esc(c.cat)}</b></td>
      <td>${esc(companyName(c.company))}</td>
      <td class="tbl-num" style="text-align:right">${BM.money(c.apply)}</td>
      <td class="tbl-num" style="text-align:right">${BM.money(c.suggest)}</td>
      <td class="tbl-num" style="text-align:right;color:${c.diff >= 0 ? "var(--c-danger)" : "var(--c-ok)"}">${c.diff >= 0 ? "+" : ""}${BM.money(c.diff)}</td>
      <td><span class="badge ${Math.abs(c.diffPct) >= 5 ? "badge-warn" : "badge-ok"}">${c.diffPct > 0 ? "+" : ""}${c.diffPct}%</span></td>
      <td><span class="badge ${st.cls}">${st.label}</span></td>
      <td><button class="btn btn-outline btn-sm coll-toggle" data-id="${c.id}">${deviated ? "协商 ›" : "详情 ›"}</button></td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tbl.appendChild(table);
  page.appendChild(tbl);

  /* ---- 争议协商区（展开） ---- */
  page.appendChild(el("div", "section-title", "争议协商 · 说明 / 证据 / 状态留痕"));
  const collZone = el("div", "coll-zone");
  collZone.id = "collZone";
  items.forEach((c) => collZone.appendChild(renderCollisionCard(c)));
  page.appendChild(collZone);

  /* 展开按钮事件 */
  page.querySelectorAll(".coll-toggle").forEach((b) => {
    b.addEventListener("click", () => {
      const card = collZone.querySelector(`#coll-${b.dataset.id}`);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  container.appendChild(page);
}

/* 单个争议项卡片：说明 / 证据 / 状态 */
function renderCollisionCard(c) {
  const st = COLLISION_STATUS[c.status] || COLLISION_STATUS["待协商"];
  const card = el("div", "plan-editor");
  card.id = "coll-" + c.id;
  card.style.marginBottom = "14px";

  const headEl = el("div", "card-head");
  headEl.innerHTML = `<div class="card-icon" style="background:var(--c-warn-bg);color:var(--c-warn)">⚖</div>
    <div class="card-title">${esc(c.cat)} · ${esc(companyName(c.company))}</div>
    <span class="card-tag badge ${st.cls}">${st.label}</span>
    <span class="card-tag badge ${Math.abs(c.diffPct) >= 5 ? "badge-warn" : "badge-ok"}">差异 ${c.diffPct > 0 ? "+" : ""}${c.diffPct}%</span>`;
  card.appendChild(headEl);

  const body = el("div", "card-body");
  body.innerHTML = `<div class="coll-figures">
    <div><span class="hint-text">申报值</span><b>${BM.money(c.apply)}</b></div>
    <div><span class="hint-text">建议值</span><b>${BM.money(c.suggest)}</b></div>
    <div><span class="hint-text">差异</span><b style="color:${c.diff >= 0 ? "var(--c-danger)" : "var(--c-ok)"}">${c.diff >= 0 ? "+" : ""}${BM.money(c.diff)}</b></div>
    <div><span class="hint-text">2025 实际</span><b>${c.lastYear ? BM.money(c.lastYear) : "—"}</b></div>
  </div>`;

  /* 业务方说明 */
  const noteLabel = el("div", "coll-field-label", "业务方说明（偏离理由）：");
  const note = el("textarea");
  note.rows = 2;
  note.placeholder = "说明为何申报值与集团建议值存在差异…";
  note.value = c.note || "";
  note.className = "coll-textarea";

  /* 证据 */
  const evLabel = el("div", "coll-field-label", "补充证据（文本 / 附件说明）：");
  const ev = el("textarea");
  ev.rows = 2;
  ev.placeholder = "补充数据来源、历史依据或审批记录…";
  ev.value = c.evidence || "";
  ev.className = "coll-textarea";

  /* 状态选择 */
  const statusLabel = el("div", "coll-field-label", "协商状态：");
  const statusSel = el("select");
  statusSel.className = "coll-select";
  statusSel.innerHTML = Object.keys(COLLISION_STATUS).map((s) =>
    `<option value="${s}" ${s === c.status ? "selected" : ""}>${COLLISION_STATUS[s].label}</option>`).join("");

  /* 保存按钮 */
  const actions = el("div", "plan-actions");
  const saveBtn = el("button", "btn btn-primary btn-sm", "保存协商记录");
  saveBtn.addEventListener("click", () => {
    const patch = { note: note.value.trim(), evidence: ev.value.trim(), status: statusSel.value };
    BM.saveCollision(c.id, patch);
    BM.toast("✅ 已保存「" + c.cat + "」协商记录");
    renderCollision(document.getElementById("viewPanel"));
  });
  actions.appendChild(saveBtn);

  body.appendChild(noteLabel);
  body.appendChild(note);
  body.appendChild(evLabel);
  body.appendChild(ev);
  body.appendChild(statusLabel);
  body.appendChild(statusSel);
  body.appendChild(actions);
  card.appendChild(body);
  return card;
}

window.BM.renderCollision = renderCollision;
window.BM = BM;
