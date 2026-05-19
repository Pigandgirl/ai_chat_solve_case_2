$ErrorActionPreference = "Continue"
$host.UI.RawUI.WindowTitle = "法律系统 - 监控服务"

$LOG_DIR = "$PSScriptRoot\logs"
if (-not (Test-Path $LOG_DIR)) { New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null }
$LOG_FILE = Join-Path $LOG_DIR "monitor_$(Get-Date -Format 'yyyyMMdd').log"

$CHECK_INTERVAL = 30
$MAX_RESTART_ATTEMPTS = 3
$RESTART_COOLDOWN = 120

$restartHistory = @{}

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Message"
    Add-Content -Path $LOG_FILE -Value $line -Encoding UTF8

    $color = switch ($Level) {
        "ERROR" { "Red" }
        "WARN"  { "Yellow" }
        "OK"    { "Green" }
        default { "White" }
    }
    Write-Host $line -ForegroundColor $color
}

function Write-Banner {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  法律智能辅助办案系统 - 健康监控服务" -ForegroundColor Cyan
    Write-Host "  检查间隔: ${CHECK_INTERVAL}s | 日志: $LOG_FILE" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Test-ContainerHealth {
    param([string]$ContainerName, [string]$DisplayName, [string]$Type)
    $result = @{
        Name   = $DisplayName
        Status = "DOWN"
        Detail = ""
    }

    try {
        $inspect = docker inspect $ContainerName 2>$null | ConvertFrom-Json
        if (-not $inspect) {
            $result.Detail = "容器不存在"
            return $result
        }

        $state = $inspect.State
        if ($state.Status -ne "running") {
            $result.Detail = "容器状态: $($state.Status)"
            return $result
        }

        if ($inspect.State.Health) {
            $health = $inspect.State.Health.Status
            if ($health -ne "healthy") {
                if ($Type -eq "service") {
                    $result.Detail = "健康检查: $health (可能是刚启动)"
                } else {
                    $result.Detail = "健康检查: $health"
                    return $result
                }
            }
        }

        $result.Status = "OK"
        $result.Detail = if ($inspect.State.Health) { "healthy (运行中)" } else { "运行中" }
    } catch {
        $result.Detail = "检测异常: $_"
    }

    return $result
}

function Test-HttpEndpoint {
    param([string]$Url, [int]$TimeoutSec = 5)
    try {
        $req = [System.Net.WebRequest]::Create($Url)
        $req.Timeout = $TimeoutSec * 1000
        $req.Method = "HEAD"
        $resp = $req.GetResponse()
        $code = [int]$resp.StatusCode
        $resp.Close()
        return @{ OK = ($code -ge 200 -and $code -lt 400); Code = $code }
    } catch {
        return @{ OK = $false; Code = 0; Error = $_.Exception.Message }
    }
}

function Test-ApiHealth {
    try {
        $req = [System.Net.WebRequest]::Create("http://localhost:8000/api/health")
        $req.Timeout = 5000
        $resp = $req.GetResponse()
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $body = $reader.ReadToEnd()
        $reader.Close()
        $resp.Close()
        $json = $body | ConvertFrom-Json
        return @{ OK = ($json.status -eq "ok"); Version = $json.version }
    } catch {
        return @{ OK = $false; Error = $_.Exception.Message }
    }
}

function Test-CeleryWorker {
    try {
        $logs = docker logs legal_celery --tail 5 2>$null
        if ($logs -match "ready" -or $logs -match "celery@") {
            return @{ OK = $true }
        }
        $running = docker inspect legal_celery 2>$null | ConvertFrom-Json
        if ($running.State.Status -eq "running") {
            return @{ OK = $true }
        }
        return @{ OK = $false }
    } catch {
        return @{ OK = $false; Error = $_ }
    }
}

function Invoke-AutoRepair {
    param([string]$ContainerName, [string]$DisplayName)

    $now = Get-Date
    $key = $ContainerName

    if ($restartHistory.ContainsKey($key)) {
        $last = $restartHistory[$key]
        if (($now - $last.Time).TotalSeconds -lt $RESTART_COOLDOWN -and $last.Count -ge $MAX_RESTART_ATTEMPTS) {
            Write-Log "[修复] $DisplayName 已达最大重启次数($MAX_RESTART_ATTEMPTS)，进入冷却期" "ERROR"
            return $false
        }
    }

    Write-Log "[修复] 正在重启 $DisplayName ..." "WARN"
    try {
        docker restart $ContainerName 2>$null | Out-Null
        Start-Sleep -Seconds 5

        if (-not $restartHistory.ContainsKey($key)) {
            $restartHistory[$key] = @{ Time = $now; Count = 0 }
        }
        $restartHistory[$key].Time = $now
        $restartHistory[$key].Count++

        Write-Log "[修复] $DisplayName 重启完成 (第 $($restartHistory[$key].Count) 次)" "OK"
        return $true
    } catch {
        Write-Log "[修复] $DisplayName 重启失败: $_" "ERROR"
        return $false
    }
}

function Start-MonitorLoop {
    Write-Banner
    Write-Log "监控服务启动" "INFO"

    $services = @(
        @{ Name = "legal_postgres";  Display = "PostgreSQL";   Type = "infra" },
        @{ Name = "legal_redis";     Display = "Redis";        Type = "infra" },
        @{ Name = "legal_minio";     Display = "MinIO";        Type = "infra" },
        @{ Name = "legal_celery";    Display = "Celery Worker"; Type = "worker" },
        @{ Name = "legal_api";       Display = "FastAPI";       Type = "api" },
        @{ Name = "legal_frontend";  Display = "前端 (React)";   Type = "frontend" }
    )

    while ($true) {
        $checkTime = Get-Date -Format "HH:mm:ss"
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "  检测时间: $checkTime" -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Cyan

        $allOk = $true
        $failedServices = @()

        foreach ($svc in $services) {
            $containerResult = Test-ContainerHealth -ContainerName $svc.Name -DisplayName $svc.Display -Type $svc.Type

            $icon = if ($containerResult.Status -eq "OK") { "[✓]" } else { "[✗]" }
            $color = if ($containerResult.Status -eq "OK") { "Green" } else { "Red" }

            $extraCheck = ""
            if ($svc.Name -eq "legal_api" -and $containerResult.Status -eq "OK") {
                $apiHealth = Test-ApiHealth
                if (-not $apiHealth.OK) {
                    $containerResult.Status = "DOWN"
                    $containerResult.Detail = "API 端口正常但 /api/health 无响应！服务可能卡死"
                } else {
                    $extraCheck = " | v$($apiHealth.Version)"
                }
            }

            if ($svc.Name -eq "legal_frontend" -and $containerResult.Status -eq "OK") {
                $httpCheck = Test-HttpEndpoint -Url "http://localhost:3000"
                if (-not $httpCheck.OK) {
                    $containerResult.Status = "DOWN"
                    $containerResult.Detail = "端口 3000 无响应"
                } else {
                    $extraCheck = " | HTTP $($httpCheck.Code)"
                }
            }

            Write-Host "  $icon $($svc.Display): $($containerResult.Detail)$extraCheck" -ForegroundColor $color
            Write-Log "$($svc.Display): $($containerResult.Status) - $($containerResult.Detail)$extraCheck" $(if ($containerResult.Status -eq "OK") { "OK" } else { "ERROR" })

            if ($containerResult.Status -ne "OK") {
                $allOk = $false
                $failedServices += @{ Svc = $svc; Detail = $containerResult.Detail }
            }
        }

        if (-not $allOk) {
            Write-Host ""
            Write-Host "  ⚠ 发现问题，尝试自动修复..." -ForegroundColor Yellow
            foreach ($failed in $failedServices) {
                if ($failed.Svc.Type -ne "frontend") {
                    Invoke-AutoRepair -ContainerName $failed.Svc.Name -DisplayName $failed.Svc.Display
                }
            }

            if ($failedServices | Where-Object { $_.Svc.Name -eq "legal_frontend" }) {
                Write-Log "[修复] 前端由 npm start 管理，如需要请手动重启" "WARN"
            }
        } else {
            Write-Host ""
            Write-Host "  ✓ 所有服务运行正常" -ForegroundColor Green
        }

        Write-Host ""
        Start-Sleep -Seconds $CHECK_INTERVAL
    }
}

try {
    Start-MonitorLoop
} catch {
    Write-Log "监控服务异常退出: $_" "ERROR"
    Write-Host "监控服务异常退出: $_" -ForegroundColor Red
} finally {
    Write-Log "监控服务停止" "INFO"
}
