/* ================================================================
 * views/plan-bottomup.js — 自下而上填报（子视图）
 * 迁移自 views/plan.js（原 1120 行上帝文件，2026-09-04 拆分）
 * 依赖：data/*、core/*；plan 系列第二个加载（在 plan-topdown.js 之后）
 * 挂载 BM.plan.renderBottomup，共享可变态 BM.plan.pRows（原闭包 const pRows）
 * 说明：renderBottomup/buildAddablePlanCard/renderManagerBottomup/renderStaffBottomup 为 IIFE 私有；
 *   renderPlan 经 BM.plan.renderBottomup 引用。
 * ================================================================ */

(function () {
var BM = window.BM || {};
BM.plan = BM.plan || {};

/* ---------- 自下而上填报（v0.9：经理按本部门、员工按本人负责项目） ---------- */
function renderBottomup(container) {
  const role = BM.state.role;
  const wrap = el("div", "");
  const canEdit = role === "adminHead" || role === "expense" || role === "ceo" || role === "cooAnalyst";

  /* 公司行政负责人：按本部门项目 → 物料填报（看不到其他部门） */
  if (role === "adminHead") {
    return renderManagerBottomup(wrap);
  }

  /* 基层费用责任岗：按本人负责的项目 → 物料填报（v0.9） */
  if (role === "expense") {
    return renderStaffBottomup(wrap);
  }

  /* 集团 CEO/总经办预算管理员：保留部门下拉 + 按部门科目填报 */
  let depts = BM.DEPTS;

  const selRow = el("div", "filter-bar");
  selRow.style.marginBottom = "12px";
  const sel = el("select");
  sel.innerHTML = `<option value="all">全部部门（汇总视图）</option>` + BM.DEPTS.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("");
  sel.addEventListener("change", () => {
    depts = sel.value === "all" ? BM.DEPTS : BM.DEPTS.filter((d) => d.id === sel.value);
    const re = renderBottomup(container);
    container.innerHTML = "";
    container.appendChild(re);
  });
  selRow.appendChild(el("span", "hint-text", "按部门查看填报："));
  selRow.appendChild(sel);
  wrap.appendChild(selRow);

  depts.forEach((d) => {
    const block = el("div", "plan-editor");
    block.style.marginBottom = "14px";
    const head = el("div", "card-head");
    head.innerHTML = `<div class="card-title">${esc(d.name)}</div>
      <span class="card-tag badge badge-info">填报人：${esc(d.head)}</span>`;
    block.appendChild(head);

    const table = el("table");
    table.innerHTML = `<thead><tr>
      <th>科目</th><th style="text-align:right">填报预算（元）</th><th>AI 建议（年化）</th><th>历史已用</th>
    </tr></thead>`;
    const tbody = el("tbody");
    const suggs = BM.buildPlanSuggestion(d.id);
    const allCats = BM.CATEGORIES.filter((c) => suggs[c.id] !== undefined);

    if (!allCats.length) {
      tbody.appendChild(el("tr", "", `<td colspan="4"><div class="empty">该部门暂无历史费用数据，AI 无法预填建议</div></td>`));
    }

    allCats.forEach((c) => {
      const docs = BM.DOCS.filter((x) => x.catId === c.id && x.deptId === d.id);
      const used = docs.reduce((a, x) => a + x.amount, 0);
      const tr = el("tr");
      tr.innerHTML = `<td>${esc(c.name)}</td>
        <td style="text-align:right">${canEdit
          ? `<input type="number" step="10000" value="${suggs[c.id]}" data-dept="${d.id}" data-cat="${c.id}">`
          : `<span class="tbl-num">${suggs[c.id].toLocaleString()}</span>`}</td>
        <td><span class="ai-suggest-tag">AI 年化建议 ${suggs[c.id].toLocaleString()}</span></td>
        <td class="tbl-num">${used.toLocaleString()}</td>`;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    block.appendChild(table);
    wrap.appendChild(block);

    if (canEdit) {
      block.querySelectorAll("input").forEach((inp) => {
        inp.addEventListener("change", () => {
          const key = inp.dataset.dept + ":" + inp.dataset.cat;
          /* 记录到 plan.rows（reuse） */
          BM.plan.pRows[key] = parseInt(inp.value, 10) || 0;
        });
      });
    }
  });

  return wrap;
}

/* ================================================================
 * v0.11：可加预算项卡片（项目头部 ＋ 按钮）
 * 点击 ＋ → 菜单：[＋ 项目预算项] [＋ 物料预算项]
 * 项目预算项：新增一个项目（部门/员工层）
 * 物料预算项：在当前项目下新增一个单纯物料
 * ================================================================ */
function buildAddablePlanCard(container, p, ctx) {
  const info2 = BM.projectInfo(p);
  const block = el("div", "plan-editor");
  block.style.marginBottom = "14px";
  const head = el("div", "card-head");
  head.innerHTML = `<div class="card-icon" style="background:var(--c-info-bg);color:var(--c-info)">项</div>
    <div class="card-title">${esc(p.name)}</div>
    <span class="card-tag badge badge-info">${esc(info2.catName)}</span>
    <span class="card-tag badge badge-accent">当前额度 ${BM.money(p.budget)}</span>`;

  /* ＋ 新增菜单（头部右侧） */
  const plus = el("button", "btn btn-accent btn-sm plan-plus", "＋");
  plus.title = "新增预算项";
  const menu = el("div", "plan-add-menu");
  menu.style.display = "none";
  const mi1 = el("button", "add-menu-item", "＋ 项目预算项");
  mi1.addEventListener("click", () => { menu.style.display = "none"; openAddForm(true); });
  const mi2 = el("button", "add-menu-item", "＋ 物料预算项");
  mi2.addEventListener("click", () => { menu.style.display = "none"; openAddForm(false); });
  menu.appendChild(mi1);
  menu.appendChild(mi2);
  plus.addEventListener("click", () => { menu.style.display = menu.style.display === "none" ? "block" : "none"; });
  head.appendChild(plus);
  head.appendChild(menu);
  block.appendChild(head);

  /* 项目下的物料 */
  const mats = BM.MATERIALS.filter((m) => m.projectId === p.id);
  const table = el("table");
  table.innerHTML = `<thead><tr>
    <th>物料</th><th>规格</th><th>单位</th><th style="text-align:right">填报预算（元）</th><th>AI 建议</th><th>历史已用</th>
  </tr></thead>`;
  const tbody = el("tbody");

  if (!mats.length) {
    tbody.appendChild(el("tr", "", `<td colspan="6"><div class="empty">该项目暂无物料配置，点项目头部 ＋ 添加</div></td>`));
  }
  mats.forEach((m) => {
    const tr = el("tr");
    tr.innerHTML = `<td><b>${esc(m.name)}</b></td>
      <td class="hint-text">${esc(m.spec)}</td>
      <td>${esc(m.unit)}</td>
      <td style="text-align:right"><input type="number" step="1000" value="${m.budget || 0}" data-proj="${p.id}" data-mat="${m.id}"></td>
      <td><span class="ai-suggest-tag">AI 建议 ${(m.budget || 0).toLocaleString()}</span></td>
      <td class="tbl-num">${m.used.toLocaleString()}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  block.appendChild(table);

  /* 新增表单容器（＋ 菜单触发） */
  const formBox = el("div", "plan-actions");
  formBox.style.display = "none";
  block.appendChild(formBox);

  function openAddForm(isProject) {
    formBox.innerHTML = "";
    formBox.style.display = "flex";
    if (isProject) {
      const inp = el("input");
      inp.placeholder = "新项目名称（如：办公家具采购）";
      inp.style.width = "180px";
      const sel = el("select");
      sel.innerHTML = BM.CATEGORIES.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
      const amt = el("input");
      amt.type = "number";
      amt.placeholder = "预算金额";
      amt.style.width = "110px";
      const ok = el("button", "btn btn-primary btn-sm", "确认新增项目");
      ok.addEventListener("click", () => {
        const name = inp.value.trim();
        const a = parseInt(amt.value, 10) || 50000;
        if (!name) { BM.toast("请输入项目名称"); return; }
        BM.PROJECTS.push({ id: "P" + Date.now(), name, deptId: ctx.deptId, catId: sel.value, budget: a, used: 0, frozen: 0, owner: ctx.owner, ownerRole: ctx.ownerRole, status: "编制中", desc: "编制中新增" });
        BM.toast("✅ 已新增项目：" + name);
        BM.openView("plan");
      });
      formBox.appendChild(el("span", "hint-text", "新增项目："));
      formBox.appendChild(inp);
      formBox.appendChild(sel);
      formBox.appendChild(amt);
      formBox.appendChild(ok);
    } else {
      const inp = el("input");
      inp.placeholder = "新物料名称（如：办公桌）";
      inp.style.width = "150px";
      const amt = el("input");
      amt.type = "number";
      amt.placeholder = "预算金额";
      amt.style.width = "100px";
      const ok = el("button", "btn btn-primary btn-sm", "确认新增物料");
      ok.addEventListener("click", () => {
        const name = inp.value.trim();
        const a = parseInt(amt.value, 10) || 10000;
        if (!name) { BM.toast("请输入物料名称"); return; }
        BM.MATERIALS.push({ id: "M" + Date.now(), name, catId: p.catId, projectId: p.id, budget: a, used: 0, unit: "批", spec: "新增" });
        BM.toast("✅ 已新增物料：" + name);
        BM.openView("plan");
      });
      formBox.appendChild(el("span", "hint-text", `新增物料（${esc(p.name)}）：`));
      formBox.appendChild(inp);
      formBox.appendChild(amt);
      formBox.appendChild(ok);
    }
  }

  container.appendChild(block);

  block.querySelectorAll("input[data-mat]").forEach((inp) => {
    inp.addEventListener("change", () => {
      BM.plan.pRows[inp.dataset.proj + ":" + inp.dataset.mat] = parseInt(inp.value, 10) || 0;
      BM.toast("已保存填报：" + p.name);
    });
  });
}

/* ---------- 部门经理填报：本部门项目 → 物料（v0.11：头部 ＋ 可新增） ---------- */
function renderManagerBottomup(wrap) {
  const myDeptId = BM.state.deptId;
  const dept = BM.DEPTS.find((d) => d.id === myDeptId) || {};
  const projects = BM.PROJECTS.filter((p) => p.deptId === myDeptId);

  /* 部门信息卡（差异化表达：自下而上可新增） */
  const info = el("div", "plan-statusbar");
  info.innerHTML = `<span class="badge badge-info">本部门：${esc(dept.name)}</span>
    <span class="badge badge-ok">可新增 · 可编辑</span>
    <span class="hint-text">自下而上：您是预算上报方，每个项目头部 ＋ 可新增项目/物料 · 其他部门数据不可见</span>`;
  wrap.appendChild(info);

  if (!projects.length) {
    wrap.appendChild(el("div", "empty", `<div class="empty-ico">🗂</div>本部门暂无项目，点击下方按钮新增`));
  }

  const ctx = { deptId: myDeptId, owner: dept.head, ownerRole: "adminHead" };
  projects.forEach((p) => {
    buildAddablePlanCard(wrap, p, ctx);
  });

  return wrap;
}

/* ---------- 员工填报：本人负责项目 → 物料（v0.11：头部 ＋ 可新增） ---------- */
function renderStaffBottomup(wrap) {
  const myProjects = BM.PROJECTS.filter((p) => p.owner === "张伟" && p.ownerRole === "expense");

  const info = el("div", "plan-statusbar");
  info.innerHTML = `<span class="badge badge-info">员工：张伟（IT 部）</span>
    <span class="badge badge-ok">可新增 · 可编辑</span>
    <span class="hint-text">自下而上：您按自己负责的项目上报预算 · 每个项目头部 ＋ 可新增项目/物料 · 共 ${myProjects.length} 个项目</span>`;
  wrap.appendChild(info);

  if (!myProjects.length) {
    wrap.appendChild(el("div", "empty", `<div class="empty-ico">🗂</div>您暂未负责项目`));
  }

  const ctx = { deptId: "it", owner: "张伟", ownerRole: "expense" };
  myProjects.forEach((p) => {
    buildAddablePlanCard(wrap, p, ctx);
  });

  return wrap;
}

/* 自下而上填报的临时存储（页面级） */
BM.plan.pRows = {};

BM.plan.renderBottomup = renderBottomup;

window.BM = BM;
})();
