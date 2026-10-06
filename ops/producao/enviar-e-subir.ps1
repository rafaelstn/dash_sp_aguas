# Lado ESTACAO da subida de versao: leva o pacote offline para o servidor do
# orgao e dispara o ops/producao/subir-versao.sh de la.
#
# Por que existe: ate 06/10/2026 estes comandos eram colados a mao no terminal,
# e colar bloco de varias linhas no PowerShell 5.1 come caracteres (naquele dia
# o "if" virou "f" e a guarda nao rodou). Passo colado a mao nao e passo
# confiavel: aqui ele e um script, chamado por UMA linha.
#
# Pre-requisitos medidos no mesmo dia:
#   - VPN de pe. Sem VPN a porta 22 do 10.199.43.27 nao tem rota.
#   - Atalho "dmo" no ~/.ssh/config, apontando para a copia local da chave.
#     Apontar para o cofre (F:, que e SMB) faz o OpenSSH ler a permissao como
#     aberta, DESCARTAR a chave sem erro fatal e cair para senha.
#
# Exemplo:
#   .\ops\producao\enviar-e-subir.ps1 -Pacote C:\...\dmo-sha-e5ac0c9.tar.gz `
#       -TagNova sha-e5ac0c9 -TagAnterior sha-4b93252

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Pacote,
    [Parameter(Mandatory = $true)][string]$TagNova,
    [Parameter(Mandatory = $true)][string]$TagAnterior,
    [string]$Alvo = 'dmo'
)

$ErrorActionPreference = 'Stop'

function Parar($mensagem) {
    Write-Host ''
    Write-Host "PAROU: $mensagem" -ForegroundColor Red
    Write-Host 'Nada foi executado no servidor.' -ForegroundColor Red
    exit 1
}

$manifesto = "$Pacote.sha256"
$script = Join-Path $PSScriptRoot 'subir-versao.sh'

# As tres pecas existem ANTES de abrir conexao: falhar aqui custa segundos,
# falhar no meio do envio de 237 MB custa a janela.
if (-not (Test-Path -LiteralPath $Pacote)) { Parar "o pacote nao existe: $Pacote" }
if (-not (Test-Path -LiteralPath $manifesto)) { Parar "o manifesto nao existe: $manifesto" }
if (-not (Test-Path -LiteralPath $script)) { Parar "o subir-versao.sh nao existe: $script" }

$tamanho = (Get-Item -LiteralPath $Pacote).Length
Write-Host "Pacote    : $Pacote"
Write-Host "Tamanho   : $tamanho bytes"
Write-Host "Vai subir : $TagNova (deve estar no ar hoje: $TagAnterior)"
Write-Host "Servidor  : $Alvo"
Write-Host ''
Write-Host 'Enviando. Sao centenas de MB pela VPN, entao demora.' -ForegroundColor Cyan

scp $Pacote $manifesto $script "${Alvo}:/root/"
if ($LASTEXITCODE -ne 0) { Parar "o scp saiu com codigo $LASTEXITCODE" }

Write-Host ''
Write-Host 'Enviado. Conferindo o hash no servidor antes de tocar em producao.' -ForegroundColor Cyan

# O sha256sum e o subir-versao.sh ficam encadeados por && de proposito: hash
# que nao bate PARA antes da subida, em vez de subir pacote corrompido.
$nomePacote = Split-Path -Leaf $Pacote
$remoto = "cd /root && sha256sum -c $nomePacote.sha256 && bash /root/subir-versao.sh $TagNova $TagAnterior"
ssh $Alvo $remoto
$codigo = $LASTEXITCODE

Write-Host ''
if ($codigo -ne 0) {
    Write-Host "O servidor saiu com codigo $codigo." -ForegroundColor Red
    Write-Host 'Codigo 7 significa que o migrate falhou e o script JA reverteu sozinho.' -ForegroundColor Yellow
    exit $codigo
}

Write-Host 'Subida concluida no servidor.' -ForegroundColor Green
Write-Host ''
Write-Host 'Falta o aceite, que e por RENDERIZACAO e nao por status:' -ForegroundColor Yellow
Write-Host '  node scripts\verificar-csp-nonce.mjs https://dmo.spaguas.sp.gov.br'
