/* ================================================================
 * basedata.js — 基础数据管理（B1–B7）
 *  聚合页（两个 Tab）：
 *    · 经济事项（economic_event）：预算编制的明细单元
 *    · 会计科目（account_subject）：由经济事项自动归集 + 可手动维护
 *  权限：管理员 / 财务经理 / 总经办负责人 / 总经办预算管理员 / 职能中心归口责任人 可编辑
 *        （前端 BM.canEditBaseData 与后端 requireBaseDataEditor 双闸）
 * ================================================================ */

var BM = window.BM || {};




const METHOD_LABELS = {
  manageStd: "管控标准",
  volume: "收入挂钩",
  qtyPrice: "量价",
  manual: "据实/手动",
  actual: "按实际",
};
function methodLabel(m) { return METHOD_LABELS[m] || (m ? m : "待填"); }

const METHOD_OPTIONS = [
  { v: "", t: "待填（未设定）" },
  { v: "manageStd", t: "管控标准" },
  { v: "volume", t: "收入挂钩" },
  { v: "qtyPrice", t: "量价" },
  { v: "manual", t: "据实/手动" },
  { v: "actual", t: "按实际" },
];
function methodSelect(selected) {
  return `<select class="bd-input" id="bd_method">${METHOD_OPTIONS.map((o) => `<option value="${o.v}" ${o.v === selected ? "selected" : ""}>${o.t}</option>`).join("")}</select>`;
}

/* ---------- 入口 ---------- */
BM.renderBaseData = function (container, opts) {
  opts = opts || {};
  container.innerHTML = "";
  const page = el("div", "page");

  const head = el("div", "page-head");
  head.appendChild(el("div", "", `<div class="page-title">基础数据管理</div>
    <div class="page-desc">维护预算编制的基础字典：经济事项与会计科目 · 科目由经济事项自动归集生成，亦支持手动维护</div>`));
  page.appendChild(head);

  const canEdit = !!(BM.canEditBaseData && BM.canEditBaseData());
  const canEditOrg = !!(BM.canEditOrg && BM.canEditOrg());
  if (!canEdit) {
    page.appendChild(el("div", "bd-readonly", `🔒 当前角色仅有查看权限；基础数据维护需管理员 / 财务经理 / 总经办 / 归口责任人`));
  }

  /* Tab 切换 */
  const tabs = el("div", "bd-tabs");
  const tabEvents = el("button", "bd-tab active", "经济事项");
  const tabSubjects = el("button", "bd-tab", "会计科目");
  const tabOrg = el("button", "bd-tab", "组织架构");
  tabs.appendChild(tabEvents);
  tabs.appendChild(tabSubjects);
  tabs.appendChild(tabOrg);
  page.appendChild(tabs);

  const body = el("div", "bd-body");
  page.appendChild(body);
  container.appendChild(page);

  let curTab = (opts.tab && ["events", "subjects", "org"].includes(opts.tab)) ? opts.tab : "events";
  function switchTab(t) {
    curTab = t;
    tabEvents.classList.toggle("active", t === "events");
    tabSubjects.classList.toggle("active", t === "subjects");
    tabOrg.classList.toggle("active", t === "org");
    renderBody();
  }
  tabEvents.addEventListener("click", () => switchTab("events"));
  tabSubjects.addEventListener("click", () => switchTab("subjects"));
  tabOrg.addEventListener("click", () => switchTab("org"));

  function renderBody() {
    body.innerHTML = "";
    if (curTab === "events") renderEventsTab(body, canEdit);
    else if (curTab === "subjects") renderSubjectsTab(body, canEdit);
    else renderOrgTab(body, canEditOrg);
  }
  renderBody();
};

