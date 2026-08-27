/* ================================================================
 * login.js — 登录页（正式：用户名 + 密码，后端认证）
 *  - 仅保留用户名 + 密码普通登录；演示账号卡 / 演示通道等测试入口已隐藏
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

const LOGIN_ICONS = {
  boss: "👔",
  manager: "🗂",
  staff: "🧑‍💻",
  finance: "🧾",
  ceo: "🏛",
  cooLead: "🤝",
  cooAnalyst: "📊",
  legalHead: "🏢",
  adminHead: "🧹",
  companyBudgeter: "🧮",
  centerOwner: "🎯",
  expense: "🧾",
  admin: "🛡",
  buHead: "🏭",
};

/* 演示账号（DEMO_GROUPS）：测试/演示用，客户登录界面已隐藏，定义移除避免死代码 */

BM.renderLogin = function () {
  const root = document.getElementById("loginRoot");
  root.innerHTML = "";
  const card = el("div", "login-card");

  const head = el("div", "login-head");
  head.innerHTML = `<div class="login-logo" role="img" aria-label="Sanan 三安制造"></div>
    <div class="login-title">三安光电 AI 费用预决算管理系统</div>
    <div class="login-sub">统一账户登录 · 组织架构 · 角色权限 · 预算全流程</div>`;
  card.appendChild(head);

  /* ---- 登录表单 ---- */
  const form = el("div", "login-form");
  const userRow = el("div", "login-field");
  userRow.innerHTML = `<label>账号</label>`;
  const uInput = el("input");
  uInput.type = "text";
  uInput.placeholder = "用户名（如 admin）";
  uInput.autocomplete = "username";
  userRow.appendChild(uInput);
  form.appendChild(userRow);

  const pwdRow = el("div", "login-field");
  pwdRow.innerHTML = `<label>密码</label>`;
  const pInput = el("input");
  pInput.type = "password";
  pInput.placeholder = "初始密码 Admin@2026";
  pInput.autocomplete = "current-password";
  pwdRow.appendChild(pInput);
  form.appendChild(pwdRow);

  const errLine = el("div", "login-err");
  errLine.style.display = "none";
  form.appendChild(errLine);

  const btn = el("button", "btn btn-accent login-submit", "登 录 →");
  btn.addEventListener("click", doLogin);
  form.appendChild(btn);

  const hint = el("div", "login-hint");
  hint.textContent = "登录后按账户角色进入对应工作台；正式部署请及时修改初始密码。";
  form.appendChild(hint);
  card.appendChild(form);

  function doLogin() {
    const u = uInput.value.trim();
    const p = pInput.value;
    if (!u || !p) {
      errLine.textContent = "请输入账号和密码";
      errLine.style.display = "block";
      return;
    }
    btn.disabled = true;
    btn.textContent = "登录中…";
    BM.apiLogin(u, p, (r) => {
      btn.disabled = false;
      btn.textContent = "登 录 →";
      if (r.error) {
        errLine.textContent = r.error;
        errLine.style.display = "block";
        return;
      }
      errLine.style.display = "none";
      BM.initCopilot();
      BM.enterApp();
    });
  }
  uInput.addEventListener("keydown", (e) => e.key === "Enter" && doLogin());
  pInput.addEventListener("keydown", (e) => e.key === "Enter" && doLogin());

  /* 演示账号卡片 / 演示通道：测试入口，客户登录界面已隐藏（仅保留用户名+密码普通登录） */

  root.appendChild(card);
  root.style.display = "flex";
  uInput.focus();
};

/* 供角色切换器（roleSwitch.js）复用图标映射 */
BM.LOGIN_ICONS = LOGIN_ICONS;

window.BM = BM;
