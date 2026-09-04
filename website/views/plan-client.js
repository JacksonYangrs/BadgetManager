/* ================================================================
 * views/plan-client.js — 客户规则引擎（子视图）
 * 迁移自 views/plan.js（原 1120 行上帝文件，2026-09-04 拆分）
 * 依赖：data/*、core/*；plan 系列第三个加载（在 plan-bottomup.js 之后）
 * 挂载 BM.plan.renderClientRuleEngine（原闭包 renderClientRuleEngine）
 * ================================================================ */

(function () {
var BM = window.BM || {};
BM.plan = BM.plan || {};

/* ================================================================
 * v0.6：客户规则引擎（预算逻辑 · 编制预填 + 偏离治理）
 * 选科目 → 按 BM.RULES 自动预填基线（applyRule）；
 * 人工改 → 偏离标红 + 偏离原因必填（规则治理，V2 §5.10）
 * ================================================================ */
function renderClientRuleEngine(container) {
  const wrap = el("div", "");

  wrap.appendChild(el("div", "section-title", "客户规则引擎（预算逻辑 · 编制预填与偏离治理）"));
  const note = el("div", "plan-statusbar");
  note.innerHTML = `<span class="badge badge-info">来源：客户预算逻辑指导意见</span>
    <span class="hint-text">选科目 → 系统按规则自动预填基线金额；人工改 → 偏离标红 + 偏离原因必填（规则治理，V2 §5.10）</span>`;
  wrap.appendChild(note);

  /* 规则卡（侧边常驻） */
  const cardGrid = el("div", "rules-grid");
  BM.RULES.forEach((r) => {
    const c = el("div", "rule-card");
    c.innerHTML = `<div class="rule-title">${esc(r.id)} · ${esc(r.cat)}</div>
      <div class="rule-desc">${esc(r.expr)}</div>
      <div class="hint-text" style="margin-top:6px">归口：${esc(r.desc)}</div>`;
    cardGrid.appendChild(c);
  });
  wrap.appendChild(cardGrid);

  /* 编制预填 + 偏离治理表 */
  const tbl = el("div", "tbl-wrap");
  const table = el("table");
  table.innerHTML = `<thead><tr>
    <th>科目</th><th style="text-align:right">2025 实际</th><th>规则</th><th style="text-align:right">AI 建议基线</th><th style="text-align:right">申报值</th><th>状态</th><th>偏离原因（必填）</th>
  </tr></thead>`;
  const tbody = el("tbody");

  BM.RULES.forEach((r) => {
    const baseline = BM.applyRule(r.cat, r.lastYear);
    const saved = BM.state.ruleEngine[r.cat] || {};
    const apply = saved.apply !== undefined ? saved.apply : (baseline.ok ? baseline.baseline : 0);
    const deviated = BM.isDeviated(apply, baseline.baseline);
    const tr = el("tr");
    tr.innerHTML = `<td><b>${esc(r.cat)}</b></td>
      <td class="tbl-num" style="text-align:right">${r.lastYear ? BM.money(r.lastYear) : "—"}</td>
      <td class="hint-text">${esc(r.expr)}</td>
      <td class="tbl-num" style="text-align:right">${baseline.ok ? BM.money(baseline.baseline) : "—"}</td>
      <td style="text-align:right"><input type="number" step="10000" value="${apply}" data-cat="${esc(r.cat)}" class="re-apply ${deviated ? "re-deviated" : ""}"></td>
      <td><span class="badge ${deviated ? "badge-danger" : "badge-ok"}">${deviated ? "偏离" : "基线"}</span></td>
      <td><input type="text" placeholder="${deviated ? "必填：说明偏离理由" : "（基线内可不填）"}" value="${esc(saved.reason || "")}" data-cat="${esc(r.cat)}" class="re-reason"></td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  tbl.appendChild(table);
  wrap.appendChild(tbl);

  /* 实时联动：申报值变化 → 重算偏离，动态切换状态/原因必填 */
  wrap.querySelectorAll(".re-apply").forEach((inp) => {
    inp.addEventListener("input", () => {
      const cat = inp.dataset.cat;
      const r = BM.RULES.find((x) => x.cat === cat);
      const base = BM.applyRule(cat, r.lastYear);
      const dev = BM.isDeviated(parseInt(inp.value, 10) || 0, base.baseline);
      const tr = inp.closest("tr");
      const badge = tr.querySelector(".badge");
      const reason = tr.querySelector(".re-reason");
      inp.classList.toggle("re-deviated", dev);
      badge.className = "badge " + (dev ? "badge-danger" : "badge-ok");
      badge.textContent = dev ? "偏离" : "基线";
      reason.placeholder = dev ? "必填：说明偏离理由" : "（基线内可不填）";
    });
  });

  /* 保存：偏离基线必须填原因 */
  const saveBtn = el("button", "btn btn-primary btn-sm", "保存编制申报值");
  saveBtn.style.marginTop = "10px";
  saveBtn.addEventListener("click", () => {
    let firstMissing = null;
    BM.RULES.forEach((r) => {
      const applyInp = wrap.querySelector('.re-apply[data-cat="' + r.cat + '"]');
      const reasonInp = wrap.querySelector('.re-reason[data-cat="' + r.cat + '"]');
      if (!applyInp || !reasonInp) return;
      const apply = parseInt(applyInp.value, 10) || 0;
      const base = BM.applyRule(r.cat, r.lastYear);
      const dev = BM.isDeviated(apply, base.baseline);
      if (dev && !reasonInp.value.trim()) {
        reasonInp.classList.add("re-reason-required");
        reasonInp.classList.remove("re-reason");
        if (!firstMissing) firstMissing = reasonInp;
      } else {
        reasonInp.classList.add("re-reason");
        reasonInp.classList.remove("re-reason-required");
        BM.saveRuleEngine(r.cat, apply, reasonInp.value.trim());
      }
    });
    if (firstMissing) {
      BM.toast("⛔ 偏离基线的科目必须填写偏离原因");
      firstMissing.focus();
      return;
    }
    BM.toast("✅ 编制申报值已保存（含偏离原因留痕）");
    BM.openView("plan");
  });
  wrap.appendChild(saveBtn);

  return wrap;
}

BM.plan.renderClientRuleEngine = renderClientRuleEngine;

window.BM = BM;
})();
