/* ================================================================
 * risk-view.js — AI 风险筛查视图（M7 · v0.13 · P2）
 * 设计（产品设计稿 V1 §M7 / §5.6 · 提示非判定）：
 *   - 风险筛查结果列表：异常类型 / 原因 / 建议金额（确定性计算）/ 置信度 / 风险等级
 *   - 建议金额与基线差异由确定性计算给出，模型只解释与候选（D3）
 *   - 人工复核（采纳 / 驳回）→ 留痕（M10），结论回流
 *   - 按风险等级筛选 + 按角色/公司过滤
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

function companyName(code) {
  const c = BM.COMPANIES.find((x) => x.code === code);
  return c ? c.name : code;
}

/* 计算风险项等级（确定性） */
function levelOf(r) {
  const dev = r.baseline ? (r.suggestAmount - r.baseline) / r.baseline : 0;
  return BM.calc.riskLevel(r.confidence, dev);
}

const LEVEL_BADGE = { 高: "badge-danger", 中: "badge-warn", 低: "badge-ok" };
const TYPE_BADGE = {
  "异常金额": "badge-warn", "结构异常": "badge-warn", "费用转移": "badge-danger",
  "疑似错科目": "badge-danger", "单位差异": "badge-info", "高风险单位": "badge-danger",
};