/* ---------- 经济事项 Tab ---------- */
function renderEventsTab(body, canEdit) {
  body.innerHTML = "";
  const toolbar = el("div", "bd-toolbar");
  if (canEdit) {
    const add = el("button", "btn btn-primary", "＋ 新增经济事项");
    add.addEventListener("click", () => {
      Promise.all([BM.apiGet("/api/events"), BM.apiGet("/api/subjects")])
        .then(([events, subjects]) => openEventModal(null, subjects, events, body))
        .catch(() => BM.toast("加载失败，请稍后重试"));
    });
    toolbar.appendChild(add);
  }
  toolbar.appendChild(el("div", "bd-count", "加载中…"));
  body.appendChild(toolbar);

  const wrap = el("div", "tbl-wrap");
  wrap.innerHTML = `<table class="bd-table"><thead><tr>
    <th>经济事项</th><th>会计科目</th><th>归口中心</th><th>编制方法</th><th class="bd-op">操作</th>
  </tr></thead><tbody><tr><td colspan="5" class="bd-empty">加载中…</td></tr></tbody></table>`;
  body.appendChild(wrap);

  Promise.all([
    BM.apiGet("/api/events"),
    BM.apiGet("/api/subjects"),
  ]).then(([events, subjects]) => {
    const subMap = {};
    subjects.forEach((s) => (subMap[s.id] = s));
    toolbar.querySelector(".bd-count").textContent = `共 ${events.length} 条经济事项`;
    const tbody = wrap.querySelector("tbody");
    if (!events.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="bd-empty">暂无经济事项</td></tr>`;
      return;
    }
    tbody.innerHTML = "";
    events.forEach((ev) => {
      const sub = ev.subjectId != null ? subMap[ev.subjectId] : null;
      const acct = sub ? `${esc(sub.code)} · ${esc(sub.name)}` : (ev.acctCode ? esc(ev.acctCode) : "—");
      const tr = el("tr");
      tr.innerHTML = `<td>${esc(ev.cat)}</td>
        <td>${acct}</td>
        <td>${esc(ev.center || "—")}</td>
        <td>${esc(methodLabel(ev.method))}</td>
        <td class="bd-op"></td>`;
      const op = tr.querySelector(".bd-op");
      if (canEdit) {
        const edit = el("button", "btn btn-ghost btn-sm", "编辑");
        edit.addEventListener("click", () => openEventModal(ev, subjects, events, body));
        const del = el("button", "btn btn-ghost btn-sm bd-del", "删除");
        del.addEventListener("click", () => confirmDelete("经济事项", ev.cat, () => {
          BM.apiSend("/api/events/" + ev.id, "DELETE")
            .then(() => { BM.toast("✅ 已删除经济事项"); renderEventsTab(body, canEdit); })
            .catch((d) => BM.toast("⛔ " + (d && d.error ? d.error : "删除失败")));
        }));
        op.appendChild(edit); op.appendChild(del);
      } else {
        op.textContent = "—";
      }
      tbody.appendChild(tr);
    });
  }).catch(() => {
    wrap.querySelector("tbody").innerHTML = `<tr><td colspan="5" class="bd-empty">⚠️ 加载失败</td></tr>`;
  });
}

/* ---------- 会计科目 Tab ---------- */
function renderSubjectsTab(body, canEdit) {
  body.innerHTML = "";
  const toolbar = el("div", "bd-toolbar");
  if (canEdit) {
    const add = el("button", "btn btn-primary", "＋ 新增科目");
    add.addEventListener("click", () => openSubjectModal(null, body));
    toolbar.appendChild(add);
  }
  toolbar.appendChild(el("div", "bd-count", "加载中…"));
  body.appendChild(toolbar);

  const wrap = el("div", "tbl-wrap");
  wrap.innerHTML = `<table class="bd-table"><thead><tr>
    <th>科目编码</th><th>科目名称</th><th>类别</th><th>归口中心</th><th>编制方法</th><th class="bd-op">操作</th>
  </tr></thead><tbody><tr><td colspan="5" class="bd-empty">加载中…</td></tr></tbody></table>`;
  body.appendChild(wrap);

  BM.apiGet("/api/subjects")
    .then((subjects) => {
      toolbar.querySelector(".bd-count").textContent = `共 ${subjects.length} 个会计科目`;
      const tbody = wrap.querySelector("tbody");
      if (!subjects.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="bd-empty">暂无会计科目</td></tr>`;
        return;
      }
      tbody.innerHTML = "";
      subjects.forEach((s) => {
        const tr = el("tr");
        tr.innerHTML = `<td class="tbl-num">${esc(s.code)}</td>
          <td>${esc(s.name)}</td>
          <td>${esc(s.cat || "—")}</td>
          <td>${esc(s.center || "—")}</td>
          <td>${esc(methodLabel(s.method))}</td>
          <td class="bd-op"></td>`;
        const op = tr.querySelector(".bd-op");
        if (canEdit) {
          const edit = el("button", "btn btn-ghost btn-sm", "编辑");
          edit.addEventListener("click", () => openSubjectModal(s, body));
          const del = el("button", "btn btn-ghost btn-sm bd-del", "删除");
          del.addEventListener("click", () => confirmDelete("会计科目", s.code, () => {
            BM.apiSend("/api/subjects/" + s.id, "DELETE")
              .then(() => { BM.toast("✅ 已删除科目"); renderSubjectsTab(body, canEdit); })
              .catch((d) => BM.toast("⛔ " + (d && d.error ? d.error : "删除失败")));
          }));
          op.appendChild(edit); op.appendChild(del);
        } else {
          op.textContent = "—";
        }
        tbody.appendChild(tr);
      });
    })
    .catch(() => {
      wrap.querySelector("tbody").innerHTML = `<tr><td colspan="5" class="bd-empty">⚠️ 加载失败</td></tr>`;
    });
}

