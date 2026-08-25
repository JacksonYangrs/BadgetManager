/* ================================================================
 * accounts.js — 账户与角色管理视图（模块三 · 仅系统管理员）
 *  - 用户列表：账号 / 姓名 / 所属组织 / 角色 / 状态
 *  - 新建账户：账号 + 初始密码 + 姓名 + 组织 + 角色（多选）
 *  - 编辑账户：改姓名 / 组织 / 角色 / 启停用 / 重置密码
 * 数据源：GET/POST/PUT /api/users、GET /api/roles、GET /api/orgs/tree
 * ================================================================ */

var BM = window.BM || {};

function aEl(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function aEsc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* 扁平化组织树 → 下拉选项 [{id, code, name}] */
function flattenOrgs(nodes, depth, out) {
  (nodes || []).forEach((n) => {
    out.push({ id: n.id, code: n.code, name: "　".repeat(depth) + n.name });
    flattenOrgs(n.children, depth + 1, out);
  });
  return out;
}

let orgOptions = [];
let roleOptions = [];
let userList = [];

function loadOptions() {
  return Promise.all([
    BM.apiGet("/api/orgs/tree").then((t) => (orgOptions = Array.isArray(t) ? flattenOrgs(t, 0, []) : [])).catch(() => (orgOptions = [])),
    BM.apiGet("/api/roles").then((r) => (roleOptions = Array.isArray(r) ? r : [])).catch(() => (roleOptions = [])),
  ]);
}

function refreshTable(container) {
  const tableWrap = aEl("div", "acc-table-wrap");
  const table = aEl("table", "acc-table");
  table.innerHTML = `<thead><tr>
    <th>账号</th><th>姓名</th><th>所属组织</th><th>角色</th><th>状态</th><th style="width:150px">操作</th>
  </tr></thead>`;
  const tb = aEl("tbody");
  userList.forEach((u) => {
    const tr = aEl("tr");
    const orgName = u.org ? u.org.name : "—";
    const roleNames = u.roles.map((r) => r.name).join(" / ") || "—";
    tr.innerHTML = `<td><b>${aEsc(u.username)}</b></td>
      <td>${aEsc(u.realName || "—")}</td>
      <td class="hint-text">${aEsc(orgName)}</td>
      <td class="hint-text">${aEsc(roleNames)}</td>
      <td>${u.active ? '<span class="badge badge-ok">启用</span>' : '<span class="badge badge-danger">停用</span>'}</td>`;
    const ops = aEl("td");
    if (BM.canEditAccounts && BM.canEditAccounts()) {
      const editBtn = aEl("button", "btn btn-outline btn-sm", "编辑");
      editBtn.addEventListener("click", () => openEditor(u));
      ops.appendChild(editBtn);
    } else {
      ops.appendChild(aEl("span", "hint-text", "—"));
    }
    tr.appendChild(ops);
    tb.appendChild(tr);
  });
  table.appendChild(tb);
  tableWrap.appendChild(table);
  container.appendChild(tableWrap);
}

function openEditor(u) {
  const modalRoot = document.getElementById("modalRoot");
  if (!modalRoot) return;
  modalRoot.innerHTML = "";
  const mask = aEl("div", "modal-mask");
  const modal = aEl("div", "modal");
  const head = aEl("div", "modal-head");
  head.appendChild(aEl("div", "modal-title", u ? "编辑账户 · " + u.username : "新建账户"));
  const closeBtn = aEl("button", "modal-close", "×");
  head.appendChild(closeBtn);
  modal.appendChild(head);

  const body = aEl("div", "modal-body");
  const isNew = !u;

  /* 表单 */
  const f = aEl("div", "acc-form");
  function field(label, input) {
    const row = aEl("div", "acc-field");
    row.appendChild(aEl("label", "", label));
    row.appendChild(input);
    f.appendChild(row);
    return row;
  }
  const nameInput = aEl("input");
  nameInput.type = "text";
  nameInput.placeholder = "姓名";
  nameInput.value = u ? u.realName || "" : "";
  field("姓名", nameInput);

  const userInput = aEl("input");
  userInput.type = "text";
  userInput.placeholder = "登录账号（唯一）";
  userInput.value = u ? u.username : "";
  if (u) userInput.disabled = true; /* 账号不可改 */
  field("账号", userInput);

  const pwdInput = aEl("input");
  pwdInput.type = "password";
  pwdInput.placeholder = u ? "留空则不修改密码" : "初始密码";
  field(u ? "重置密码" : "初始密码", pwdInput);

  const orgSel = aEl("select");
  orgSel.innerHTML = '<option value="">— 未分配组织 —</option>' + orgOptions.map((o) => `<option value="${o.id}">${aEsc(o.name)}</option>`).join("");
  if (u && u.org) orgSel.value = String(u.org.id);
  field("所属组织", orgSel);

  const roleSel = aEl("div", "acc-roles");
  roleOptions.forEach((r) => {
    const lab = aEl("label", "acc-role-opt");
    const cb = aEl("input");
    cb.type = "checkbox";
    cb.value = r.code;
    if (u && u.roles.some((x) => x.code === r.code)) cb.checked = true;
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(r.name));
    roleSel.appendChild(lab);
  });
  field("角色（可多选）", roleSel);

  const activeRow = aEl("div", "acc-field");
  const activeCb = aEl("input");
  activeCb.type = "checkbox";
  activeCb.checked = u ? !!u.active : true;
  activeRow.appendChild(aEl("label", "", "启用账户"));
  activeRow.appendChild(activeCb);
  f.appendChild(activeRow);

  body.appendChild(f);

  /* 保存 */
  const foot = aEl("div", "login-btn-row");
  foot.style.marginTop = "14px";
  const err = aEl("div", "login-err");
  err.style.display = "none";
  body.appendChild(err);
  const saveBtn = aEl("button", "btn btn-accent", "保 存");
  saveBtn.addEventListener("click", () => {
    const roleCodes = Array.from(roleSel.querySelectorAll("input:checked")).map((c) => c.value);
    const payload = {
      realName: nameInput.value.trim(),
      orgId: orgSel.value ? Number(orgSel.value) : null,
      roleCodes,
      active: activeCb.checked,
    };
    if (isNew) {
      if (!userInput.value.trim() || !pwdInput.value) {
        err.textContent = "新建账户必须填写账号和初始密码";
        err.style.display = "block";
        return;
      }
      payload.username = userInput.value.trim();
      payload.password = pwdInput.value;
    } else if (pwdInput.value) {
      payload.password = pwdInput.value;
    }
    const req = isNew
      ? fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (BM.state.token || "") }, body: JSON.stringify(payload) })
      : fetch("/api/users/" + u.id, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (BM.state.token || "") }, body: JSON.stringify(payload) });
    req.then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) {
          err.textContent = d.error || "保存失败";
          err.style.display = "block";
          return;
        }
        modalRoot.innerHTML = "";
        BM.toast(isNew ? "✅ 账户已创建：" + d.username : "✅ 账户已更新");
        load();
      })
      .catch(() => {
        err.textContent = "保存失败（请确认后端服务已启动）";
        err.style.display = "block";
      });
  });
  const cancelBtn = aEl("button", "btn btn-ghost", "取消");
  cancelBtn.addEventListener("click", () => (modalRoot.innerHTML = ""));
  foot.appendChild(saveBtn);
  foot.appendChild(cancelBtn);
  body.appendChild(foot);

  modal.appendChild(body);
  mask.appendChild(modal);
  closeBtn.addEventListener("click", () => (modalRoot.innerHTML = ""));
  mask.addEventListener("click", (e) => e.target === mask && (modalRoot.innerHTML = ""));
  modalRoot.appendChild(mask);
}

