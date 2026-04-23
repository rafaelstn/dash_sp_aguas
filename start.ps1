#Requires -Version 5.1
<#
.SYNOPSIS
    Sobe o dashboard SPAguas em modo desenvolvimento, oculto, executando todo
    o processo de inicializacao (venv Python, migrations, importer, Next.js,
    navegador).

.DESCRIPTION
    Etapas idempotentes — reexecutar e seguro, pula o que ja esta pronto:

      1. Valida pre-requisitos (Node, Python, .env.local).
      2. npm install se node_modules ausente.
      3. Cria venv Python em ops/indexer/.venv e instala dependencias se ausente.
         (O mesmo venv atende importer e indexer — dependencias compativeis.)
      4. Se DATABASE_URL preenchido, roda scripts/setup_db.py:
         - Aplica as 19 migrations se a tabela `postos` nao existir.
         - Roda o importer do CSV oficial se `postos` estiver vazia.
         - Pula ambos se ja estiverem prontos.
      5. Se o Next.js ja estiver rodando na porta escolhida, so refresha o browser.
      6. Caso contrario, finaliza processos antigos (via .run/next.pid), inicia
         o Next.js oculto em segundo plano e grava o PID para `.\stop.ps1`.
      7. Abre ou atualiza aba do navegador apontada pro dashboard.

    O worker de indexacao (ops/indexer) NAO e executado aqui — e varredura
    cara do HD de rede e deve rodar fora do horario de expediente
    (Task Scheduler do Windows).

.NOTES
    Companion script: stop.ps1
    Lock file: .run\next.pid
    Log Next.js: .run\next.log
#>

[CmdletBinding()]
param(
    # Portas candidatas, em ordem de preferencia. Primeira livre e escolhida.
    # Passe -Ports 3000 para forcar apenas uma.
    [int[]]$Ports = @(3000, 3001),
    [int]$WaitSeconds = 120
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

$RunDir   = Join-Path $ProjectRoot '.run'
$PidFile  = Join-Path $RunDir 'next.pid'
$LogFile  = Join-Path $RunDir 'next.log'

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

function Test-PortInUse {
    param([int]$Port)
    try {
        $t = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
        return [bool]$t
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
# 2. Venv Python + setup do banco (idempotente)
# --------------------------------------------------------------------------

$HasDatabaseUrl = ($envContent -match '(?m)^\s*DATABASE_URL\s*=\s*\S+')

if ($HasDatabaseUrl) {
    $PyCmd = $null
    foreach ($cand in @('python','py')) {
        if (Get-Command $cand -ErrorAction SilentlyContinue) { $PyCmd = $cand; break }
    }
    if (-not $PyCmd) {
        Write-Err "Python nao encontrado no PATH. Instale Python 3.12+ (ou apague DATABASE_URL do .env.local para rodar em modo demo)."
        exit 1
    }

    $VenvDir  = Join-Path $ProjectRoot 'ops\indexer\.venv'
    $VenvPy   = Join-Path $VenvDir 'Scripts\python.exe'

    if (-not (Test-Path $VenvPy)) {
        Write-Step "Criando venv Python em ops/indexer/.venv..."
        & $PyCmd -m venv $VenvDir
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Falha ao criar venv."
            exit 1
        }
        Write-Step "Instalando dependencias Python (psycopg, dotenv, structlog, unidecode, openpyxl)..."
        & $VenvPy -m pip install --quiet --upgrade pip
        & $VenvPy -m pip install --quiet -e "$ProjectRoot\ops\indexer"
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Falha ao instalar dependencias Python."
            exit 1
        }
        Write-Ok "Venv Python pronto."
    } else {
        Write-Ok "Venv Python ja existe."
    }

    Write-Step "Verificando schema e dados (scripts/setup_db.py)..."
    & $VenvPy "$ProjectRoot\scripts\setup_db.py"
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Setup do banco falhou. Revise a mensagem acima antes de continuar."
        exit 1
    }
    Write-Ok "Banco pronto."
} else {
    Write-Warn "Pulando setup de banco (modo demo)."
}

# --------------------------------------------------------------------------
# 3. Escolher porta disponivel entre as candidatas
# --------------------------------------------------------------------------

Write-Step "Procurando porta disponivel entre: $($Ports -join ', ')..."

# (a) ja ha dashboard respondendo em alguma porta candidata? so refresca.
foreach ($p in $Ports) {
    if (Test-PortResponding -Port $p) {
        $Url = "http://localhost:$p"
        Write-Ok "Porta $p ja responde. Nao vou reiniciar."
        Invoke-BrowserRefreshOrOpen -Url $Url
        Write-Host ""
        Write-Ok "Pronto. Dashboard em $Url"
        exit 0
    }
}

# (b) escolhe a primeira porta nao ocupada
$Port = $null
foreach ($p in $Ports) {
    if (-not (Test-PortInUse -Port $p)) { $Port = $p; break }
}

if (-not $Port) {
    Write-Err "Todas as portas candidatas estao ocupadas por outro processo: $($Ports -join ', ')."
    Write-Host "  Libere uma delas ou passe -Ports <n> em start.ps1." -ForegroundColor Yellow
    exit 1
}

$Url = "http://localhost:$Port"
Write-Ok "Porta escolhida: $Port"

# --------------------------------------------------------------------------
# 4. Parar processo antigo (se houver) e subir Next.js oculto
# --------------------------------------------------------------------------

Stop-TrackedNext

Write-Step "Iniciando Next.js oculto em segundo plano (porta $Port)..."

# '-p $Port' forca a porta: sem fallback silencioso pra portas diferentes.
$startArgs = @{
    FilePath         = 'npm.cmd'
    ArgumentList     = @('run','dev','--','-p',"$Port")
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
# 5. Aguardar a porta responder
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
# 6. Abrir / atualizar navegador
# --------------------------------------------------------------------------

Invoke-BrowserRefreshOrOpen -Url $Url

Write-Host ""
Write-Ok "Tudo pronto."
Write-Host "Dashboard: $Url"
Write-Host "Parar:     .\stop.ps1"
Write-Host "Log:       $LogFile"
