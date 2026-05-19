"""
法律智能辅助办案系统 - 健康监控服务
每 5 分钟检查一次所有服务，发现问题自动修复并报告
"""
import subprocess
import json
import time
import os
import sys
from datetime import datetime
from urllib.request import Request, urlopen
from urllib.error import URLError

CHECK_INTERVAL = 300
MAX_RESTART_ATTEMPTS = 3
RESTART_COOLDOWN = 120

LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, f'monitor_{datetime.now():%Y%m%d}.log')

restart_history = {}

COLORS = {
    'OK':    '\033[92m',
    'ERROR': '\033[91m',
    'WARN':  '\033[93m',
    'INFO':  '\033[97m',
    'CYAN':  '\033[96m',
    'RESET': '\033[0m',
}

def log(level, msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{ts}] [{level}] {msg}'
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(line + '\n')
    color = COLORS.get(level, COLORS['INFO'])
    print(f'{color}{line}{COLORS["RESET"]}')

def docker_inspect(name):
    try:
        r = subprocess.run(['docker', 'inspect', name],
                           capture_output=True, text=True, timeout=10)
        if r.returncode != 0:
            return None
        return json.loads(r.stdout)[0]
    except Exception:
        return None

def docker_restart(name):
    try:
        subprocess.run(['docker', 'restart', name], capture_output=True, timeout=30)
        return True
    except Exception:
        return False

def check_container(name, display):
    result = {'name': display, 'status': 'DOWN', 'detail': ''}
    info = docker_inspect(name)
    if info is None:
        result['detail'] = '容器不存在'
        return result

    state = info.get('State', {})
    if state.get('Status') != 'running':
        result['detail'] = f'容器状态: {state.get("Status")}'
        return result

    health = state.get('Health', {})
    if health:
        hstatus = health.get('Status', '')
        if hstatus == 'healthy':
            result['status'] = 'OK'
            result['detail'] = 'healthy (运行中)'
        elif hstatus == 'starting':
            result['status'] = 'OK'
            result['detail'] = 'starting (启动中)'
        else:
            result['detail'] = f'健康检查: {hstatus}'
    else:
        result['status'] = 'OK'
        result['detail'] = '运行中'
    return result

def check_http(url, timeout=5):
    try:
        req = Request(url, method='GET')
        resp = urlopen(req, timeout=timeout)
        return {'ok': 200 <= resp.status < 400, 'code': resp.status}
    except Exception as e:
        return {'ok': False, 'code': 0, 'error': str(e)}

def check_api_health():
    try:
        req = Request('http://localhost:8000/api/health')
        resp = urlopen(req, timeout=5)
        data = json.loads(resp.read().decode())
        return {'ok': data.get('status') == 'ok', 'version': data.get('version', '?')}
    except Exception as e:
        return {'ok': False, 'error': str(e)}

def check_login_api():
    try:
        body = json.dumps({'username': 'admin', 'password': 'admin123'}).encode()
        req = Request('http://localhost:8000/api/auth/login',
                      data=body,
                      headers={'Content-Type': 'application/json'},
                      method='POST')
        resp = urlopen(req, timeout=5)
        data = json.loads(resp.read().decode())
        return {'ok': data.get('message') == 'Login successful', 'code': resp.status}
    except Exception as e:
        return {'ok': False, 'code': 0, 'error': str(e)}

def auto_repair(name, display):
    global restart_history
    now = datetime.now()
    key = name

    if key in restart_history:
        last = restart_history[key]
        if (now - last['time']).total_seconds() < RESTART_COOLDOWN and last['count'] >= MAX_RESTART_ATTEMPTS:
            log('ERROR', f'[修复] {display} 已达最大重启次数({MAX_RESTART_ATTEMPTS})，进入冷却期')
            return False

    log('WARN', f'[修复] 正在重启 {display} ...')
    if docker_restart(name):
        time.sleep(5)
        if key not in restart_history:
            restart_history[key] = {'time': now, 'count': 0}
        restart_history[key]['time'] = now
        restart_history[key]['count'] += 1
        log('OK', f'[修复] {display} 重启完成 (第 {restart_history[key]["count"]} 次)')
        return True
    else:
        log('ERROR', f'[修复] {display} 重启失败')
        return False

def print_banner():
    print(f'\n{COLORS["CYAN"]}========================================')
    print(f'  法律智能辅助办案系统 - 健康监控服务')
    print(f'  检查间隔: {CHECK_INTERVAL}s (每 {CHECK_INTERVAL // 60} 分钟) | 日志: {LOG_FILE}')
    print(f'========================================{COLORS["RESET"]}\n')