let reloadTimer = null;
function load() {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    BM.apiGet("/api/users")
      .then((list) => {
        userList = Array.isArray(list) ? list : [];
        const panel = document.getElementById("viewPanel");
        if (panel && (panel.querySelector(".acc-table") || panel.querySelector(".acc-new-btn"))) renderAccounts(panel);
      })
      .catch(() => {});
  }, 50);
}

BM.renderAccounts = function (container) {
  container.innerHTML = "";
  const page = aEl("div", "page");
  const head = aEl("div", "page-head");
  head.appendChild(aEl("div", "", `<div class="page-title">预算工作人员</div>
    <div class="page-desc">预算工作人员（用户）管理 · 用户与部门归属 · 角色分配 · 启停用 · 密码重置（系统管理员）</div>`));
  page.appendChild(head);

  const canEdit = !!(BM.canEditAccounts && BM.canEditAccounts());
  const toolBar = aEl("div", "filter-bar");
  toolBar.style.justifyContent = "space-between";
  const hint = aEl("span", "hint-text", "共 " + userList.length + " 个账户" + (canEdit ? "" : "（只读）"));
  const newBtn = aEl("button", "btn btn-primary btn-sm acc-new-btn", "＋ 新建账户");
  newBtn.addEventListener("click", () => openEditor(null));
  toolBar.appendChild(hint);
  if (canEdit) toolBar.appendChild(newBtn);
  page.appendChild(toolBar);

  const body = aEl("div");
  body.id = "accBody";
  page.appendChild(body);
  container.appendChild(page);

  loadOptions().then(() => {
    if (!userList.length) {
      return BM.apiGet("/api/users")
        .then((list) => {
          userList = Array.isArray(list) ? list : [];
          refreshTable(body);
        })
        .catch(() => (body.innerHTML = '<div class="hint-text">账户数据加载失败（后端未启动或无权限）</div>'));
    }
    refreshTable(body);
  });
};

window.BM = BM;
