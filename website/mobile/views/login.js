/* ================================================================
 * login.js — 手机版登录页（4 角色卡 + 部门选择）
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

const ROLE_ICONS = { boss: "👔", finance: "🧾", manager: "🗂", staff: "🧑‍💻" };

BM.renderLogin = function () {
  const root = document.getElementById("loginRoot");
  root.innerHTML = "";
  root.style.display = "flex";

  const hero = el("div", "login-hero");
  hero.appendChild(el("div", "login-logo", '<svg viewBox="0 0 40 40" width="100%" height="100%"><rect x="5" y="22" width="6" height="14" rx="2" fill="currentColor" opacity="0.55"/><rect x="14" y="14" width="6" height="22" rx="2" fill="currentColor" opacity="0.7"/><rect x="23" y="8" width="6" height="28" rx="2" fill="currentColor"/><polyline points="8,18 17,10 26,4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/></svg>'));
  hero.appendChild(el("div", "login-title", "三安光电 AI 费用预决算管理系统"));
  hero.appendChild(el("div", "login-sub", "手机版 · 四角色演示"));
  root.appendChild(hero);

  let selected = "boss";
  const cards = {};
  Object.keys(BM.ROLES).forEach((rid) => {
    const r = BM.ROLES[rid];
    const card = el("button", "role-card" + (rid === selected ? " selected" : ""));
    card.innerHTML = `<div class="role-ico">${ROLE_ICONS[rid]}</div>
      <div><div class="role-name">${esc(r.name)}</div>
      <div class="role-desc">${esc(r.desc)}</div></div>`;
    card.addEventListener("click", () => {
      selected = rid;
      Object.keys(cards).forEach((k) => cards[k].classList.toggle("selected", k === selected));
      const extra = document.getElementById("loginDeptWrap");
      extra.classList.toggle("show", rid === "manager");
      const btn = document.getElementById("loginEnterBtn");
      btn.textContent = `以「${BM.ROLES[rid].name}」进入 →`;
    });
    cards[rid] = card;
    root.appendChild(card);
  });

  /* 部门选择（经理） */
  const deptWrap = el("div", "login-extra", "");
  deptWrap.id = "loginDeptWrap";
  const sel = el("select");
  sel.id = "loginDept";
  sel.innerHTML = BM.DEPTS.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join("");
  deptWrap.appendChild(el("div", "sheet-label", "所属部门"));
  deptWrap.appendChild(sel);
  root.appendChild(deptWrap);

  /* 进入按钮 */
  const btn = el("button", "login-btn", "以「总经理」进入 →");
  btn.id = "loginEnterBtn";
  btn.addEventListener("click", () => {
    const dept = document.getElementById("loginDept").value;
    BM.login(selected, dept);
    BM.enterApp();
  });
  root.appendChild(btn);
  root.appendChild(el("div", "login-hint", "Demo · 右上角可随时切换角色 / 重置"));
};

window.BM = BM;
