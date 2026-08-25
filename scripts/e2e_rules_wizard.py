#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""T6 规则版本向导 E2E：克隆草稿 → 改 down5 因子 → 发布 → 验证新生效版本。"""
import requests, json, re
BASE = "http://localhost:8300"

from playwright.sync_api import sync_playwright

def login(page, user):
    page.goto(BASE + "/")
    page.wait_for_selector("input[autocomplete='username']", timeout=8000)
    page.fill("input[autocomplete='username']", user)
    page.fill("input[autocomplete='current-password']", "Admin@2026")
    page.click(".login-submit")
    page.wait_for_selector("div.workbench", timeout=8000)

def api(token, method, url, body=None):
    h = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}
    r = requests.request(method, BASE + url, headers=h, data=json.dumps(body) if body is not None else None)
    try: return r.status_code, r.json()
    except: return r.status_code, r.text

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context()
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    login(page, "admin")
    tok = page.evaluate("BM.state.token")
    page.evaluate("BM.openView('rules')")
    page.wait_for_selector(".page-title", timeout=8000)
    page.wait_for_timeout(600)

    page.click("text=基于当前版本生成新版本")
    page.wait_for_selector(".draft-factors input", timeout=8000)
    print("草稿向导已打开; 基线输入数=", len(page.query_selector_all(".draft-factors .factor-row")))

    rows = page.query_selector_all(".draft-factors .factor-row")
    for row in rows:
        if row.query_selector(".fr-k").inner_text().strip() == "down5":
            row.query_selector("input").fill("93")
            print("down5 输入值(发布前)=", row.query_selector("input").input_value())
            break

    page.fill("#srcNote", "E2E 测试")
    page.click("text=发布为新版本")
    page.wait_for_timeout(1500)

    # 用 API 验证 active down5
    st, data = api(tok, "GET", "/api/rule-versions")
    active = [v for v in data if v["status"] == "active"][0]
    down5 = [i["factor"] for i in active["items"] if i["scopeKey"] == "down5"][0]
    print("发布后 active 版本=", active["version"], "down5=", down5)

    # 还原：把 v2026.0 重新发布为 active
    v0 = [v for v in data if v["version"] == "v2026.0"][0]
    st, r = api(tok, "POST", f"/api/rule-versions/{v0['id']}/publish", {"sourceType": "rollback", "note": "E2E 还原"})
    print("还原 v2026.0:", st, r.get("status") if isinstance(r, dict) else r)

    page.screenshot(path="/Users/yangjackson/AIProjects/BadgetManager/scripts/e2e_rules_wizard.png")
    print("pageerror:", errs)
    ok = (abs(down5 - 0.93) < 1e-9) and not errs
    print("OVERALL:", "PASS" if ok else "FAIL")
    ctx.close(); b.close()
