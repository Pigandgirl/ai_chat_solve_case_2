#!/usr/bin/env python3
"""
系统自检测程序 (System Smoke Test)
自动检测登录、注册等核心功能是否正常运行
"""

import sys
import time
import uuid
import os
import httpx

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
BOLD = "\033[1m"
RESET = "\033[0m"

API_HOST = os.getenv("SMOKE_API_HOST", "fastapi")
API_PORT = os.getenv("SMOKE_API_PORT", "8000")
API_BASE = f"http://{API_HOST}:{API_PORT}/api"

FRONTEND_HOST = os.getenv("SMOKE_FRONTEND_HOST", "host.docker.internal")
FRONTEND_PORT = os.getenv("SMOKE_FRONTEND_PORT", "3000")
FRONTEND_URL = f"http://{FRONTEND_HOST}:{FRONTEND_PORT}"

passed = 0
failed = 0
test_user = f"smoketest_{uuid.uuid4().hex[:8]}"
test_password = "SmokeTest@123"

def ok(msg):
    global passed
    passed += 1
    print(f"  {GREEN}\u2713 PASS{RESET} {msg}")

def fail_msg(msg):
    global failed
    failed += 1
    print(f"  {RED}\u2717 FAIL{RESET} {msg}")

def section(title):
    print(f"\n{BOLD}{BLUE}\u2501\u2501\u2501 {title} \u2501\u2501\u2501{RESET}")

def print_summary():
    total = passed + failed
    print(f"\n{BOLD}{'='*60}{RESET}")
    if failed > 0:
        print(f"{RED}{BOLD}  \u26a0 \u68c0\u6d4b\u7ed3\u679c: {passed}/{total} \u901a\u8fc7\uff0c{failed} \u9879\u5931\u8d25{RESET}")
        print(f"{RED}  \u7cfb\u7edf\u53ef\u80fd\u5b58\u5728\u95ee\u9898\uff0c\u8bf7\u68c0\u67e5\u4e0a\u8ff0\u5931\u8d25\u9879\uff01{RESET}")
    else:
        print(f"{GREEN}{BOLD}  \u2713 \u68c0\u6d4b\u7ed3\u679c: {passed}/{total} \u5168\u90e8\u901a\u8fc7{RESET}")
        print(f"{GREEN}  \u7cfb\u7edf\u8fd0\u884c\u6b63\u5e38\uff0c\u767b\u5f55\u6ce8\u518c\u529f\u80fd\u5747\u53ef\u7528\uff01{RESET}")
    print(f"{BOLD}{'='*60}{RESET}\n")