/* ---------- 模态 ---------- */
function openModal(title) {
  const mask = el("div", "modal-mask");
  const modal = el("div", "modal");
  const head = el("div", "modal-head");
  head.appendChild(el("div", "modal-title", title));
  const close = el("button", "modal-close", "×");
  head.appendChild(close);
  const body = el("div", "modal-body");
  modal.appendChild(head); modal.appendChild(body);
  mask.appendChild(modal);
  document.body.appendChild(mask);
  const closeFn = () => mask.remove();
  close.addEventListener("click", closeFn);
  mask.addEventListener("click", (e) => { if (e.target === mask) closeFn(); });
  return { body, close: closeFn };
}

function confirmDelete(kind, name, onYes) {
  const m = openModal("删除确认");
  m.body.innerHTML = `<div class="bd-confirm">确定删除${esc(kind)}「${esc(name)}」吗？此操作不可撤销。</div>
    <div class="bd-modal-ops">
      <button class="btn btn-ghost" id="bdCancel">取消</button>
      <button class="btn btn-primary bd-del" id="bdYes">确认删除</button>
    </div>`;
  m.body.querySelector("#bdCancel").addEventListener("click", m.close);
  m.body.querySelector("#bdYes").addEventListener("click", () => { m.close(); onYes(); });
}

/* ---------- 会计科目 表单 ---------- */
function openSubjectModal(subject, reloadBody) {
  const isEdit = !!subject;
  const m = openModal(isEdit ? "编辑会计科目" : "新增会计科目");
  const s = subject || {};
  m.body.innerHTML = `
    <div class="bd-field"><label>科目编码 *</label><input class="bd-input" id="f_code" value="${esc(s.code || "")}" placeholder="如 6602.12"></div>
    <div class="bd-field"><label>科目名称</label><input class="bd-input" id="f_name" value="${esc(s.name || "")}"></div>
    <div class="bd-field"><label>类别</label><input class="bd-input" id="f_cat" value="${esc(s.cat || "")}" placeholder="如 外部服务"></div>
    <div class="bd-field"><label>归口中心</label><input class="bd-input" id="f_center" value="${esc(s.center || "")}"></div>
    <div class="bd-field"><label>编制方法</label>${methodSelect(s.method)}
      <div class="bd-hint">ⓘ 编制方法需人工核定；下方「客户预算逻辑」仅供参考，不自动套用。</div></div>
    <div class="bd-ref"><div class="bd-ref-title">客户预算逻辑（参考 · 只读）</div><div class="bd-ref-body">${esc(s.controlLogic || "（该科目在总经办逻辑表单中无对应条目）")}</div></div>
    <div class="bd-field"><label>排序号</label><input class="bd-input" id="f_sort" type="number" value="${s.sortNo != null ? s.sortNo : 0}"></div>
    <div class="bd-modal-ops">
      <button class="btn btn-ghost" id="f_cancel">取消</button>
      <button class="btn btn-primary" id="f_save">${isEdit ? "保存" : "创建"}</button>
    </div>`;
  m.body.querySelector("#f_cancel").addEventListener("click", m.close);
  m.body.querySelector("#f_save").addEventListener("click", () => {
    const payload = {
      code: m.body.querySelector("#f_code").value.trim(),
      name: m.body.querySelector("#f_name").value.trim(),
      cat: m.body.querySelector("#f_cat").value.trim(),
      center: m.body.querySelector("#f_center").value.trim(),
      method: m.body.querySelector("#bd_method").value,
      sortNo: Number(m.body.querySelector("#f_sort").value) || 0,
    };
    if (!payload.code) { BM.toast("⛔ 科目编码不能为空"); return; }
    const url = isEdit ? "/api/subjects/" + s.id : "/api/subjects";
    const method = isEdit ? "PUT" : "POST";
    BM.apiSend(url, method, payload)
      .then(() => { m.close(); BM.toast(isEdit ? "✅ 已保存" : "✅ 已创建科目"); renderSubjectsTab(reloadBody, true); })
      .catch((d) => BM.toast("⛔ " + (d && d.error ? d.error : "保存失败")));
  });
}

