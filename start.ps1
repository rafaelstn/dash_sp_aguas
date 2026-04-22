#Requires -Version 5.1
<#
.SYNOPSIS
    Sobe o dashboard SPAguas em modo desenvolvimento, oculto, e abre/atualiza o navegador.

.DESCRIPTION
    - Valida pre-requisitos (Node, .env.local com DATABASE_URL).
    - Instala dependencias se node_modules nao existir.
    - Se o Next.js ja estiver rodando e respondendo na porta 3000, apenas atualiza
      a aba existente do navegador; nao reinicia o processo.
    - Caso contrario, finaliza processos antigos do projeto (via .run/next.pid),
      inicia o Next.js como processo oculto e grava o PID para permitir parada limpa.
    - Procura uma janela de navegador com "localhost:3000" / "SPAguas" no titulo:
      se existir, ativa e envia F5; senao, abre uma nova aba no navegador padrao.

.NOTES
    Companion script: stop.ps1
    Lock file: .run\next.pid
#>

[CmdletBinding()]
param(
    [int]$Port = 3000,
    [int]$WaitSeconds = 90
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

$RunDir   = Join-Path $ProjectRoot '.run'
$PidFile  = Join-Path $RunDir 'next.pid'
$LogFile  = Join-Path $RunDir 'next.log'
$Url      = "http://localhost:$Port"

if (-not (Test-Path $RunDir)) {
    New-Item -ItemType Directory -Path $RunDir | Out-Null
}

function Write-Step    { param($Msg) Write-Host "==> $Msg" -ForegroundColor Cyan }
function Write-Ok      { param($Msg) Write-Host "[ok] $Msg" -ForegroundColor Green }
function Write-Warn    { param($Msg) Write-Host "[!]  $Msg" -ForegroundColor Yellow }
function Write-Err     { param($Msg) Write-Host "[x]  $Msg" -ForegroundColor Red }

function Test-PortResponding {
    param([int]$Port)
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$Port" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Stop-TrackedNext {
    if (Test-Path $PidFile) {
        $oldPid = Get-Content $PidFile -ErrorAction SilentlyContinue
        if ($oldPid -and ($oldPid -match '^\d+$')) {
            $proc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Step "Encerrando processo antigo (PID $oldPid) e filhos..."
                try {
                    # mata a arvore inteira (next -> node workers)
                    Get-CimInstance Win32_Process -Filter "ParentProcessId=$oldPid" |
                        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
                    Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
                } catch {
                    Write-Warn "Nao consegui matar o processo $oldPid (pode ja ter sido encerrado)."
                }
            }
        }
        Remove-Item $PidFile -ErrorAction SilentlyContinue
    }
}

function Invoke-BrowserRefreshOrOpen {
    param([string]$Url)

    $titleMatches = @('localhost:3000', 'SPAguas', 'SPAGUAS', 'Ficha Tecnica', 'SPÁguas')
    $browserNames = @('chrome', 'msedge', 'brave', 'opera', 'firefox')

    $target = Get-Process -ErrorAction SilentlyContinue | Where-Object {
        if (-not $_.MainWindowTitle) { return $false }
        if (-not ($browserNames -contains $_.ProcessName)) { return $false }
        foreach ($m in $titleMatches) {
            if ($_.MainWindowTitle -like "*$m*") { return $true }
        }
        return $false
    } | Select-Object -First 1

    if ($target) {
        Write-Step "Atualizando aba existente no $($target.ProcessName) (PID $($target.Id))..."
        try {
            Add-Type -AssemblyName System.Windows.Forms | Out-Null
            $wsh = New-Object -ComObject WScript.Shell
            $ativou = $wsh.AppActivate($target.Id)
            Start-Sleep -Milliseconds 300
            if ($ativou) {
                [System.Windows.Forms.SendKeys]::SendWait('{F5}')
                Write-Ok "Aba atualizada (F5 enviado)."
                return
            } else {
                Write-Warn "Nao consegui ativar a janela; abrindo nova aba."
            }
        } catch {
            Write-Warn "Falha ao enviar F5: $($_.Exception.Message). Abrindo nova aba."
        }
    }

    Write-Step "Abrindo $Url no navegador padrao..."
    Start-Process $Url | Out-Null
}

