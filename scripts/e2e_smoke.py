#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""BadgetManager E2E 冒烟测试（Playwright）：四大改动验收。
覆盖：Excel 主数据真实组织、消息模块按角色过滤、核心功能卡片删除、预算规则版本化。
"""
from playwright.sync_api import sync_playwright
import os

BASE = "http://localhost:8300"
PW = "/Users/yangjackson/AIProjects/BadgetManager/scripts"
os.makedirs(PW, exist_ok=True)

def login(page, user):
    page.goto(BASE + "/")
    page.wait_for_selector("input[autocomplete='username']", timeout=8000)
    page.fill("input[autocomplete='username']", user)
    page.fill("input[autocomplete='current-password']", "Admin@2026")
    page.click(".login-submit")
    page.wait_for_selector("div.workbench", timeout=8000)

def test_role(browser, user, expect_reminders_min, expect_titles_exclude, label):
    ctx = browser.new_context()
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    login(page, user)
    page.wait_for_timeout(1200)  # 等通知 API 渲染

    # 铃铛未读数
    badge = page.query_selector("#bellBadge")
    badge_text = badge.inner_text() if badge and not badge.is_hidden() else "0"
    # 工作台提醒项
    items = page.query_selector_all(".todo-list .todo-item")
    titles = [it.query_selector(".td-title").inner_text() for it in items]
    # 核心功能卡片应已删除
    core_card = page.query_selector(".wb-nav-grid")
    core_text = "核心功能" in (page.query_selector(".workbench").inner_text() or "")
    # 截图
    shot = os.path.join(PW, f"e2e_{label}.png")
    page.screenshot(path=shot)

    violated = [t for t in titles if any(ex in t for ex in expect_titles_exclude)]
    print(f"[{label}] user={user}")
    print(f"  铃铛未读={badge_text}  提醒项数={len(items)}  标题={titles}")
    print(f"  核心功能卡片存在={core_card is not None}  含'核心功能'文字={core_text}")
    print(f"  违禁标题(基层不应见org/account/summary)={violated}")
    print(f"  pageerror={errors}")
    ok = (len(items) >= expect_reminders_min and not violated
          and core_card is None and not core_text and not errors)
    print(f"  => {'PASS' if ok else 'FAIL'}\n")
    ctx.close()
    return ok, shot

def test_rules(browser):
    ctx = browser.new_context()
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    login(page, "admin")
    page.evaluate("BM.openView('rules')")
    page.wait_for_selector(".page-title", timeout=8000)
    page.wait_for_timeout(800)  # 等规则版本 API
    title = page.query_selector(".page-title").inner_text()
    rv = page.query_selector(".rv-title")
    rv_text = rv.inner_text() if rv else "(none)"
    shot = os.path.join(PW, "e2e_rules.png")
    page.screenshot(path=shot)
    print(f"[rules] admin")
    print(f"  页面标题={title}  生效版本={rv_text}")
    print(f"  pageerror={errors}")
    ok = ("预算规则管理" in title and "v2026.0" in rv_text and not errors)
    print(f"  => {'PASS' if ok else 'FAIL'}\n")
    ctx.close()
    return ok, shot

def test_org_tree(browser):
    """验证 Excel 真实组织已进入（公司数 > 30）。"""
    ctx = browser.new_context()
    page = ctx.new_page()
    login(page, "admin")
    js = """fetch('/api/orgs/tree').then(r=>r.json()).then(function walk(nodes){
      let co=0,bu=0,ce=0;
      (nodes||[]).forEach(function(n){
        if(n.level==='company')co++;
        if(n.level==='business')bu++;
        if(n.level==='center')ce++;
        if(n.children) {var s=walk(n.children); co+=s.co; bu+=s.bu; ce+=s.ce;}
      });
      return {co:co,bu:bu,ce:ce};
    })"""
    res = page.evaluate(js)
    cnt = res.get("co", 0)
    print(f"[org] 递归统计：公司={res.get('co')} 事业部={res.get('bu')} 职能中心={res.get('ce')} (Excel 真实 42 家)")
    ctx.close()
    return cnt and cnt >= 30

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    results = []
    # 基层 staff：只应见 2 条编制(all)，不得见 组织架构/账户与角色/部门汇总
    r1, s1 = test_role(b, "zhangwei", 2, ["组织架构", "账户与角色", "预算汇总"], "staff")
    # admin：可见 4 条（含 组织架构 / 账户与角色）
    r2, s2 = test_role(b, "admin", 4, [], "admin")
    r3, s3 = test_rules(b)
    r4 = test_org_tree(b)
    b.close()
    print("==== 汇总 ====")
    print(f"staff过滤={r1}  admin可见={r2}  规则页={r3}  组织真实={r4}")
    print(f"截图: {s1} {s2} {s3}")
    allok = r1 and r2 and r3 and r4
    print("OVERALL:", "PASS" if allok else "FAIL")
