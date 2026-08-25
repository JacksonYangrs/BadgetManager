/* ================================================================
 * engine.js — Copilot 对话引擎（确定性规则，演示稳定）
 * 意图：预测 / 分析 / 建议 / 执行 / 自由问答
 * ================================================================ */

var BM = window.BM || {};

/* 判断字符串包含任一关键词 */
function hasKw(text, kws) {
  return kws.some((k) => text.indexOf(k) >= 0);
}

function getCat(name) {
  return BM.CATEGORIES.find((c) => c.name.indexOf(name) >= 0 || name.indexOf(c.name) >= 0);
}

function getDept(name) {
  return BM.DEPTS.find((d) => d.name.indexOf(name) >= 0 || name.indexOf(d.name) >= 0);
}

/* ---------- 意图解析主入口 ---------- */
function reply(text) {
  const t = (text || "").trim();

  /* 0. 项目查询（v0.3："我负责的项目还剩多少预算？"） */
  if (hasKw(t, ["项目", "负责的", "我的项目"])) {
    return replyProjects(t);
  }

  /* 1. 采购执行（主线 B） */
  if (hasKw(t, ["采购", "购买", "买", "显示器", "电脑", "服务器", "需要"])) {
    return replyPurchase(t);
  }

  /* 2. 为什么 / 原因分析（主线 C，需先于泛化的"超预算"命中） */
  if (hasKw(t, ["为什么", "原因", "怎么超的", "为何", "解释一下", "解释"])) {
    return replyAnalyze(t);
  }

  /* 3. 怎么办 / 建议（需先于"超预算"命中） */
  if (hasKw(t, ["怎么办", "怎么解决", "怎么处理", "解决", "建议", "方案", "如何优化", "怎么优化"])) {
    return replyRecommend(t);
  }

  /* 4. 哪个部门/科目会超预算（主线 A 预测） */
  if (
    hasKw(t, ["超预算", "超支", "风险", "危险", "哪些会超", "哪个部门", "会不会超", "预警", "预测", "预计超"])
  ) {
    return replyForecast();
  }

  /* 5. 预算还剩多少 / 执行率 / 某个科目/部门查询 */
  if (hasKw(t, ["还剩", "剩余", "执行率", "用了多少", "花了多少", "结余", "查询", "多少"])) {
    return replyQuery(t);
  }

  /* 6. 问候 */
  if (hasKw(t, ["你好", "您好", "hi", "hello", "在吗"])) {
    return {
      type: "text",
      text: "您好，我是 AI Budget Copilot。您可以问我：哪个部门会超预算？为什么超？怎么解决？或者直接说采购需求。",
    };
  }

  /* 兜底 */
  return {
    type: "text",
    text: "我可以帮您做预算预测、原因分析、优化建议和自动执行。试试问：\n• 哪个部门今年最容易超预算？\n• 为什么办公用品超预算？\n• 我要采购 10 台显示器",
  };
}

/* ---------- 0. 项目查询（v0.3） ---------- */
function replyProjects(t) {
  const projects = BM.scopedProjects();
  if (!projects.length) {
    return { type: "text", text: "当前角色范围内暂无采购项目。" };
  }
  const lines = projects.map((p) => {
    const info = BM.projectInfo(p);
    const remainTxt = p.remain < 0 ? `超约束 ${BM.money(Math.abs(p.remain))}` : `剩余 ${BM.money(p.remain)}`;
    return `• ${p.name}（${info.deptName} · ${info.catName}）：额度 ${BM.money(p.budget)} · 已用 ${BM.money(p.used)} · ${remainTxt} · 执行率 ${p.execRate}%`;
  });
  const role = BM.state.role;
  const head = role === "staff" ? "您负责的项目预算情况：" : role === "manager" ? "本部门项目预算情况：" : "全局项目预算情况：";
  return { type: "text", text: head + "\n" + lines.join("\n") };
}