# --------------------------------------------------------------------------
# 1. Pre-requisitos
# --------------------------------------------------------------------------

Write-Step "Checando pre-requisitos..."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "Node.js nao encontrado no PATH. Instale Node 20+ antes de continuar."
    exit 1
}
$nodeVersion = (node --version) -replace '^v',''
Write-Ok "Node $nodeVersion"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Err "npm nao encontrado no PATH."
    exit 1
}

$envFile = Join-Path $ProjectRoot '.env.local'
if (-not (Test-Path $envFile)) {
    Write-Err ".env.local nao existe. Copie .env.example para .env.local e preencha DATABASE_URL."
    exit 1
}

$envContent = Get-Content $envFile -Raw
if ($envContent -notmatch '(?m)^\s*DATABASE_URL\s*=\s*\S+') {
    Write-Warn "DATABASE_URL vazio no .env.local -- iniciando em MODO DEMO (dados mockados em memoria)."
    Write-Warn "Para usar banco real, preencha DATABASE_URL em: $envFile"
} else {
    Write-Ok ".env.local presente com DATABASE_URL preenchido"
}

if (-not (Test-Path (Join-Path $ProjectRoot 'node_modules'))) {
    Write-Step "node_modules ausente. Rodando npm install (primeira execucao)..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Err "npm install falhou."
        exit 1
    }
    Write-Ok "Dependencias instaladas."
}

# --------------------------------------------------------------------------
# 2. Se ja esta rodando e respondendo, so refresca o navegador
# --------------------------------------------------------------------------

Write-Step "Verificando se o Next.js ja esta rodando na porta $Port..."

if (Test-PortResponding -Port $Port) {
    Write-Ok "Porta $Port ja responde. Nao vou reiniciar."
    Invoke-BrowserRefreshOrOpen -Url $Url
    Write-Host ""
    Write-Ok "Pronto. Dashboard em $Url"
    exit 0
}

# --------------------------------------------------------------------------
# 3. Parar processo antigo (se houver) e subir Next.js oculto
# --------------------------------------------------------------------------

Stop-TrackedNext

Write-Step "Iniciando Next.js oculto em segundo plano..."

# captura stdout/stderr do Next para .run/next.log
$startArgs = @{
    FilePath         = 'npm.cmd'
    ArgumentList     = @('run','dev')
    WorkingDirectory = $ProjectRoot
    WindowStyle      = 'Hidden'
    PassThru         = $true
    RedirectStandardOutput = $LogFile
    RedirectStandardError  = (Join-Path $RunDir 'next.err.log')
}

$proc = Start-Process @startArgs
$proc.Id | Out-File -FilePath $PidFile -Encoding ascii
Write-Ok "Next.js iniciado (PID $($proc.Id)). Log: $LogFile"

# --------------------------------------------------------------------------
# 4. Aguardar a porta responder
# --------------------------------------------------------------------------

Write-Step "Aguardando http://localhost:$Port responder (timeout ${WaitSeconds}s)..."

$deadline = (Get-Date).AddSeconds($WaitSeconds)
$ready = $false
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    if (Test-PortResponding -Port $Port) {
        $ready = $true
        break
    }
    # se o processo morreu durante o boot, desiste
    $alive = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
    if (-not $alive) {
        Write-Err "Processo Next.js morreu durante o boot. Verifique $LogFile e $(Join-Path $RunDir 'next.err.log')."
        Remove-Item $PidFile -ErrorAction SilentlyContinue
        exit 1
    }
}

if (-not $ready) {
    Write-Err "Porta $Port nao respondeu dentro de $WaitSeconds segundos."
    Write-Host "Log em: $LogFile" -ForegroundColor Yellow
    exit 1
}

Write-Ok "Next.js respondendo em $Url"

# --------------------------------------------------------------------------
# 5. Abrir / atualizar navegador
# --------------------------------------------------------------------------

Invoke-BrowserRefreshOrOpen -Url $Url

Write-Host ""
Write-Ok "Tudo pronto."
Write-Host "Dashboard: $Url"
Write-Host "Parar:     .\stop.ps1"
Write-Host "Log:       $LogFile"
