/* ================================================================
 * api.js — 前端统一请求层 + 认证（共享内核）
 * 职责：HTTP 请求统一封装 + 认证令牌管理 + 会话过期处理。
 * 复用方：桌面端（website/index.html）与移动端（website/mobile/index.html）。
 * 依赖入：BM.state（仅认证字段 token/user/role/loggedIn）+ BM.saveState（state.js 先加载）。
 * 晚绑定：BM.renderLogin / BM.toast（view 层，运行时取全局函数，避免 core 反向依赖 view）。
 * 规格：.workbuddy/module-specs/core-api.md
 * ================================================================ */

var BM = window.BM || {};

/* 真实登录：调用后端 POST /api/auth/login，成功后写回 user/token */
BM.apiLogin = function (username, password, cb) {
  fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
    .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
    .then(({ ok, d }) => {
      if (!ok) return cb({ error: d.error || "登录失败" });
      BM.state.user = d.user;
      BM.state.token = d.token;
      BM.state.role = d.user.roles[0] ? d.user.roles[0].code : BM.state.role; /* 主角色 */
      BM.state.loggedIn = true;
      BM.saveState();
      cb({ ok: true, user: d.user });
    })
    .catch(() => cb({ error: "无法连接认证服务" }));
};

/* 会话过期统一处理：登出并回登录页。renderLogin / toast 晚绑定（view 层），
 * 避免 core 层反向依赖；在单测沙箱等无 view 场景下安全跳过。 */
BM.handleSessionExpired = function () {
  BM.logout();
  if (BM.renderLogin) BM.renderLogin();
  if (BM.toast) BM.toast("会话已过期，请重新登录");
};

/* 统一 fetch：非 2xx 一律 reject（不进数据渲染分支）；401 额外触发会话过期处理。 */
BM.apiFetch = function (path, opts) {
  opts = opts || {};
  const headers = Object.assign({}, opts.headers || {});
  if (BM.state.token) headers["Authorization"] = "Bearer " + BM.state.token;
  return fetch(path, Object.assign({}, opts, { headers: headers })).then((res) => {
    if (res.ok) {
      /* 204 或空体：无内容返回 null（避免 res.json() 抛错） */
      return res.status === 204 ? null : res.json().catch(() => null);
    }
    if (res.status === 401) {
      BM.handleSessionExpired();
      return Promise.reject({ error: "会话已过期，请重新登录", status: 401 });
    }
    /* 错误体若可解析为 JSON 且含 error，则透传该对象供调用方 toast；否则构造兜底错误 */
    return res.json().catch(() => null).then((d) => {
      if (d && d.error) return Promise.reject(d);
      return Promise.reject({ error: "HTTP " + res.status, status: res.status });
    });
  });
};

/* 带认证的 API 请求封装（页面数据用） */
BM.apiGet = function (path) {
  return BM.apiFetch(path, {});
};

/* JSON 写请求封装：POST / PUT / DELETE（body 缺省时不携带请求体） */
BM.apiSend = function (path, method, body) {
  const opts = { method: method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return BM.apiFetch(path, opts);
};

/* 真实登出：清认证态 + 通知后端 */
BM.logout = function () {
  if (BM.state.token) {
    fetch("/api/auth/logout", { method: "POST", headers: { Authorization: "Bearer " + BM.state.token } }).catch(() => {});
  }
  BM.state.user = null;
  BM.state.token = null;
  BM.state.loggedIn = false;
  BM.saveState();
};

window.BM = BM;
