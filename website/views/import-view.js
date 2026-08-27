/* ================================================================
 * import-view.js — 费控 Excel 导入入口（M8 集成层 · v0.13 · P1）
 * 设计（产品设计稿 V1 §5.5 / §M8 / D4）：
 *   - 模板下载（生成 CSV 模板，列 = 费控导出规范）
 *   - 上传（本地模拟解析：CSV 走 FileReader，否则用样例数据）
 *   - 列映射 / 对账展示（部门、科目映射 + 重复检测）
 *   - 错误行提示（未匹配部门/科目、金额为负、缺必填列）
 * 后端接入点用 TODO 标注（一期不接真实费控/不解析 xlsx，仅模拟）。
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

/* 模板列（费控导出规范，一期约定） */
const IMPORT_COLUMNS = ["公司代码", "部门", "科目", "经济事项", "金额", "日期", "供应商", "类型", "说明"];

/* 生成模板 CSV 文本 */
function buildTemplateCsv() {
  const header = IMPORT_COLUMNS.join(",");
  const sample = [
    "2010,行政部,办公用品,打印纸季度采购,45200,2026-03-15,晨光办公,采购,季度耗材",
    "2010,IT 部,IT 设备,服务器扩容,180000,2026-05-20,华联电子,采购,产能扩容",
    "2020,市场部,业务招待,客户接待,67500,2026-06-10,粤香楼,报销,客户宴请",
  ];
  return "﻿" + header + "\n" + sample.join("\n") + "\n";
}

/* 样例解析数据（模拟费控导出，含正常/异常行） */
function sampleParsedRows() {
  return [
    { company: "2010", dept: "行政部", cat: "办公用品", event: "打印纸季度采购", amount: 45200, date: "2026-03-15", supplier: "晨光办公", type: "采购", note: "季度耗材" },
    { company: "2010", dept: "IT 部", cat: "IT 设备", event: "服务器扩容", amount: 180000, date: "2026-05-20", supplier: "华联电子", type: "采购", note: "产能扩容" },
    { company: "2020", dept: "市场部", cat: "业务招待", event: "客户接待", amount: 67500, date: "2026-06-10", supplier: "粤香楼", type: "报销", note: "客户宴请" },
    { company: "2020", dept: "销售部", cat: "差旅费", event: "季度机票", amount: 89000, date: "2026-04-18", supplier: "携程商旅", type: "报销", note: "出差" },
    /* 异常行：金额为负 */
    { company: "2010", dept: "行政部", cat: "物业费", event: "保洁服务", amount: -12000, date: "2026-07-01", supplier: "恒信物业", type: "采购", note: "退款冲销未标注" },
    /* 异常行：部门未匹配（错字） */
    { company: "2010", dept: "行征部", cat: "办公用品", event: "文具", amount: 32000, date: "2026-08-02", supplier: "得力办公", type: "采购", note: "部门名错误" },
    /* 异常行：科目未匹配 */
    { company: "2010", dept: "行政部", cat: "通讯费", event: "电话费", amount: 18000, date: "2026-08-10", supplier: "电信", type: "报销", note: "科目不在字典" },
    /* 异常行：缺金额 */
    { company: "2010", dept: "人事部", cat: "培训费", event: "集训", amount: "", date: "2026-08-22", supplier: "领航咨询", type: "报销", note: "金额缺失" },
  ];
}

/* 解析 CSV 文本为行对象 */
function parseCsv(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = lines[0].split(",").map((s) => s.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    header.forEach((h, i) => (row[h] = (cells[i] || "").trim()));
    return {
      company: row["公司代码"] || "", dept: row["部门"] || "", cat: row["科目"] || "",
      event: row["经济事项"] || "", amount: row["金额"] || "", date: row["日期"] || "",
      supplier: row["供应商"] || "", type: row["类型"] || "", note: row["说明"] || "",
    };
  });
}

/* 对账：映射 + 错误检测（确定性） */
function reconcile(rows) {
  const result = { rows: [], matched: 0, errorCount: 0, totalAmount: 0 };
  rows.forEach((r, idx) => {
    const dept = BM.DEPTS.find((d) => d.name === r.dept);
    const cat = BM.CATEGORIES.find((c) => c.name === r.cat);
    const amount = parseFloat(r.amount);
    const errors = [];
    if (!dept) errors.push("部门「" + r.dept + "」不在组织字典");
    if (!cat) errors.push("科目「" + r.cat + "」不在科目字典");
    if (!(amount >= 0) || isNaN(amount)) errors.push("金额非法（" + r.amount + "）");
    const ok = errors.length === 0;
    if (ok) { result.matched++; result.totalAmount += amount; }
    else result.errorCount++;
    result.rows.push({
      idx: idx + 1, raw: r, deptId: dept ? dept.id : null, catId: cat ? cat.id : null,
      amount: isNaN(amount) ? 0 : amount, ok: ok, errors: errors,
    });
  });
  return result;
}