def main():
    print_banner()
    log('INFO', '监控服务启动')

    services = [
        {'name': 'legal_postgres',  'display': 'PostgreSQL'},
        {'name': 'legal_redis',     'display': 'Redis'},
        {'name': 'legal_minio',     'display': 'MinIO'},
        {'name': 'legal_celery',    'display': 'Celery Worker'},
        {'name': 'legal_api',       'display': 'FastAPI'},
    ]

    while True:
        check_time = datetime.now().strftime('%H:%M:%S')
        print(f'\n{COLORS["CYAN"]}========================================')
        print(f'  检测时间: {check_time}')
        print(f'========================================{COLORS["RESET"]}')

        all_ok = True
        failed = []
        results = []

        for svc in services:
            result = check_container(svc['name'], svc['display'])
            extra = ''
            detail = result['detail']

            if svc['name'] == 'legal_api':
                if result['status'] == 'OK':
                    api_health = check_api_health()
                    if not api_health['ok']:
                        result['status'] = 'DOWN'
                        detail = '容器运行中但 /api/health 无响应！uvicorn 可能已崩溃'
                    else:
                        extra = f' | v{api_health["version"]}'
                if result['status'] == 'OK':
                    login_check = check_login_api()
                    if not login_check['ok']:
                        result['status'] = 'WARN'
                        detail = f'健康检查OK但登录接口异常: {login_check.get("error", "未知错误")}'
                    else:
                        extra += ' | 登录OK'

            icon = '✓' if result['status'] == 'OK' else ('⚠' if result['status'] == 'WARN' else '✗')
            color = COLORS['OK'] if result['status'] == 'OK' else (COLORS['WARN'] if result['status'] == 'WARN' else COLORS['ERROR'])

            print(f'  {color}[{icon}] {result["name"]}: {detail}{extra}{COLORS["RESET"]}')
            log_level = 'OK' if result['status'] == 'OK' else ('WARN' if result['status'] == 'WARN' else 'ERROR')
            log(log_level, f'{result["name"]}: {result["status"]} - {detail}{extra}')

            results.append({'svc': svc, 'status': result['status'], 'detail': detail, 'extra': extra})
            if result['status'] != 'OK':
                all_ok = False
                if result['status'] == 'DOWN':
                    failed.append({'svc': svc, 'detail': detail})

        frontend_ok = False
        http_check = check_http('http://localhost:3000')
        if http_check['ok']:
            frontend_ok = True
            print(f'  {COLORS["OK"]}[✓] 前端 (React): HTTP {http_check["code"]} (开发模式){COLORS["RESET"]}')
            log('OK', f'前端 (React): HTTP {http_check["code"]}')
        else:
            print(f'  {COLORS["ERROR"]}[✗] 前端 (React): 端口 3000 无响应{COLORS["RESET"]}')
            log('ERROR', '前端 (React): 端口 3000 无响应')
            all_ok = False

        proxy_ok = True
        if frontend_ok:
            try:
                body = json.dumps({'username': 'admin', 'password': 'admin123'}).encode()
                req = Request('http://localhost:3000/api/auth/login',
                              data=body,
                              headers={'Content-Type': 'application/json'},
                              method='POST')
                resp = urlopen(req, timeout=5)
                data = json.loads(resp.read().decode())
                if data.get('message') != 'Login successful':
                    proxy_ok = False
                    log('WARN', '前端代理登录异常')
            except Exception as e:
                proxy_ok = False
                log('WARN', f'前端代理登录检查失败: {e}')

        if not all_ok:
            print(f'\n  {COLORS["WARN"]}⚠ 发现问题，尝试自动修复...{COLORS["RESET"]}')
            repaired_any = False
            for f in failed:
                if auto_repair(f['svc']['name'], f['svc']['display']):
                    repaired_any = True
            if repaired_any:
                log('INFO', '自动修复完成，下次检测将验证修复效果')
        else:
            print(f'\n  {COLORS["OK"]}✅ 所有服务运行正常{COLORS["RESET"]}')

        print()
        sys.stdout.flush()
        time.sleep(CHECK_INTERVAL)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        log('INFO', '监控服务手动停止')
        print(f'\n{COLORS["CYAN"]}监控服务已停止{COLORS["RESET"]}')
    except Exception as e:
        log('ERROR', f'监控服务异常退出: {e}')
        print(f'{COLORS["RESET"]}')
