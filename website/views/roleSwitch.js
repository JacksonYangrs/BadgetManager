/* ================================================================
 * roleSwitch.js — 顶部快速角色切换器（不退出、不整页 reload）
 * 列出 BM.ROLES 全部 12 个角色，按角色条件显示中心/费用类型/公司下拉，
 * 选中「切换」后由 app.js 的 BM.switchRole 完成轻量切换。
 * 复用登录页角色卡样式（.role-card / .login-roles）。
 * ================================================================ */

var BM = window.BM || {};

function rsEl(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function rsEsc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

BM.renderRoleSwitch = function () {
  /* 打开时刷新最新用户信息（角色变更实时生效，无需重新登录） */
  if (BM.state.token) {
    BM.apiGet("/api/auth/me")
      .then((me) => {
        if (me && me.username) {
          BM.state.user = me;
          BM.state.role = me.roles[0] ? me.roles[0].code : BM.state.role;
          BM.saveState();
          renderPanel();
        }
      })
      .catch(() => renderPanel());
    return;
  }
  renderPanel();
};

function renderPanel() {
  const modalRoot = document.getElementById("modalRoot");
  if (!modalRoot) return;

  /* 清空旧切换面板，避免叠加 */
  modalRoot.innerHTML = "";

  const mask = rsEl("div", "modal-mask");
  const modal = rsEl("div", "modal");

  /* 头部 */
  const head = rsEl("div", "modal-head");
  head.appendChild(rsEl("div", "modal-title", "切换角色"));
  const closeBtn = rsEl("button", "modal-close", "×");
  head.appendChild(closeBtn);
  modal.appendChild(head);

  /* 主体 */
  const body = rsEl("div", "modal-body");

  let selected = BM.state.role || "boss";

  /* 参数行（按角色显示） */
  function makeRow(label, opts, valueKey) {
    const row = rsEl("div", "login-dept");
    row.style.display = "none";
    row.innerHTML = `<span class="login-hint">${label}：</span>`;
    const s = rsEl("select");
    s.innerHTML = opts.map((o) => `<option value="${o.id}">${rsEsc(o.name)}</option>`).join("");
    if (BM.state[valueKey]) s.value = BM.state[valueKey];
    row.appendChild(s);
    body.appendChild(row);
    return s;
  }
  const deptSel = makeRow("选择所属部门", BM.DEPTS, "deptId");
  const centerSel = makeRow("选择职能中心", BM.FUNCTIONAL_CENTERS, "centerId"); // 11 个职能中心
  const expenseSel = makeRow("选择费用类型", BM.EXPENSE_TYPES, "expenseType"); // 7 类基层费用
  const companySel = makeRow("选择法人公司", BM.COMPANIES.map((c) => ({ id: c.code, name: c.name })), "scopeCompany");

  function showParamsFor(rid) {
    deptSel.parentNode.style.display = rid === "manager" ? "flex" : "none";
    centerSel.parentNode.style.display = rid === "centerOwner" ? "flex" : "none";
    expenseSel.parentNode.style.display = rid === "expense" ? "flex" : "none";
    companySel.parentNode.style.display =
      rid === "legalHead" || rid === "adminHead" || rid === "companyBudgeter" ? "flex" : "none";
  }

  /* 可用角色：真实登录用户 → 仅其已分配角色（多角色切换）；演示通道 → 全部角色 */
  const userRoles = BM.state.user && BM.state.user.roles && BM.state.user.roles.length ? BM.state.user.roles : null;
  const avail = userRoles
    ? userRoles.map((r) => {
        const def = BM.ROLES[r.code] || {};
        return { id: r.code, name: r.name || def.name, title: def.title || r.name, desc: r.desc || def.desc || "", ico: def.name ? (BM.LOGIN_ICONS[r.code] || "•") : "•" };
      })
    : Object.keys(BM.ROLES).map((rid) => ({ id: rid, name: BM.ROLES[rid].name, title: BM.ROLES[rid].title, desc: BM.ROLES[rid].desc, ico: BM.LOGIN_ICONS[rid] || "•" }));

  /* 角色卡列表 */
  const roles = rsEl("div", "login-roles");
  avail.forEach((a) => {
    const cardEl = rsEl("div", "role-card " + a.id + (a.id === selected ? " selected" : ""));
    cardEl.innerHTML = `<div class="rc-ico">${a.ico}</div>
      <div class="rc-name">${rsEsc(a.name)}</div>
      <div class="rc-title">${rsEsc(a.title)}</div>
      <div class="rc-desc">${rsEsc(a.desc)}</div>`;
    cardEl.addEventListener("click", () => {
      selected = a.id;
      roles.querySelectorAll(".role-card").forEach((c) => c.classList.remove("selected"));
      cardEl.classList.add("selected");
      showParamsFor(a.id);
    });
    roles.appendChild(cardEl);
  });
  body.appendChild(roles);
  showParamsFor(selected);

  function close() {
    modalRoot.innerHTML = "";
  }
  closeBtn.addEventListener("click", close);
  mask.addEventListener("click", (e) => {
    if (e.target === mask) close();
  });

  /* 底部按钮 */
  const foot = rsEl("div", "login-btn-row");
  foot.style.marginTop = "18px";
  const ok = rsEl("button", "btn btn-accent", "切换 →");
  ok.addEventListener("click", () => {
    const params = {
      centerId: centerSel.value,
      expenseType: expenseSel.value,
      scopeCompany: companySel.value,
      deptId: deptSel.value,
    };
    close();
    if (BM.switchRole) BM.switchRole(selected, params);
  });
  const cancel = rsEl("button", "btn btn-ghost", "取消");
  cancel.addEventListener("click", close);
  foot.appendChild(ok);
  foot.appendChild(cancel);
  body.appendChild(foot);

  modal.appendChild(body);
  mask.appendChild(modal);
  modalRoot.appendChild(mask);
};

window.BM = BM;
