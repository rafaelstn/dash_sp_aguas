#!/bin/sh
# =============================================================================
# Chamador das rotinas periodicas do SP Aguas DMO, no proprio host.
# =============================================================================
# Destino no servidor:  /usr/local/bin/spaguas-cron.sh   (0750, root:root)
#
# POR QUE ISTO EXISTE
# -------------------
# As tres rotas de /api/cron/* eram chamadas por agendador do provedor. O
# servidor do orgao nao tem saida para a internet e nao ha agendador externo,
# entao NINGUEM as chamava. Uma delas e a anonimizacao da trilha de auditoria,
# que cumpre o prazo de retencao exigido pela LGPD: sem chamador, a retencao
# simplesmente NAO ACONTECIA, em silencio, enquanto a documentacao de entrega
# afirmava que acontecia. Registrado na secao 9.4 do runbook.
#
# O segredo e lido do app.env NA HORA e passado por cabecalho. Ele nao aparece
# em argv (a lista de processos do host e legivel por qualquer usuario) nem no
# journal: `curl` recebe o cabecalho por arquivo de configuracao em descritor,
# e nao por linha de comando.
#
# Uso:  spaguas-cron.sh <rota>
#   ex: spaguas-cron.sh anonimizar-trilha
# =============================================================================
set -eu

ROTA="${1:?uso: spaguas-cron.sh <rota>}"
AMBIENTE=/etc/spaguas-dmo/app.env
ALVO="http://127.0.0.1:3000/api/cron/${ROTA}"

if [ ! -r "$AMBIENTE" ]; then
  echo "spaguas-cron: $AMBIENTE ilegivel" >&2
  exit 78
fi

SEGREDO=$(awk -F= '/^CRON_SECRET=/{print $2; exit}' "$AMBIENTE")
if [ -z "$SEGREDO" ]; then
  echo "spaguas-cron: CRON_SECRET vazio em $AMBIENTE, rotina $ROTA NAO executada" >&2
  exit 78
fi

# O cabecalho vai por arquivo temporario com permissao restrita, e nao por
# argumento: argumento aparece em `ps` para qualquer processo da maquina.
CONF=$(mktemp)
chmod 600 "$CONF"
# `trap` cobre saida normal, erro e sinal: sem isso um `set -e` no meio deixa o
# arquivo com o segredo no disco.
trap 'rm -f "$CONF"' EXIT INT TERM
printf 'header = "x-cron-secret: %s"\n' "$SEGREDO" > "$CONF"

# 1800s NAO e margem arbitraria: a sincronizacao do Monitor foi MEDIDA em
# 378 s (5.415 estacoes e 540 mil medicoes do SIBH), e com o limite anterior de
# 300 s ela falhava por tempo mesmo funcionando. O teto continua existindo
# porque rotina pendurada para sempre e pior que rotina que falha: com o teto,
# `systemctl --failed` acusa; sem ele, ela some.
#
# A cadencia de hora em hora cabe nos 378 s com folga larga, entao nao ha
# sobreposicao. Se a sincronizacao passar a demorar mais que a cadencia, isto
# aqui e o lugar de rever as duas coisas juntas.
INICIO=$(date +%s)
CODIGO=$(curl -sS -o /tmp/spaguas-cron-"$ROTA".out -w '%{http_code}' \
  --max-time 1800 --config "$CONF" -X POST "$ALVO") || {
  echo "spaguas-cron: $ROTA FALHOU ao chamar $ALVO" >&2
  exit 1
}
FIM=$(date +%s)

# Log em voz alta, com o codigo e a resposta: rotina que roda em silencio e
# indistinguivel de rotina que nao roda, e foi assim que a retencao ficou
# parada sem ninguem perceber.
echo "spaguas-cron: $ROTA HTTP $CODIGO em $((FIM - INICIO))s"
head -c 500 /tmp/spaguas-cron-"$ROTA".out || true
echo

# Codigo diferente de 2xx e falha: o systemd marca a unidade e `systemctl
# --failed` passa a mostrar. Sem isto, erro 500 diario seria invisivel.
case "$CODIGO" in
  2*) exit 0 ;;
  *)  echo "spaguas-cron: $ROTA respondeu $CODIGO" >&2; exit 1 ;;
esac