function renderImportView(container) {
  container.innerHTML = "";
  const page = el("div", "page");
  const role = BM.state.role;

  const head = el("div", "page-head");
  head.appendChild(
    el("div", "", `<div class="page-title">费控 Excel 导入</div>
      <div class="page-desc">一期单向人工导入（D4）· 模板 + 映射 + 对账 + 重复检测 · 本地模拟解析</div>`)
  );
  page.appendChild(head);
  BM.renderRoleHint(page, "importView");

  /* 步骤条 */
  const steps = el("div", "plan-statusbar");
  steps.innerHTML = `<span class="badge badge-gray">① 下载模板</span><span class="flow-arrow">→</span>
    <span class="badge badge-gray">② 上传文件</span><span class="flow-arrow">→</span>
    <span class="badge badge-gray">③ 映射 / 对账</span><span class="flow-arrow">→</span>
    <span class="badge badge-gray">④ 错误修正</span><span class="flow-arrow">→</span>
    <span class="badge badge-gray">⑤ 导入预算追踪</span>`;
  page.appendChild(steps);

  /* ① 模板下载 */
  page.appendChild(el("div", "section-title", "① 下载导入模板"));
  const tplRow = el("div", "filter-bar");
  const dlBtn = el("button", "btn btn-outline btn-sm", "📄 下载 CSV 模板");
  dlBtn.addEventListener("click", () => {
    const csv = buildTemplateCsv();
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "费控导入模板_2026.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      BM.toast("✅ 模板已下载");
    } catch (e) {
      BM.toast("当前环境不支持下载，模板内容已打印到控制台");
      console.log(csv);
    }
  });
  tplRow.appendChild(dlBtn);
  tplRow.appendChild(el("span", "hint-text", "列：" + IMPORT_COLUMNS.join(" / ")));
  page.appendChild(tplRow);

  /* ② 上传 */
  page.appendChild(el("div", "section-title", "② 上传费控导出文件"));
  const upRow = el("div", "filter-bar");
  const fileInput = el("input");
  fileInput.type = "file";
  fileInput.accept = ".csv,.xlsx,.xls";
  fileInput.id = "importFile";
  const pickLabel = el("label", "btn btn-primary file-pick-label", "选择文件");
  pickLabel.setAttribute("for", "importFile");
  const pickName = el("span", "file-picker-name empty", "未选择文件");
  const filePicker = el("div", "file-picker");
  filePicker.appendChild(pickLabel);
  filePicker.appendChild(pickName);
  filePicker.appendChild(fileInput);
  upRow.appendChild(filePicker);
  const demoBtn = el("button", "btn btn-outline btn-sm", "使用示例数据试解析");
  upRow.appendChild(demoBtn);
  page.appendChild(upRow);
  const fileNote = el("div", "hint-text");
  fileNote.style.marginTop = "4px";
  fileNote.textContent = "支持 CSV（自动解析）/ Excel（一期模拟，忽略格式只取样例）；真实 xlsx 解析由后端完成（见 TODO）。";
  page.appendChild(fileNote);

  /* ③ 对账展示区 */
  page.appendChild(el("div", "section-title", "③ 映射 / 对账结果"));
  const resultBox = el("div", "");
  resultBox.id = "importResult";
  page.appendChild(resultBox);

  function renderResult(rc) {
    resultBox.innerHTML = "";
    /* 汇总卡 */
    const kpi = el("div", "kpi-grid");
    kpi.appendChild(el("div", "kpi accent", `<div class="kpi-label">总行数</div><div class="kpi-value">${rc.rows.length}</div>`));
    kpi.appendChild(el("div", "kpi", `<div class="kpi-label">可映射</div><div class="kpi-value" style="color:var(--c-ok)">${rc.matched}</div>`));
    kpi.appendChild(el("div", "kpi", `<div class="kpi-label">错误行</div><div class="kpi-value" style="color:${rc.errorCount ? "var(--c-danger)" : "var(--c-ok)"}">${rc.errorCount}</div>`));
    kpi.appendChild(el("div", "kpi", `<div class="kpi-label">可导入金额</div><div class="kpi-value">${BM.money(rc.totalAmount)}</div>`));
    resultBox.appendChild(kpi);

    /* 明细表 */
    const tbl = el("div", "tbl-wrap");
    tbl.style.marginTop = "12px";
    const table = el("table");
    table.innerHTML = `<thead><tr><th>#</th><th>部门</th><th>科目</th><th>经济事项</th><th style="text-align:right">金额</th><th>状态</th><th>错误提示</th></tr></thead>`;
    const tbody = el("tbody");
    rc.rows.forEach((row) => {
      const tr = el("tr");
      const stBadge = row.ok
        ? `<span class="badge badge-ok">可导入</span>`
        : `<span class="badge badge-danger">错误</span>`;
      const errText = row.ok ? "" : row.errors.join("；");
      tr.innerHTML = `<td class="tbl-num">${row.idx}</td>
        <td>${esc(row.raw.dept)}</td>
        <td>${esc(row.raw.cat)}</td>
        <td>${esc(row.raw.event)}</td>
        <td class="tbl-num" style="text-align:right">${isNaN(parseFloat(row.raw.amount)) ? "—" : BM.money(row.amount)}</td>
        <td>${stBadge}</td>
        <td class="hint-text" style="color:${row.ok ? "" : "var(--c-danger)"}">${esc(errText)}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tbl.appendChild(table);
    resultBox.appendChild(tbl);

    /* 导入按钮（仅当无错误） */
    const actions = el("div", "plan-actions");
    actions.style.marginTop = "12px";
    const importBtn = el("button", "btn btn-primary", "确认导入到预算追踪");
    importBtn.disabled = rc.errorCount > 0;
    if (rc.errorCount > 0) importBtn.style.opacity = "0.5";
    importBtn.addEventListener("click", () => {
      if (rc.errorCount > 0) { BM.toast("⛔ 请先修正 " + rc.errorCount + " 行错误"); return; }
      /* TODO（后端接入）：POST /api/actual/import { rows: rc.rows(已映射) }
       *   后端按五维+月度归集，与预算口径对齐，写入 M8 执行跟踪，触发超标预警。
       *   前端仅负责采集与展示，不持久化生产数据。 */
      BM.toast("✅ 已导入 " + rc.matched + " 行（" + BM.money(rc.totalAmount) + "）到预算追踪（模拟）");
    });
    actions.appendChild(importBtn);
    actions.appendChild(el("span", "hint-text", rc.errorCount > 0 ? "存在错误行，修正后或删除后再导入" : "导入后将进入执行跟踪看板（目标二）"));
    resultBox.appendChild(actions);
  }

  function handleRows(rows) {
    const rc = reconcile(rows);
    renderResult(rc);
  }

  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) {
      pickName.classList.remove("empty");
      pickName.innerHTML = "<b>" + esc(f.name) + "</b>";
    } else {
      pickName.classList.add("empty");
      pickName.textContent = "未选择文件";
    }
    if (!f) return;
    /* 尝试作为 CSV 读取（Excel 实际由后端解析，前端一期仅模拟） */
    if (typeof FileReader !== "undefined" && /\.csv$/i.test(f.name)) {
      const reader = new FileReader();
      reader.onload = () => {
        try { handleRows(parseCsv(String(reader.result))); }
        catch (e) { handleRows(sampleParsedRows()); }
      };
      reader.onerror = () => handleRows(sampleParsedRows());
      reader.readAsText(f, "utf-8");
    } else {
      BM.toast("Excel 解析由后端完成（D4 一期不接），已用样例数据模拟解析");
      handleRows(sampleParsedRows());
    }
  });

  demoBtn.addEventListener("click", () => {
    /* TODO（后端接入）：实际应从后端拉取费控导出样例；前端一期用内置样例演示映射/对账。 */
    handleRows(sampleParsedRows());
  });

  /* 默认先展示一次样例，避免空态 */
  handleRows(sampleParsedRows());

  container.appendChild(page);
}

window.BM.renderImportView = renderImportView;

/* 弹窗式二级子页面：从「预算跟踪」页右上角按钮触发（不作为左侧菜单项） */
BM.openImportModal = function () {
  const modalRoot = document.getElementById("modalRoot");
  if (!modalRoot) return;
  modalRoot.innerHTML = "";
  const mask = el("div", "modal-mask");
  const modal = el("div", "modal");
  const head = el("div", "modal-head");
  head.appendChild(el("div", "modal-title", "费控导入"));
  const closeBtn = el("button", "modal-close", "×");
  head.appendChild(closeBtn);
  modal.appendChild(head);
  const body = el("div", "modal-body");
  const close = () => { modalRoot.innerHTML = ""; };
  closeBtn.addEventListener("click", close);
  mask.addEventListener("click", (e) => { if (e.target === mask) close(); });
  modal.appendChild(body);
  mask.appendChild(modal);
  modalRoot.appendChild(mask);
  BM.renderImportView(body);
};

window.BM = BM;
