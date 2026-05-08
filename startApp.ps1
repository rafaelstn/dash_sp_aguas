#Requires -Version 5.1
<#
.SYNOPSIS
    Abre o app movel (PWA /app) num Chrome/Edge configurado como simulador
    de celular: viewport mobile, user-agent Android, janela "app" sem chrome
    do browser, perfil isolado e DevTools abertos.

.DESCRIPTION
    Companion do start.ps1. Foco em testar o app movel no desktop sem
    precisar de Android Studio nem dispositivo fisico.

    Etapas:
      1. Verifica se o Next esta rodando em alguma porta candidata.
         Se nao estiver, dispara start.ps1 em background.
      2. Aguarda /api/health responder (timeout 60s).
      3. Localiza Chrome (preferencial) ou Edge.
      4. Abre janela em modo --app com:
         - viewport mobile (Pixel 7 por padrao, 412x915)
         - user-agent Android Chrome
         - perfil isolado em .run/chrome-profile (nao bagunca o navegador
           principal: cookies, MFA, tudo separado)
         - DevTools abertos por padrao (cancele com -NoDevTools)

    O script termina apos abrir a janela; o Chrome continua rodando.
    Para fechar tudo: feche a janela do Chrome + ./stop.ps1 pro Next.

.PARAMETER Path
    Rota a abrir dentro do app. Default: /app.
    Exemplos: /app/postos, /triagem, /perfil/mfa.

.PARAMETER Device
    Preset de dispositivo. Opcoes: Pixel7 (default, 412x915), iPhone14
    (390x844), iPad (820x1180), Custom (use -Width e -Height).

.PARAMETER Width / -Height
    Dimensoes customizadas. Sobrescreve -Device.

.PARAMETER NoDevTools
    Nao abrir DevTools automaticamente.

.PARAMETER NoStart
    Nao iniciar o Next automaticamente. Falha se Next nao estiver rodando.

.PARAMETER Port
    Porta do Next a usar. Default: detecta entre 3000 e 3001.

.PARAMETER Browser
    Forca um navegador especifico: chrome | edge. Default: prefere chrome.

.EXAMPLE
    .\startApp.ps1
    Abre /app no Chrome em modo Pixel 7 com DevTools.

.EXAMPLE
    .\startApp.ps1 -Path /triagem -Device iPhone14 -NoDevTools
    Abre tela de triagem como iPhone 14, sem DevTools.

.EXAMPLE
    .\startApp.ps1 -Width 360 -Height 640 -Browser edge
    Edge com viewport custom 360x640.

.NOTES
    Companion: start.ps1 (sobe Next), stop.ps1 (mata Next), startApp.ps1.
    Perfil isolado: .run/chrome-profile (gitignored via .run/).
#>

[CmdletBinding()]
param(
    [string]$Path = '/app',
    [ValidateSet('Pixel7', 'iPhone14', 'iPad', 'Custom')]
    [string]$Device = 'Pixel7',
    [int]$Width,
    [int]$Height,
    [switch]$NoDevTools,
    [switch]$NoStart,
    [int]$Port,
    [ValidateSet('chrome', 'edge')]
    [string]$Browser
)

$ErrorActionPreference = 'Stop'

function Write-Step { param($Msg) Write-Host "==> $Msg" -ForegroundColor Cyan }
function Write-Ok   { param($Msg) Write-Host "[ok] $Msg" -ForegroundColor Green }
function Write-Warn { param($Msg) Write-Host "[!]  $Msg" -ForegroundColor Yellow }
function Write-Err  { param($Msg) Write-Host "[x]  $Msg" -ForegroundColor Red }

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

