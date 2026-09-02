/* ================================================================
 * unit-summary.js — 部门级预算汇总（模块二 · 2026-08-23）
 * 组合汇总：单位 × 事项 矩阵；压降两个维度（事项行 × 单位列，叠加）；
 * AI 报告质检：检测预算变化（较上年决算 ↑/↓）；注释编辑 = 因素分析，保存到数据库。
 * 数据：GET /api/orgs + GET /api/unit-budgets?org= + PUT /api/unit-budgets/:id/reduction
 * ================================================================ */
var BM = window.BM || {};



/* 保存某格的压降 + 注释 */
function saveReduction(id, payload, done) {
  BM.apiSend("/api/unit-budgets/" + id + "/reduction", "PUT", payload)
    .then((d) => done && done(d))
    .catch(() => BM.toast("保存失败：后端不可用"));
}

BM.renderUnitSummary = function (container) {
  const orgs = (BM.state.unitSummaryOrgs || []).slice();
  container.innerHTML = "";
  const page = el("div", "page");

  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">部门预算汇总 · 组合汇总</div>
      <div class="page-desc">压降两个维度（事项 × 单位）· AI 报告质检 · 注释 = 因素分析（存库）</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "unitSummary");

  const bar = el("div", "filter-bar");
  const back = el("button", "btn btn-outline btn-sm", "← 返回收件箱");
  back.addEventListener("click", () => BM.openView("unitInbox"));
  const aiBtn = el("button", "btn btn-accent btn-sm", "运行 AI 报告质检");
  bar.appendChild(back);
  bar.appendChild(el("span", "hint-text", "已选组合：" + orgs.join(" / ")));
  bar.appendChild(aiBtn);
  page.appendChild(bar);

  const box = el("div", "");
  page.appendChild(box);
  box.appendChild(el("div", "empty", "正在加载各单位预算…"));

  /* AI 质检面板 */
  const qcPanel = el("div", "qc-panel");
  qcPanel.style.display = "none";
  page.appendChild(qcPanel);

  BM.apiGet("/api/orgs").then(({ units }) => {
    const orgMeta = {};
    units.forEach((u) => (orgMeta[u.code] = u.name));
    return Promise.all(orgs.map((code) =>
      BM.apiGet("/api/unit-budgets?org=" + code).then((list) => ({ code, name: orgMeta[code] || code, list }))
    ));
  }).then((data) => {
    box.innerHTML = "";
    if (!data.length) { box.appendChild(el("div", "empty", "未选择单位")); return; }

    /* 行序 = 事项（按首个单位顺序），格 = 单位×事项 */
    const catOrder = [];
    data.forEach((d) => d.list.forEach((b) => { if (catOrder.indexOf(b.cat) < 0) catOrder.push(b.cat); }));
    const byCell = {}; /* cat|orgCode -> unit_budget 记录 */
    data.forEach((d) => d.list.forEach((b) => { byCell[b.cat + "|" + d.code] = b; }));

    const rowRatios = {}; /* cat -> 行压降比例 */
    const colRatios = {}; /* orgCode -> 列压降比例 */
    catOrder.forEach((c) => (rowRatios[c] = 0));
    data.forEach((d) => (colRatios[d.code] = 0));

    const table = el("table", "us-table");
    /* 表头：事项 | 各单位 | 合计（原/压后） | 行压降 */
    let th = "<thead><tr><th>经济事项</th>";
    data.forEach((d) => (th += `<th style="text-align:right">${esc(d.name)}</th>`));
    th += `<th style="text-align:right">合计（原 → 压后）</th><th>行压降</th></tr></thead>`;
    table.innerHTML = th;
    const tb = el("tbody");
    const cellEls = {};
    const rowSumEls = {};
    const colSumEls = {};

    catOrder.forEach((cat) => {
      const tr = el("tr");
      tr.appendChild(el("td", "", `<b>${esc(cat)}</b>`));
      data.forEach((d) => {
        const b = byCell[cat + "|" + d.code];
        const td = el("td", "us-cell");
        td.style.textAlign = "right";
        const num = el("div", "us-num", b ? money(b.amount) : "—");
        const red = el("div", "us-red", "");
        td.appendChild(num);
        td.appendChild(red);
        if (b) {
          td.title = "点击编辑压降与注释";
          td.classList.add("clickable");
          td.addEventListener("click", () => openCellEditor(b, d.code, () => reRender()));
        }
        tr.appendChild(td);
        cellEls[cat + "|" + d.code] = { num, red };
      });
      /* 行合计 */
      const sumTd = el("td", "us-sum");
      sumTd.style.textAlign = "right";
      tr.appendChild(sumTd);
      rowSumEls[cat] = sumTd;
      /* 行压降滑块 */
      const rdTd = el("td");
      const slider = el("input", "us-slider");
      slider.type = "range"; slider.min = "0"; slider.max = "0.2"; slider.step = "0.01"; slider.value = "0";
      const pct = el("span", "us-pct", "0%");
      slider.addEventListener("input", () => { rowRatios[cat] = parseFloat(slider.value) || 0; pct.textContent = Math.round(rowRatios[cat] * 100) + "%"; reRender(); });
      slider.addEventListener("change", () => { applyRow(cat); });
      rdTd.appendChild(slider); rdTd.appendChild(pct);
      tr.appendChild(rdTd);
      tb.appendChild(tr);
    });

    /* 列合计 + 列压降行 */
    const colTr = el("tr");
    colTr.appendChild(el("td", "", "<b>单位合计（原 → 压后）</b>"));
    data.forEach((d) => {
      const td = el("td", "us-sum");
      td.style.textAlign = "right";
      colTr.appendChild(td);
      colSumEls[d.code] = td;
    });
    const colRdTd = el("td");
    colRdTd.appendChild(el("span", "hint-text", "单位维度压降 ↓"));
    colTr.appendChild(colRdTd);
    colTr.appendChild(el("td"));
    tb.appendChild(colTr);

    const colSliders = el("tr");
    colSliders.appendChild(el("td", "", "<b>部门调整</b>"));
    data.forEach((d) => {
      const td = el("td");
      const slider = el("input", "us-slider");
      slider.type = "range"; slider.min = "0"; slider.max = "0.2"; slider.step = "0.01"; slider.value = "0";
      const pct = el("span", "us-pct", "0%");
      slider.addEventListener("input", () => { colRatios[d.code] = parseFloat(slider.value) || 0; pct.textContent = Math.round(colRatios[d.code] * 100) + "%"; reRender(); });
      slider.addEventListener("change", () => { applyCol(d.code); });
      const reason = el("input", "us-reason");
      reason.type = "text";
      reason.placeholder = "调整原因";
      reason.title = "输入该部门预算调整原因（保存到数据库）";
      reason.addEventListener("change", () => {
        const note = reason.value.trim();
        catOrder.forEach((cat) => {
          const b = byCell[cat + "|" + d.code];
          if (b && note) saveReduction(b.id, { note: note });
        });
        BM.toast(note ? "✅ 已保存「" + d.code + "」调整原因" : "已清空「" + d.code + "」调整原因");
      });
      td.appendChild(slider);
      td.appendChild(pct);
      td.appendChild(reason);
      colSliders.appendChild(td);
    });
    colSliders.appendChild(el("td"));
    colSliders.appendChild(el("td"));
    tb.appendChild(colSliders);

    table.appendChild(tb);
    box.appendChild(table);

    /* 重新渲染金额（叠加行×列压降，不落库，仅预览） */
    function effectiveRatio(cat, code) {
      return 1 - (1 - rowRatios[cat]) * (1 - (colRatios[code] || 0));
    }
    function reRender() {
      catOrder.forEach((cat) => {
        let rawSum = 0, redSum = 0;
        data.forEach((d) => {
          const b = byCell[cat + "|" + d.code];
          const c = cellEls[cat + "|" + d.code];
          if (b && c) {
            const r = effectiveRatio(cat, d.code);
            c.num.textContent = money(b.amount);
            c.red.textContent = r > 0 ? "→ " + money(Math.round(b.amount * (1 - r))) : "";
            c.red.style.color = "var(--c-danger)";
            rawSum += b.amount; redSum += Math.round(b.amount * (1 - r));
          }
        });
        rowSumEls[cat].innerHTML = money(rawSum) + (redSum !== rawSum ? " → <b style='color:var(--c-danger)'>" + money(redSum) + "</b>" : "");
      });
      data.forEach((d) => {
        let rawSum = 0, redSum = 0;
        catOrder.forEach((cat) => {
          const b = byCell[cat + "|" + d.code];
          if (b) { const r = effectiveRatio(cat, d.code); rawSum += b.amount; redSum += Math.round(b.amount * (1 - r)); }
        });
        colSumEls[d.code].innerHTML = money(rawSum) + (redSum !== rawSum ? " → <b style='color:var(--c-danger)'>" + money(redSum) + "</b>" : "");
      });
    }
    reRender();

    /* 行压降：保存该行所有格 */
    function applyRow(cat) {
      const ratio = rowRatios[cat];
      data.forEach((d) => {
        const b = byCell[cat + "|" + d.code];
        if (b && ratio > 0) saveReduction(b.id, { reduceRatio: ratio });
      });
      if (ratio > 0) BM.toast("已对「" + cat + "」应用行压降 " + Math.round(ratio * 100) + "%（含注释保留）");
      else BM.toast("「" + cat + "」行压降已清零");
    }
    function applyCol(code) {
      const ratio = colRatios[code];
      catOrder.forEach((cat) => {
        const b = byCell[cat + "|" + code];
        if (b && ratio > 0) saveReduction(b.id, { reduceRatio: ratio });
      });
      if (ratio > 0) BM.toast("已对「" + code + "」应用列压降 " + Math.round(ratio * 100) + "%");
      else BM.toast("「" + code + "」列压降已清零");
    }

    /* 每格编辑器：压降 + 注释（因素分析） */
    function openCellEditor(b, code, refresh) {
      const mask = el("div", "modal-mask");
      const modal = el("div", "modal");
      modal.style.width = "420px";
      const curR = b.reduceRatio || 0;
      modal.innerHTML = `<div class="modal-head"><div class="modal-title">${esc(b.cat)} · ${esc(orgMeta[code] || code || "")} · 压降与注释</div></div>
        <div class="modal-body">
          <div class="filter-bar"><span class="hint-text">原始预算：</span><b>${money(b.amount)}</b></div>
          <div class="filter-bar"><span class="hint-text">压降比例：</span><input type="range" id="ueRatio" min="0" max="0.2" step="0.01" value="${curR}"><span id="uePct" class="hint-text">${Math.round(curR * 100)}%</span></div>
          <div class="filter-bar"><span class="hint-text">压降后：</span><b id="ueAfter">${money(Math.round(b.amount * (1 - curR)))}</b></div>
          <div class="filter-bar"><span class="hint-text">注释（因素分析）：</span></div>
          <textarea id="ueNote" placeholder="说明该事项预算变化/压降的原因" style="width:100%;height:72px;box-sizing:border-box">${esc(b.note || "")}</textarea>
        </div>
        <div class="modal-head" style="justify-content:flex-end;gap:8px;border-top:1px solid var(--c-border)">
          <button id="ueCancel" class="btn btn-outline btn-sm">取消</button>
          <button id="ueSave" class="btn btn-primary btn-sm">保存</button>
        </div>`;
      mask.appendChild(modal);
      mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
      const ratioInput = modal.querySelector("#ueRatio");
      const pctEl = modal.querySelector("#uePct");
      const afterEl = modal.querySelector("#ueAfter");
      ratioInput.addEventListener("input", () => {
        const r = parseFloat(ratioInput.value) || 0;
        pctEl.textContent = Math.round(r * 100) + "%";
        afterEl.textContent = money(Math.round(b.amount * (1 - r)));
      });
      modal.querySelector("#ueCancel").addEventListener("click", () => mask.remove());
      modal.querySelector("#ueSave").addEventListener("click", () => {
        const r = parseFloat(ratioInput.value) || 0;
        const note = modal.querySelector("#ueNote").value.trim();
        saveReduction(b.id, { reduceRatio: r, note: note }, () => { BM.toast("✅ 已保存压降与注释"); mask.remove(); refresh && refresh(); });
      });
      document.getElementById("modalRoot").appendChild(mask);
    }

    /* AI 报告质检：较上年决算 ± 变化 */
    aiBtn.addEventListener("click", () => {
      const lines = [];
      catOrder.forEach((cat) => {
        let amount = 0, lastYear = 0, notes = [];
        data.forEach((d) => {
          const b = byCell[cat + "|" + d.code];
          if (b) { amount += b.amount * (1 - effectiveRatio(cat, d.code)); lastYear += (b.lastYear || 0); if (b.note) notes.push(b.note); }
        });
        const vs = lastYear ? Math.round(((amount - lastYear) / lastYear) * 1000) / 10 : null;
        lines.push({ cat, amount, lastYear, vs, notes });
      });
      qcPanel.innerHTML = `<div class="qc-head">AI 报告质检 · 预算变化检测（较上年决算）</div>`;
      lines.forEach((l) => {
        const row = el("div", "qc-row");
        const trend = l.vs == null ? "—" : (l.vs >= 0 ? `<b style="color:var(--c-danger)">↑ +${l.vs}%</b>` : `<b style="color:var(--c-ok)">↓ ${l.vs}%</b>`);
        const reason = l.vs == null ? "" : l.vs >= 0 ? "较上年增长，请说明业务扩张/物价因素" : "较上年下降，符合压降要求";
        const noteInput = el("input", "cmp-reason");
        noteInput.placeholder = "输入因素分析（存库）";
        noteInput.value = l.notes[0] || "";
        const saveBtn = el("button", "btn btn-outline btn-sm", "保存注释");
        saveBtn.addEventListener("click", () => {
          const note = noteInput.value.trim();
          let saved = 0;
          data.forEach((d) => {
            const b = byCell[l.cat + "|" + d.code];
            if (b && note) saveReduction(b.id, { note: note }, () => saved++);
          });
          BM.toast(note ? "✅ 注释已保存为因素分析（" + l.cat + "）" : "已清空注释（" + l.cat + "）");
        });
        row.innerHTML = `<div class="qc-cat"><b>${esc(l.cat)}</b></div>
          <div class="qc-nums">合计 <b>${money(l.amount)}</b> / 上年 <b>${money(l.lastYear)}</b> → ${trend}</div>
          <div class="qc-reason hint-text">${esc(reason)}</div>`;
        row.appendChild(noteInput);
        row.appendChild(saveBtn);
        qcPanel.appendChild(row);
      });
      qcPanel.style.display = "block";
      BM.toast("AI 报告质检完成：检出 " + lines.length + " 个事项的预算变化");
    });
  }).catch(() => { box.innerHTML = '<div class="empty">加载失败：后端未启动（请运行 server/ 模块）</div>'; });

  container.appendChild(page);
};

window.BM = BM;
