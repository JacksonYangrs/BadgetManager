/* ================================================================
 * login.js — 登录页（正式：用户名 + 密码，后端认证）
 *  - 演示账号卡片：一键填入常用账户（开发/演示期便利）
 *  - 演示通道：下拉选择角色直接进入（?as= 等价，不经后端认证）
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

/* 演示账号（种子用户，密码统一 Admin@2026）· 按组织层级分组
 * 覆盖角色视角：集团管理层 / 事业部 / 职能中心 / 部门（含上下级部门对）/ 基层 */
const DEMO_GROUPS = [
  {
    title: "集团层",
    note: "含上下级部门示例：集团财务部（上级）→ 一公司财务部（下级）",
    accounts: [
      { u: "zhangmy", n: "张明远", d: "总经理（集团 CEO）", org: "集团总部" },
      { u: "xujing", n: "徐静", d: "总经办负责人", org: "总经办" },
      { u: "lijing", n: "李静", d: "集团财务部 · 财务经理（上级）", org: "集团财务部" },
      { u: "zhoufang", n: "周芳", d: "职能中心归口责任人", org: "行政服务中心" },
    ],
  },
  {
    title: "事业部层",
    accounts: [
      { u: "sunyue", n: "孙悦", d: "行政服务事业部负责人", org: "行政服务事业部" },
    ],
  },
  {
    title: "公司 / 部门层",
    accounts: [
      { u: "wangmin", n: "王敏", d: "一公司财务部 · 部门经理（下级）", org: "一公司 · 财务部" },
      { u: "chenkai", n: "陈凯", d: "行政归口负责人", org: "二公司" },
      { u: "liuyang", n: "刘洋", d: "公司预算员", org: "四公司" },
    ],
  },
  {
    title: "基层层",
    accounts: [
      { u: "zhaolei", n: "赵磊", d: "基层费用责任岗（后勤）", org: "一公司 · 后勤保障部" },
      { u: "duanwei", n: "段伟", d: "基层费用责任岗（后勤）", org: "二公司 · 后勤保障部" },
      { u: "zhangwei", n: "张伟", d: "员工", org: "一公司 · 综合办公室" },
    ],
  },
];

BM.renderLogin = function () {
  const root = document.getElementById("loginRoot");
  root.innerHTML = "";
  const card = el("div", "login-card");

  const head = el("div", "login-head");
  head.innerHTML = `<div class="login-logo"><svg viewBox="0 0 40 40" width="100%" height="100%"><rect x="5" y="22" width="6" height="14" rx="2" fill="currentColor" opacity="0.55"/><rect x="14" y="14" width="6" height="22" rx="2" fill="currentColor" opacity="0.7"/><rect x="23" y="8" width="6" height="28" rx="2" fill="currentColor"/><polyline points="8,18 17,10 26,4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/></svg></div>
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

  /* ---- 演示账号（按组织层级分组） ---- */
  const demoTitle = el("div", "login-demo-title", "演示账号 · 按组织层级（点击填入，密码 Admin@2026）");
  card.appendChild(demoTitle);
  const demos = el("div", "login-demos");
  DEMO_GROUPS.forEach((g) => {
    const group = el("div", "demo-group");
    const gHead = el("div", "demo-group-head", g.title);
    if (g.note) gHead.title = g.note;
    group.appendChild(gHead);
    const grid = el("div", "demo-group-grid");
    g.accounts.forEach((a) => {
      const c = el("button", "demo-acc");
      c.innerHTML = `<b>${esc(a.n)}</b><span>${esc(a.d)} · ${esc(a.u)}</span><i>${esc(a.org)}</i>`;
      c.addEventListener("click", () => {
        uInput.value = a.u;
        pInput.value = "Admin@2026";
        errLine.style.display = "none";
      });
      grid.appendChild(c);
    });
    group.appendChild(grid);
    demos.appendChild(group);
  });
  card.appendChild(demos);

  /* ---- 演示通道（开发期快捷） ---- */
  const demoRow = el("div", "login-demo-row");
  demoRow.innerHTML = `<span class="login-hint">开发期快捷通道：</span>`;
  const demoSel = el("select");
  demoSel.innerHTML = Object.keys(BM.ROLES).map((rid) => `<option value="${rid}">${esc(BM.ROLES[rid].name)}（${esc(BM.ROLES[rid].title)}）</option>`).join("");
  const demoGo = el("button", "btn btn-ghost", "以演示身份进入");
  demoGo.addEventListener("click", () => {
    const rid = demoSel.value;
    const dept = rid === "manager" ? "admin" : "admin";
    BM.login(rid, dept);
    BM.initCopilot();
    BM.enterApp();
  });
  demoRow.appendChild(demoSel);
  demoRow.appendChild(demoGo);
  card.appendChild(demoRow);

  root.appendChild(card);
  root.style.display = "flex";
  uInput.focus();
};

/* 供角色切换器（roleSwitch.js）复用图标映射 */
BM.LOGIN_ICONS = LOGIN_ICONS;

window.BM = BM;