/* ---------- 1. 采购执行 ---------- */
function replyPurchase(t) {
  let title = "显示器批量采购（10 台）";
  let amount = 78000;
  if (hasKw(t, ["电脑", "笔记本"])) {
    title = "笔记本电脑采购（5 台）";
    amount = 55000;
  } else if (hasKw(t, ["服务器"])) {
    title = "服务器采购";
    amount = 200000;
  } else if (hasKw(t, ["打印纸", "纸"])) {
    title = "打印纸月度采购";
    amount = 3200;
  }

  const remain = BM.getCatRemain("it");
  const chain = BM.getApprovalChain(amount);

  if (amount <= 5000 || remain >= amount) {
    return {
      type: "execute",
      title: "已自动生成采购申请",
      subtitle: "AI 已完成预算、审批人、供应商判断",
      title2: title,
      amount,
      catName: "IT 设备",
      supplier: "未来数码",
      chain,
      items: [
        { label: "预算检查", value: remain >= amount ? `充足，剩余 ${BM.money(remain)}` : "小额采购，走快速通道", pass: true },
        { label: "审批路由", value: chain.join(" → "), pass: true },
        { label: "供应商", value: "未来数码（历史供应商，价格低于均价 4%）", pass: true },
      ],
      ok: true,
      docId: (function () {
        const r = BM.requestPurchase({ title, amount });
        return r.ok ? r.doc.id : null;
      })(),
    };
  }

  /* 预算不足 → 建议调剂 */
  const transfer = BM.SUGGESTIONS.find((s) => s.id === "SUG001");
  return {
    type: "execute",
    title: "预算不足，AI 建议先执行预算调剂",
    subtitle: "发现问题 → 给出方案，而不是直接拒绝",
    title2: title,
    amount,
    catName: "IT 设备",
    supplier: "未来数码",
    chain,
    items: [
      { label: "预算检查", value: `IT 设备可用预算不足（缺口 ${BM.money(amount - remain)}）`, pass: false },
      { label: "AI 建议", value: "培训费预计节余 30 万 → 调剂 30 万至 IT 设备", pass: true },
      { label: "审批路由", value: chain.join(" → "), pass: true },
    ],
    transferAvailable: transfer && transfer.status === "pending",
    transferId: "SUG001",
    docId: null,
  };
}

/* ---------- 2. 预测 ---------- */
function replyForecast() {
  const danger = BM.CATEGORIES.filter((c) => c.forecast.status === "danger");
  const warn = BM.CATEGORIES.filter((c) => c.forecast.status === "warn");
  const ok = BM.CATEGORIES.filter((c) => c.forecast.status === "ok");

  return {
    type: "predict",
    title: "超预算风险预测",
    subtitle: "基于 1-9 月执行趋势外推 · 演示时点 9 月 15 日",
    items: [
      { cat: "IT 设备", verdict: "超支 35%", status: "danger", detail: "已用 + 冻结 101.8 万 > 预算 80 万；8 月集中采购服务器 + 网络设备升级（含在途 38 万）。" },
      { cat: "车辆维修", verdict: "超支 18%", status: "danger", detail: "近 3 月出现 2 笔大额维修单，维修单价环比 +9%，预计 11 月执行率破 100%。" },
      { cat: "培训费", verdict: "节余 30%", status: "warn", detail: "下半年计划放缓，预计全年执行率 70%，约 30 万可调剂。" },
      { cat: "办公用品", verdict: "贴近预算", status: "ok", detail: "同比 +22% 但属合理增长（员工 +28% / 打印 +41% / 会议 +35%）。" },
      { cat: "物业费", verdict: "节余 12%", status: "ok", detail: "执行平稳，预计年底节余约 24 万。" },
    ],
    conclusion: "风险最高的是 IT 设备（超 35%）与车辆维修（超 18%）；培训费与物业费有约 54 万调剂空间，可对冲风险。",
  };
}

