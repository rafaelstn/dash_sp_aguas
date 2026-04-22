#Requires -Version 5.1
<#
.SYNOPSIS
    Finaliza o Next.js do dashboard SPAguas e libera a porta.

.DESCRIPTION
    - Le o PID rastreado em .run\next.pid e mata o processo + filhos (workers).
    - Como rede de seguranca, tambem mata qualquer node.exe cuja linha de comando
      aponte para "next" rodando nesta pasta (caso o usuario tenha iniciado sem o start.ps1).
    - Nao mexe no navegador.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

$RunDir  = Join-Path $ProjectRoot '.run'
$PidFile = Join-Path $RunDir 'next.pid'

function Write-Step { param($Msg) Write-Host "==> $Msg" -ForegroundColor Cyan }
function Write-Ok   { param($Msg) Write-Host "[ok] $Msg" -ForegroundColor Green }
function Write-Warn { param($Msg) Write-Host "[!]  $Msg" -ForegroundColor Yellow }

function Stop-Tree {
    param([int]$RootPid)
    try {
        $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$RootPid" -ErrorAction SilentlyContinue
        foreach ($c in $children) {
            Stop-Tree -RootPid $c.ProcessId
        }
        Stop-Process -Id $RootPid -Force -ErrorAction SilentlyContinue
    } catch { }
}

$killed = $false

# 1. Processo rastreado pelo start.ps1
if (Test-Path $PidFile) {
    $trackedPid = Get-Content $PidFile -ErrorAction SilentlyContinue
    if ($trackedPid -and ($trackedPid -match '^\d+$')) {
        $proc = Get-Process -Id $trackedPid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Step "Encerrando processo rastreado (PID $trackedPid) e filhos..."
            Stop-Tree -RootPid ([int]$trackedPid)
            $killed = $true
        } else {
            Write-Warn "PID $trackedPid nao corresponde a um processo vivo."
        }
    }
    Remove-Item $PidFile -ErrorAction SilentlyContinue
}

# 2. Rede de seguranca: qualquer node.exe rodando "next dev" a partir desta pasta
Write-Step "Procurando processos Node orfaos vinculados a este projeto..."

$projectPath = $ProjectRoot
$nodes = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -and
        ($_.CommandLine -match 'next' -or $_.CommandLine -match 'npm') -and
        ($_.CommandLine -like "*$projectPath*" -or $_.ExecutablePath -like "*$projectPath*")
    }

foreach ($n in $nodes) {
    Write-Step "Encerrando node.exe orfao (PID $($n.ProcessId))"
    Stop-Tree -RootPid ([int]$n.ProcessId)
    $killed = $true
}

# 3. Confirma que a porta 3000 liberou
Start-Sleep -Seconds 1
$still = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($still) {
    Write-Warn "Porta 3000 ainda ocupada por PID(s): $($still.OwningProcess -join ', ')"
    Write-Warn "Se nao for deste projeto, trate manualmente."
} else {
    Write-Ok "Porta 3000 liberada."
}

if ($killed) {
    Write-Ok "Dashboard SPAguas parado."
} else {
    Write-Warn "Nenhum processo relacionado encontrado."
}
