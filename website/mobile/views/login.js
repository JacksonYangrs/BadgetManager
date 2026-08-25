/* ================================================================
 * login.js — 手机版登录页（普通登录：用户名 + 密码，后端认证）
 *  - 不再提供角色演示卡 / 部门选择（测试入口已隐藏）
 *  - 登录后按账户角色进入对应工作台
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

BM.renderLogin = function () {
  const root = document.getElementById("loginRoot");
  root.innerHTML = "";
  root.style.display = "flex";

  const hero = el("div", "login-hero");
  hero.appendChild(el("div", "login-logo", '<svg viewBox="0 0 40 40" width="100%" height="100%"><rect x="5" y="22" width="6" height="14" rx="2" fill="currentColor" opacity="0.55"/><rect x="14" y="14" width="6" height="22" rx="2" fill="currentColor" opacity="0.7"/><rect x="23" y="8" width="6" height="28" rx="2" fill="currentColor"/><polyline points="8,18 17,10 26,4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/></svg>'));
  hero.appendChild(el("div", "login-title", "三安光电 AI 费用预决算管理系统"));
  hero.appendChild(el("div", "login-sub", "手机版 · 统一账户登录"));
  root.appendChild(hero);

  const form = el("div");
  form.style.cssText = "width:100%;max-width:420px;padding:0 22px;box-sizing:border-box;";

  const uField = el("div");
  uField.style.cssText = "margin:18px 0 0;";
  const uLabel = el("label");
  uLabel.textContent = "账号";
  uLabel.style.cssText = "display:block;font-size:14px;color:#cdd6f4;margin-bottom:7px;";
  const uInput = el("input");
  uInput.type = "text";
  uInput.placeholder = "用户名（如 admin）";
  uInput.autocomplete = "username";
  uInput.style.cssText = "width:100%;padding:13px 14px;font-size:16px;border-radius:10px;border:1px solid #2a3556;background:#0e1730;color:#e8edff;box-sizing:border-box;";
  uField.appendChild(uLabel);
  uField.appendChild(uInput);
  form.appendChild(uField);

  const pField = el("div");
  pField.style.cssText = "margin:16px 0 0;";
  const pLabel = el("label");
  pLabel.textContent = "密码";
  pLabel.style.cssText = "display:block;font-size:14px;color:#cdd6f4;margin-bottom:7px;";
  const pInput = el("input");
  pInput.type = "password";
  pInput.placeholder = "初始密码 Admin@2026";
  pInput.autocomplete = "current-password";
  pInput.style.cssText = "width:100%;padding:13px 14px;font-size:16px;border-radius:10px;border:1px solid #2a3556;background:#0e1730;color:#e8edff;box-sizing:border-box;";
  pField.appendChild(pLabel);
  pField.appendChild(pInput);
  form.appendChild(pField);

  const err = el("div");
  err.style.cssText = "color:#ff8a8a;font-size:13px;min-height:18px;margin:10px 0 0;";
  err.style.display = "none";
  form.appendChild(err);

  const btn = el("button", "login-btn", "登 录 →");
  btn.style.cssText = "width:100%;margin-top:18px;";
  btn.addEventListener("click", doLogin);
  form.appendChild(btn);

  const hint = el("div", "login-hint", "登录后按账户角色进入对应工作台；正式部署请及时修改初始密码。");
  hint.style.cssText = "margin-top:16px;text-align:center;";
  form.appendChild(hint);

  root.appendChild(form);

  function doLogin() {
    const u = uInput.value.trim();
    const p = pInput.value;
    if (!u || !p) {
      err.textContent = "请输入账号和密码";
      err.style.display = "block";
      return;
    }
    btn.disabled = true;
    btn.textContent = "登录中…";
    BM.apiLogin(u, p, (r) => {
      btn.disabled = false;
      btn.textContent = "登 录 →";
      if (r.error) {
        err.textContent = r.error;
        err.style.display = "block";
        return;
      }
      err.style.display = "none";
      BM.initCopilotMobile();
      BM.enterApp();
    });
  }
  uInput.addEventListener("keydown", (e) => e.key === "Enter" && doLogin());
  pInput.addEventListener("keydown", (e) => e.key === "Enter" && doLogin());
  uInput.focus();
};

window.BM = BM;