/* ---------- 经济事项 表单 ---------- */
function openEventModal(event, subjects, events, reloadBody) {
  const isEdit = !!event;
  const m = openModal(isEdit ? "编辑经济事项" : "新增经济事项");
  const e = event || {};
  const subOpts = `<option value="">（未关联）</option>` + subjects.map((s) => `<option value="${s.id}" ${s.id === e.subjectId ? "selected" : ""}>${esc(s.code)} · ${esc(s.name)}</option>`).join("");
  m.body.innerHTML = `
    <div class="bd-field"><label>经济事项名称 *</label><input class="bd-input" id="e_cat" value="${esc(e.cat || "")}" placeholder="如 食堂费用"></div>
    <div class="bd-field"><label>关联会计科目</label><select class="bd-input" id="e_sub">${subOpts}</select></div>
    <div class="bd-field"><label>归口中心</label><input class="bd-input" id="e_center" value="${esc(e.center || "")}"></div>
    <div class="bd-field"><label>编制方法</label>${methodSelect(e.method)}</div>
    <div class="bd-hint">ⓘ 预算类金额（本年预算、上年预算、上年决算等）属业务数据，不在基础数据中维护，由编制 / 填报阶段另行生成。</div>
    <div class="bd-modal-ops">
      <button class="btn btn-ghost" id="e_cancel">取消</button>
      <button class="btn btn-primary" id="e_save">${isEdit ? "保存" : "创建"}</button>
    </div>`;
  m.body.querySelector("#e_cancel").addEventListener("click", m.close);
  m.body.querySelector("#e_save").addEventListener("click", () => {
    const subVal = m.body.querySelector("#e_sub").value;
    const payload = {
      cat: m.body.querySelector("#e_cat").value.trim(),
      subjectId: subVal ? Number(subVal) : null,
      center: m.body.querySelector("#e_center").value.trim(),
      method: m.body.querySelector("#bd_method").value,
    };
    if (!payload.cat) { BM.toast("⛔ 经济事项名称不能为空"); return; }
    const url = isEdit ? "/api/events/" + e.id : "/api/events";
    const method = isEdit ? "PUT" : "POST";
    BM.apiSend(url, method, payload)
      .then(() => { m.close(); BM.toast(isEdit ? "✅ 已保存" : "✅ 已创建经济事项"); renderEventsTab(reloadBody, true); })
      .catch((d) => BM.toast("⛔ " + (d && d.error ? d.error : "保存失败")));
  });
}

/* ---------- 组织架构 Tab（C3，2026-08-24） ---------- */
function ocFlatten(tree) {
  const out = [];
  (function walk(ns) { (ns || []).forEach((n) => { out.push(n); walk(n.children || []); }); })(tree || []);
  return out;
}
function ocDescendantIds(tree, id) {
  const flat = ocFlatten(tree);
  const node = flat.find((n) => n.id === id);
  if (!node) return [];
  return ocFlatten(node.children || []).map((n) => n.id);
}