def main():
    global passed, failed

    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}  \u6cd5\u5f8b\u667a\u80fd\u8f85\u52a9\u529e\u6848\u7cfb\u7edf - \u81ea\u68c0\u6d4b\u7a0b\u5e8f{RESET}")
    print(f"{BOLD}{'='*60}{RESET}")

    client = httpx.Client(timeout=10.0)

    section("0. \u7b49\u5f85 API \u670d\u52a1\u5c31\u7eea")
    max_retries = 30
    for i in range(max_retries):
        try:
            resp = client.get(f"{API_BASE}/health")
            if resp.status_code == 200:
                data = resp.json()
                ok(f"API \u5065\u5eb7\u68c0\u67e5\u901a\u8fc7 (v{data.get('version', '?')}, \u5c1d\u8bd5 {i+1}/{max_retries})")
                break
        except Exception:
            if i < max_retries - 1:
                time.sleep(2)
            else:
                fail_msg(f"API \u5065\u5eb7\u68c0\u67e5\u5931\u8d25\uff0c{max_retries}\u6b21\u5c1d\u8bd5\u540e\u4ecd\u672a\u5c31\u7eea")
                print_summary()
                return 1
    else:
        fail_msg("API \u5065\u5eb7\u68c0\u67e5\u8d85\u65f6")
        print_summary()
        return 1

    section("1. \u6ce8\u518c\u529f\u80fd\u68c0\u6d4b")

    try:
        resp = client.post(f"{API_BASE}/auth/register", json={
            "username": test_user,
            "password": test_password,
            "confirmPassword": test_password,
            "phone": "13800138000",
            "captcha": "000000"
        })
        if resp.status_code == 200:
            data = resp.json()
            if "token" in data and "user" in data:
                ok(f"\u6b63\u5e38\u6ce8\u518c\u6210\u529f \u2192 user={test_user}")
                token = data["token"]
            else:
                fail_msg(f"\u6ce8\u518c\u6210\u529f\u4f46\u54cd\u5e94\u683c\u5f0f\u4e0d\u6b63\u786e: {str(data)[:200]}")
        else:
            fail_msg(f"\u6ce8\u518c\u5931\u8d25 HTTP {resp.status_code}: {resp.text[:150]}")
    except Exception as e:
        fail_msg(f"\u6ce8\u518c\u8bf7\u6c42\u5f02\u5e38: {e}")

    try:
        resp = client.post(f"{API_BASE}/auth/register", json={
            "username": test_user,
            "password": test_password,
            "confirmPassword": test_password,
            "phone": "13800138000",
            "captcha": "000000"
        })
        if resp.status_code == 400:
            ok("\u91cd\u590d\u6ce8\u518c\u6b63\u786e\u62d2\u7edd (HTTP 400)")
        else:
            fail_msg(f"\u91cd\u590d\u6ce8\u518c\u5e94\u8fd4\u56de 400\uff0c\u5b9e\u9645 HTTP {resp.status_code}")
    except Exception as e:
        fail_msg(f"\u91cd\u590d\u6ce8\u518c\u6d4b\u8bd5\u5f02\u5e38: {e}")

    try:
        resp = client.post(f"{API_BASE}/auth/register", json={
            "username": "pw_mismatch_user",
            "password": test_password,
            "confirmPassword": "DifferentPass456",
            "phone": "13800138001",
            "captcha": "000000"
        })
        if resp.status_code == 400:
            ok("\u5bc6\u7801\u4e0d\u4e00\u81f4\u6b63\u786e\u62d2\u7edd (HTTP 400)")
        else:
            fail_msg(f"\u5bc6\u7801\u4e0d\u4e00\u81f4\u5e94\u8fd4\u56de 400\uff0c\u5b9e\u9645 HTTP {resp.status_code}")
    except Exception as e:
        fail_msg(f"\u5bc6\u7801\u4e0d\u4e00\u81f4\u6d4b\u8bd5\u5f02\u5e38: {e}")

    section("2. \u767b\u5f55\u529f\u80fd\u68c0\u6d4b")

    try:
        resp = client.post(f"{API_BASE}/auth/login", json={
            "username": test_user,
            "password": test_password
        })
        if resp.status_code == 200:
            data = resp.json()
            if "token" in data and "user" in data:
                ok(f"\u6b63\u5e38\u767b\u5f55\u6210\u529f \u2192 user={data['user']['username']}")
                token = data["token"]
            else:
                fail_msg(f"\u767b\u5f55\u6210\u529f\u4f46\u54cd\u5e94\u683c\u5f0f\u4e0d\u6b63\u786e: {str(data)[:200]}")
        else:
            fail_msg(f"\u767b\u5f55\u5931\u8d25 HTTP {resp.status_code}: {resp.text[:150]}")
    except Exception as e:
        fail_msg(f"\u767b\u5f55\u8bf7\u6c42\u5f02\u5e38: {e}")

    try:
        resp = client.post(f"{API_BASE}/auth/login", json={
            "username": test_user,
            "password": "WrongPassword999"
        })
        if resp.status_code == 401:
            ok("\u9519\u8bef\u5bc6\u7801\u6b63\u786e\u62d2\u7edd (HTTP 401)")
        else:
            fail_msg(f"\u9519\u8bef\u5bc6\u7801\u5e94\u8fd4\u56de 401\uff0c\u5b9e\u9645 HTTP {resp.status_code}")
    except Exception as e:
        fail_msg(f"\u9519\u8bef\u5bc6\u7801\u6d4b\u8bd5\u5f02\u5e38: {e}")

    try:
        resp = client.post(f"{API_BASE}/auth/login", json={
            "username": "ghost_user_nonexist_999",
            "password": test_password
        })
        if resp.status_code == 401:
            ok("\u4e0d\u5b58\u5728\u7528\u6237\u6b63\u786e\u62d2\u7edd (HTTP 401)")
        else:
            fail_msg(f"\u4e0d\u5b58\u5728\u7528\u6237\u5e94\u8fd4\u56de 401\uff0c\u5b9e\u9645 HTTP {resp.status_code}")
    except Exception as e:
        fail_msg(f"\u4e0d\u5b58\u5728\u7528\u6237\u6d4b\u8bd5\u5f02\u5e38: {e}")

    section("3. Token \u9a8c\u8bc1\u529f\u80fd\u68c0\u6d4b")

    try:
        resp = client.get(f"{API_BASE}/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        if resp.status_code == 200:
            data = resp.json()
            if "user" in data and data["user"]["username"] == test_user:
                ok("Token \u9a8c\u8bc1\u901a\u8fc7 \u2192 /me \u8fd4\u56de\u6b63\u786e\u7528\u6237")
            else:
                fail_msg(f"/me \u54cd\u5e94\u683c\u5f0f\u4e0d\u6b63\u786e: {str(data)[:200]}")
        else:
            fail_msg(f"/me \u8bf7\u6c42\u5931\u8d25 HTTP {resp.status_code}: {resp.text[:150]}")
    except Exception as e:
        fail_msg(f"/me \u8bf7\u6c42\u5f02\u5e38: {e}")

    try:
        resp = client.get(f"{API_BASE}/auth/me", headers={
            "Authorization": "Bearer fake_token_deadbeef"
        })
        if resp.status_code == 401:
            ok("\u65e0\u6548 Token \u6b63\u786e\u62d2\u7edd (HTTP 401)")
        else:
            fail_msg(f"\u65e0\u6548 Token \u5e94\u8fd4\u56de 401\uff0c\u5b9e\u9645 HTTP {resp.status_code}")
    except Exception as e:
        fail_msg(f"\u65e0\u6548 Token \u6d4b\u8bd5\u5f02\u5e38: {e}")

    section("4. \u524d\u7aef\u9875\u9762\u53ef\u8bbf\u95ee\u6027\u68c0\u6d4b")
    try:
        resp = client.get(FRONTEND_URL, follow_redirects=True)
        if resp.status_code == 200:
            ok(f"\u524d\u7aef\u9875\u9762\u53ef\u8bbf\u95ee (HTTP 200)")
        else:
            fail_msg(f"\u524d\u7aef\u9875\u9762\u8fd4\u56de HTTP {resp.status_code}")
    except httpx.ConnectError:
        fail_msg(f"\u524d\u7aef\u9875\u9762\u65e0\u6cd5\u8fde\u63a5 ({FRONTEND_URL})\uff0c\u8bf7\u786e\u4fdd npm start \u5df2\u8fd0\u884c")
    except Exception as e:
        fail_msg(f"\u524d\u7aef\u68c0\u6d4b\u5f02\u5e38: {e}")

    print_summary()
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