/* ---------- 3. 分析 ---------- */
function replyAnalyze(t) {
  if (hasKw(t, ["办公用品", "打印", "文具"])) {
    return {
      type: "analyze",
      title: "办公用品超预算原因分析",
      subtitle: "AI 归因分析 · 数据可追溯",
      factors: [
        { name: "员工人数", val: "+28%", delta: "今年扩招 84 人", cls: "danger" },
        { name: "打印量", val: "+41%", delta: "与人数、会议材料正相关", cls: "danger" },
        { name: "会议次数", val: "+35%", delta: "跨部门协作增加", cls: "warn" },
        { name: "办公用品费用", val: "+22%", delta: "增速低于员工增长", cls: "ok" },
      ],
      conclusion: "办公用品 +22% 由员工 +28% / 打印 +41% / 会议 +35% 驱动，增速低于人数增速，属合理增长，不建议削减；但可优化采购成本。",
      cls: "ok",
    };
  }

  if (hasKw(t, ["车辆", "维修"])) {
    return {
      type: "analyze",
      title: "车辆维修上涨原因分析",
      subtitle: "AI 归因分析 · 数据可追溯",
      factors: [
        { name: "维修单价", val: "+9%", delta: "供应商 8 月调价", cls: "danger" },
        { name: "大额维修单", val: "2 笔", delta: "制动系统 / 变速箱", cls: "warn" },
        { name: "车辆数", val: "+6%", delta: "新增 2 辆商务车", cls: "warn" },
        { name: "保养频次", val: "持平", delta: "无异常", cls: "ok" },
      ],
      conclusion: "主因是供应商调价 + 大额维修单，属于部分可控成本。AI 建议引入第三家供应商比价，预计单价回落 6-9%。",
      cls: "warn",
    };
  }

  return {
    type: "analyze",
    title: "整体费用结构分析",
    subtitle: "1-9 月执行情况",
    factors: [
      { name: "整体执行率", val: "≈73%", delta: "9 月时点，节奏正常", cls: "ok" },
      { name: "高风险科目", val: "IT / 车辆", delta: "合计超支风险约 53 万", cls: "danger" },
      { name: "可调剂空间", val: "≈54 万", delta: "培训 + 物业节余", cls: "ok" },
    ],
    conclusion: "整体可控，但 IT 设备与车辆维修需要 9 月内决策（调剂 / 比价），否则年底将超预算。",
    cls: "warn",
  };
}

/* ---------- 4. 建议 ---------- */
function replyRecommend(t) {
  return {
    type: "recommend",
    title: "AI 优化建议",
    subtitle: "点击采纳即自动生成单据进入审批",
    items: [
      {
        title: "培训费调剂 30 万元至 IT 设备预算",
        desc: "培训费节余 30%，IT 设备超支 35%。调剂后 IT 超支降至 4%，不影响培训核心课程。",
        impact: [{ text: "IT 超支 35% → 4%", cls: "ok" }, { text: "需财务审批", cls: "warn" }],
        sugId: "SUG001",
      },
      {
        title: "办公用品统一为晨光框架供应商",
        desc: "2 家供应商合并为 1 家，年度用量换阶梯折扣，预计降本 8%。",
        impact: [{ text: "预计年降本 4.8 万", cls: "ok" }],
        sugId: "SUG002",
      },
      {
        title: "打印纸采购周期由周改为月",
        desc: "用量稳定，周采购导致配送与管理成本浪费。",
        impact: [{ text: "采购管理成本 -15%", cls: "ok" }],
        sugId: "SUG003",
      },
    ],
    hint: "建议按风险优先级执行：先调剂，再集采，最后优化采购周期。",
  };
}

/* ---------- 5. 自由查询 ---------- */
function replyQuery(t) {
  const cat = getCat(t);
  const dept = getDept(t);

  if (cat) {
    const remain = BM.getCatRemain(cat.id);
    const rate = BM.getCatExecRate(cat.id);
    const f = cat.forecast;
    return {
      type: "text",
      text: `${cat.name}（9 月时点）：
• 年度预算：${BM.money(BM.getCatBudget(cat.id))}
• 已执行：${BM.money(cat.used)}（${BM.pct(rate)}）
• 冻结：${BM.money(cat.frozen)}
• 可用：${BM.money(remain)}
• AI 预测：${f.label}`,
    };
  }

  if (dept) {
    const docs = BM.DOCS.filter((d) => d.deptId === dept.id);
    const total = docs.reduce((a, d) => a + d.amount, 0);
    const top = {};
    docs.forEach((d) => (top[d.catName] = (top[d.catName] || 0) + d.amount));
    const topCat = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const lines = topCat.map(([k, v]) => `• ${k}：${BM.money(v)}`);
    return {
      type: "text",
      text: `${dept.name}（1-9 月）：
• 部门费用合计：${BM.money(total)}（${docs.length} 笔）
${lines.join("\n")}
如需更细，可在「部门 · 科目明细」中按部门筛选。`,
    };
  }

  return reply(text);
}

window.BM.engineReply = reply;
window.BM = BM;