function renderOrgTab(body, canEditOrg) {
  body.innerHTML = "";
  const wrap = el("div", "bd-orgchart");
  wrap.innerHTML = `<div class="hint-text">组织架构加载中…</div>`;
  body.appendChild(wrap);
  BM.apiGet("/api/orgs/tree")
    .then((tree) => {
      wrap.innerHTML = "";
      if (!Array.isArray(tree) || !tree.length) { wrap.innerHTML = `<div class="hint-text">未获取到组织数据</div>`; return; }
      BM.renderOrgChart(wrap, tree, {
        editable: canEditOrg,
        onNodeClick: (node) => openOrgModal(node, tree, body, canEditOrg, null),
        onAdd: () => openOrgModal(null, tree, body, canEditOrg, null),
      });
    })
    .catch(() => { wrap.innerHTML = `<div class="hint-text">组织数据加载失败</div>`; });
}

function openOrgModal(node, tree, reloadBody, canEditOrg, forcedParentId) {
  const isEdit = !!node;
  const m = openModal(isEdit ? "编辑组织架构" : "新增组织架构");
  const flat = ocFlatten(tree);
  /* 父级下拉：编辑时排除自身及后代（防环）；新建子级时默认父级=当前节点 */
  const exclude = isEdit ? new Set([node.id].concat(ocDescendantIds(tree, node.id))) : new Set();
  const parentOpts = `<option value="">（无上级 / 根节点）</option>` + flat
    .filter((o) => !exclude.has(o.id))
    .map((o) => `<option value="${o.id}" ${isEdit && node.parent_id != null && node.parent_id === o.id ? "selected" : ""}>${esc(o.name)}（${esc(o.code)}）</option>`)
    .join("");
  const defaultParent = isEdit
    ? (node.parent_id != null ? String(node.parent_id) : "")
    : (forcedParentId != null ? String(forcedParentId) : (flat[0] ? String(flat[0].id) : ""));

  /* 类型下拉：group/unit/dept/center */
  const TYPE_OPTS = [
    { v: "unit", t: "单位（二级单位）" },
    { v: "dept", t: "部门（三级部门）" },
    { v: "center", t: "管理中心" },
    { v: "group", t: "集团总部" },
  ];
  const curType = isEdit ? (node.type || "unit") : "unit";
  const typeOpts = TYPE_OPTS.map((o) => `<option value="${o.v}" ${o.v === curType ? "selected" : ""}>${o.t}</option>`).join("");

  /* 归属管理中心下拉：仅列 type=center 的节点 */
  const centerNodes = flat.filter((o) => o.type === "center");
  const centerOpts = `<option value="">（未归口 / 不挂靠管理中心）</option>` + centerNodes
    .map((o) => `<option value="${o.id}" ${isEdit && node.managedCenterId != null && node.managedCenterId === o.id ? "selected" : ""}>${esc(o.name)}（${esc(o.code)}）</option>`)
    .join("");
  const showCenter = curType === "unit" || curType === "dept" || (isEdit && (node.type === "unit" || node.type === "dept"));
  /* 归属事业部下拉：仅列 code 以 BU- 开头的事业部节点（公司/单位可归属） */
  const buNodes = flat.filter((o) => o.code && /^BU-/.test(o.code));
  const buOpts = `<option value="">（未归属事业部）</option>` + buNodes
    .map((o) => `<option value="${o.code}" ${isEdit && node.buCode && node.buCode === o.code ? "selected" : ""}>${esc(o.name)}（${esc(o.code)}）</option>`)
    .join("");
  const showBu = curType === "unit" || (isEdit && node.type === "unit");

  m.body.innerHTML = `
    ${isEdit ? "" : `<div class="bd-field"><label>组织编码 *</label><input class="bd-input" id="o_code" value="" placeholder="如 BU-99"></div>`}
    <div class="bd-field"><label>组织名称 *</label><input class="bd-input" id="o_name" value="${esc(isEdit ? node.name : "")}"></div>
    <div class="bd-field"><label>组织类型</label><select class="bd-input" id="o_type">${typeOpts}</select></div>
    <div class="bd-field"><label>隶属上级</label><select class="bd-input" id="o_parent">${parentOpts}</select></div>
    <div class="bd-field" id="o_center_field" style="${showCenter ? "" : "display:none"}"><label>归属管理中心</label><select class="bd-input" id="o_center">${centerOpts}</select>
      <div class="bd-hint">单位 / 部门可挂靠某个管理中心，建立归口 / 管理关系（一对多：1 中心管 N 部门）。</div></div>
    <div class="bd-field" id="o_bu_field" style="${showBu ? "" : "display:none"}"><label>归属事业部 (BU)</label><select class="bd-input" id="o_bu">${buOpts}</select>
      <div class="bd-hint">单位（公司）可归属到某个事业部，预算跟踪按事业部聚合下属公司真实预算 / 执行。初始值由系统按编码规则推断，可在此纠偏。</div></div>
    ${isEdit ? `<div class="bd-field"><label>级别（深度自动推导）</label><span class="bd-static">${esc(node.level || "—")}</span></div>` : ""}
    <div class="bd-modal-ops">
      ${isEdit ? `<button class="btn btn-ghost" id="o_child">＋ 新增子级</button><button class="btn btn-ghost bd-del" id="o_del">删除</button>` : ""}
      <button class="btn btn-ghost" id="o_cancel">取消</button>
      <button class="btn btn-primary" id="o_save">${isEdit ? "保存" : "创建"}</button>
    </div>`;
  const pSel = m.body.querySelector("#o_parent");
  if (pSel && defaultParent !== "") pSel.value = defaultParent;
  const typeSel = m.body.querySelector("#o_type");
  const centerField = m.body.querySelector("#o_center_field");
  typeSel.addEventListener("change", () => {
    const t = typeSel.value;
    /* 管理中心 / 集团总部 不需要挂靠管理中心；单位 / 部门 才显示 */
    centerField.style.display = (t === "unit" || t === "dept") ? "" : "none";
    const buField = m.body.querySelector("#o_bu_field");
    if (buField) buField.style.display = (t === "unit") ? "" : "none";
  });

  m.body.querySelector("#o_cancel").addEventListener("click", m.close);

  function doSave() {
    const name = m.body.querySelector("#o_name").value.trim();
    if (!name) { BM.toast("⛔ 组织名称不能为空"); return; }
    const pv = m.body.querySelector("#o_parent").value;
    const type = typeSel.value;
    const payload = { name, parentId: pv === "" ? null : Number(pv), type };
    if (type === "unit" || type === "dept") {
      const cv = m.body.querySelector("#o_center").value;
      payload.managedCenterId = cv === "" ? null : Number(cv);
    } else {
      payload.managedCenterId = null;
    }
    if (type === "unit") {
      const bv = m.body.querySelector("#o_bu").value;
      payload.buCode = bv === "" ? null : bv;
    } else {
      payload.buCode = null;
    }
    if (!isEdit) {
      const code = m.body.querySelector("#o_code").value.trim();
      if (!code) { BM.toast("⛔ 组织编码不能为空"); return; }
      payload.code = code;
    }
    const url = isEdit ? "/api/orgs/" + node.id : "/api/orgs";
    BM.apiSend(url, isEdit ? "PUT" : "POST", payload)
      .then(() => { m.close(); BM.toast(isEdit ? "✅ 已保存" : "✅ 已创建组织"); renderOrgTab(reloadBody, canEditOrg); })
      .catch((d) => BM.toast("⛔ " + (d && d.error ? d.error : "保存失败")));
  }
  m.body.querySelector("#o_save").addEventListener("click", doSave);

  if (isEdit) {
    m.body.querySelector("#o_child").addEventListener("click", () => { m.close(); openOrgModal(null, tree, reloadBody, canEditOrg, node.id); });
    m.body.querySelector("#o_del").addEventListener("click", () => {
      confirmDelete("组织架构", node.name, () => {
        BM.apiSend("/api/orgs/" + node.id, "DELETE")
          .then(() => { m.close(); BM.toast("✅ 已删除组织"); renderOrgTab(reloadBody, canEditOrg); })
          .catch((d) => BM.toast("⛔ " + (d && d.error ? d.error : "删除失败")));
      });
    });
  }
}

window.BM.renderBaseData = BM.renderBaseData;
window.BM = BM;