# --- Device presets -----------------------------------------------------------
$presets = @{
    'Pixel7'    = @{ W = 412; H = 915; UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' }
    'iPhone14'  = @{ W = 390; H = 844; UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
    'iPad'      = @{ W = 820; H = 1180; UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
}

if ($Width -and $Height) {
    $deviceWidth = $Width
    $deviceHeight = $Height
    $userAgent = $presets['Pixel7'].UA
    $deviceLabel = "Custom ${Width}x${Height}"
} else {
    $p = $presets[$Device]
    $deviceWidth = $p.W
    $deviceHeight = $p.H
    $userAgent = $p.UA
    $deviceLabel = $Device
}

# --- Detecta porta do Next ----------------------------------------------------
function Test-NextRunning {
    param([int]$Port)
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" `
                                  -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        return $resp.StatusCode -eq 200
    } catch {
        return $false
    }
}

if ($Port) {
    $candidatePorts = @($Port)
} else {
    $candidatePorts = @(3000, 3001)
}

$activePort = $null
foreach ($p in $candidatePorts) {
    if (Test-NextRunning -Port $p) {
        $activePort = $p
        Write-Ok "Next ja rodando em http://localhost:$p"
        break
    }
}

# --- Sobe Next se preciso ------------------------------------------------------
if (-not $activePort) {
    if ($NoStart) {
        Write-Err "Next nao esta rodando e -NoStart foi passado. Rode .\start.ps1 antes."
        exit 1
    }

    Write-Step "Next nao detectado. Iniciando via .\start.ps1 -NoBrowser..."
    if (-not (Test-Path "$repoRoot\start.ps1")) {
        Write-Err "start.ps1 nao encontrado em $repoRoot. Rode 'npm run dev' manualmente."
        exit 1
    }

    $startArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "$repoRoot\start.ps1")
    if ($Port) { $startArgs += @('-Ports', $Port) }
    Start-Process -FilePath 'powershell.exe' -ArgumentList $startArgs -WindowStyle Hidden | Out-Null

    Write-Step 'Aguardando Next ficar pronto (timeout 60s)...'
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        foreach ($p in $candidatePorts) {
            if (Test-NextRunning -Port $p) {
                $activePort = $p
                break
            }
        }
        if ($activePort) { break }
        Start-Sleep -Milliseconds 800
    }

    if (-not $activePort) {
        Write-Err 'Next nao subiu em 60s. Verifique .run\next.log ou rode start.ps1 manualmente.'
        exit 1
    }
    Write-Ok "Next pronto em http://localhost:$activePort"
}

$targetUrl = "http://localhost:$activePort$Path"

# --- Localiza navegador --------------------------------------------------------
function Find-Chrome {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    return $null
}

function Find-Edge {
    $candidates = @(
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { return $c }
    }
    return $null
}

$browserPath = $null
$browserName = $null

if ($Browser -eq 'chrome') {
    $browserPath = Find-Chrome
    $browserName = 'Chrome'
    if (-not $browserPath) {
        Write-Err 'Chrome nao encontrado. Tente -Browser edge ou instale o Chrome.'
        exit 1
    }
} elseif ($Browser -eq 'edge') {
    $browserPath = Find-Edge
    $browserName = 'Edge'
    if (-not $browserPath) {
        Write-Err 'Edge nao encontrado.'
        exit 1
    }
} else {
    $browserPath = Find-Chrome
    $browserName = 'Chrome'
    if (-not $browserPath) {
        $browserPath = Find-Edge
        $browserName = 'Edge'
    }
    if (-not $browserPath) {
        Write-Err 'Nem Chrome nem Edge encontrados. Instale um e tente de novo.'
        exit 1
    }
}

Write-Ok "Navegador escolhido: $browserName ($browserPath)"

# --- Perfil isolado ------------------------------------------------------------
$profileDir = Join-Path $repoRoot '.run\chrome-profile'
if (-not (Test-Path $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
    Write-Ok "Perfil isolado criado em: $profileDir"
} else {
    Write-Ok "Reusando perfil isolado: $profileDir"
}

# --- Argumentos ----------------------------------------------------------------
$browserArgs = @(
    "--app=$targetUrl",
    "--user-data-dir=$profileDir",
    "--window-size=$deviceWidth,$deviceHeight",
    "--window-position=80,80",
    "--user-agent=$userAgent",
    '--disable-features=TranslateUI',
    '--no-first-run',
    '--no-default-browser-check'
)

if (-not $NoDevTools) {
    $browserArgs += '--auto-open-devtools-for-tabs'
}

Write-Step "Abrindo $deviceLabel ($deviceWidth x $deviceHeight) em $targetUrl"
Start-Process -FilePath $browserPath -ArgumentList $browserArgs

Write-Host ''
Write-Ok 'App aberto. Sumario:'
Write-Host "  URL         : $targetUrl"
Write-Host "  Dispositivo : $deviceLabel"
Write-Host "  Viewport    : ${deviceWidth} x ${deviceHeight}"
Write-Host "  User-Agent  : $userAgent"
Write-Host "  DevTools    : $(if ($NoDevTools) { 'desabilitado' } else { 'aberto' })"
Write-Host "  Perfil      : $profileDir (isolado do Chrome principal)"
Write-Host ''
Write-Host 'Para fechar: feche a janela do navegador e rode .\stop.ps1 para parar o Next.' -ForegroundColor DarkGray
Write-Host 'No DevTools, use o Toggle Device Toolbar (Ctrl+Shift+M) para emular gestos touch.' -ForegroundColor DarkGray