function renderRiskView(container) {
  container.innerHTML = "";
  const page = el("div", "page");
  const role = BM.state.role;

  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">AI 风险筛查</div>
      <div class="page-desc">从海量数据中「拎出」高风险对象 · 提示非判定 · 人工复核（M7）</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "riskView");

  /* 汇总 KPI（确定性统计） */
  const summary = BM.calc.riskSummary(BM.RISK_SCREENING);
  const kpi = el("div", "kpi-grid");
  kpi.appendChild(el("div", "kpi accent", `<div class="kpi-label">筛查对象</div><div class="kpi-value">${summary.count}</div><div class="kpi-sub">项</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">高风险</div><div class="kpi-value" style="color:var(--c-danger)">${summary.byLevel["高"] || 0}</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">中风险</div><div class="kpi-value" style="color:var(--c-warn)">${summary.byLevel["中"] || 0}</div>`));
  kpi.appendChild(el("div", "kpi", `<div class="kpi-label">建议可压降</div><div class="kpi-value">${BM.money(summary.saveTotal)}</div><div class="kpi-sub">建议额合计 − 基线</div>`));
  page.appendChild(kpi);

  /* 筛选条：等级 + 公司（角色相关） */
  const filterBar = el("div", "filter-bar");
  filterBar.style.margin = "14px 0 6px";
  filterBar.appendChild(el("span", "hint-text", "等级："));
  const levelSel = el("select");
  levelSel.innerHTML = `<option value="all">全部</option><option value="高">高风险</option><option value="中">中风险</option><option value="低">低风险</option>`;
  filterBar.appendChild(levelSel);

  filterBar.appendChild(el("span", "hint-text", "公司："));
  const companySel = el("select");
  const companies = [{ code: "all", name: "全部公司" }].concat(BM.COMPANIES);
  companySel.innerHTML = companies.map((c) => `<option value="${c.code}">${esc(c.name)}</option>`).join("");
  /* 角色默认：部门经理归于厦门三安 2010 */
  if (role === "manager") companySel.value = "2010";
  filterBar.appendChild(companySel);
  page.appendChild(filterBar);

  /* 风险列表容器 */
  const listBox = el("div", "");
  listBox.id = "riskList";
  page.appendChild(listBox);

  function renderList() {
    const lv = levelSel.value;
    const co = companySel.value;
    const items = BM.RISK_SCREENING.filter((r) => {
      if (lv !== "all" && levelOf(r) !== lv) return false;
      if (co !== "all" && r.company !== co) return false;
      return true;
    });
    listBox.innerHTML = "";
    if (!items.length) {
      listBox.appendChild(el("div", "empty", `<div class="empty-ico">✅</div>当前筛选下无风险对象`));
      return;
    }
    items.forEach((r) => {
      const level = levelOf(r);
      const dev = r.baseline ? (r.suggestAmount - r.baseline) / r.baseline : 0;
      const reviewed = BM.state.riskReview[r.id];
      const card = el("div", "risk-card-view" + (level === "高" ? " danger" : ""));

      const top = el("div", "rcv-top");
      top.innerHTML = `<div class="rcv-head">
          <b>${esc(r.cat)}</b>
          <span class="badge ${TYPE_BADGE[r.type] || "badge-info"}">${esc(r.type)}</span>
          <span class="badge ${LEVEL_BADGE[level]}">风险等级 · ${level}</span>
          <span class="hint-text">${esc(companyName(r.company))}</span>
        </div>`;
      card.appendChild(top);

      const body = el("div", "rcv-body");
      body.innerHTML = `<div class="rcv-row"><span class="rcv-k">原因</span><span class="rcv-v">${esc(r.reason)}</span></div>
        <div class="rcv-row"><span class="rcv-k">基线（原值）</span><span class="rcv-v tbl-num">${BM.money(r.baseline)}</span></div>
        <div class="rcv-row"><span class="rcv-k">建议金额</span><span class="rcv-v tbl-num" style="color:var(--c-primary)">${BM.money(r.suggestAmount)}</span>
          <span class="hint-text">（偏差 ${(dev * 100).toFixed(1)}%，确定性计算）</span></div>`;
      card.appendChild(body);

      /* 置信度条 */
      const confWrap = el("div", "rcv-conf");
      const confPct = Math.round((r.confidence || 0) * 100);
      confWrap.innerHTML = `<span class="hint-text">置信度</span>
        <span class="confidence-bar"><span class="confidence-fill" style="width:${confPct}%"></span></span>
        <b>${confPct}%</b>`;
      card.appendChild(confWrap);

      /* 证据链 */
      const ev = el("div", "evidence");
      ev.innerHTML = `<div class="evidence-title">▍ 可追溯证据（提示非判定）</div>` +
        (r.evidence || []).map((e) => `<div class="evidence-step"><span class="ev-dot">•</span><span>${esc(e)}</span></div>`).join("");
      card.appendChild(ev);

      /* 人工复核 */
      const act = el("div", "rcv-actions");
      if (reviewed) {
        const dec = reviewed.decision === "adopt" ? "已采纳" : "已驳回";
        const cls = reviewed.decision === "adopt" ? "badge-ok" : "badge-danger";
        act.appendChild(el("span", "badge " + cls, dec + " · " + reviewed.time));
        if (reviewed.note) act.appendChild(el("span", "hint-text", esc(reviewed.note)));
      } else {
        const adopt = el("button", "btn btn-primary btn-sm", "采纳建议");
        const reject = el("button", "btn btn-outline btn-sm", "驳回");
        adopt.addEventListener("click", () => {
          BM.reviewRisk(r.id, "adopt", "人工复核采纳：建议金额可作为压降/核查依据");
          BM.toast("✅ 已采纳「" + r.cat + "」风险建议");
          renderList();
        });
        reject.addEventListener("click", () => {
          BM.reviewRisk(r.id, "reject", "人工复核驳回：当前证据不足，维持原值");
          BM.toast("已驳回「" + r.cat + "」风险建议");
          renderList();
        });
        act.appendChild(adopt);
        act.appendChild(reject);
        act.appendChild(el("span", "hint-text", "采纳/驳回均写入审计留痕（M10）"));
      }
      card.appendChild(act);

      listBox.appendChild(card);
    });
  }

  levelSel.addEventListener("change", renderList);
  companySel.addEventListener("change", renderList);
  renderList();

  container.appendChild(page);
}

window.BM.renderRiskView = renderRiskView;
window.BM = BM;
