#!/usr/bin/env bash
#
# Subida de versão no servidor do órgão, com reversão automática.
#
# Por que este arquivo existe: até 24/09/2026 cada subida era recortada à mão da
# seção 6.2 do runbook. Em 22/09/2026 a reversão ficou de fora do recorte, o
# `migrate` abortou na migration 0057 e o site esperou em 502, porque o `app` só
# sobe depois de o `migrate` encerrar com sucesso. O runbook diz, com todas as
# letras, que reverter sozinho não é opcional. Enquanto isso dependia de eu colar
# comandos, dependia da minha memória.
#
# Uso, no servidor, como root, com a VPN de pé:
#
#   bash /root/subir-versao.sh sha-<nova> sha-<que-esta-no-ar>
#
# O segundo argumento NÃO é opcional de propósito: é a tag da entrada mais
# recente de docs/runbooks/registro-de-entregas.md, e a divergência entre ela e o
# que está no `.env` é o sinal de que alguém subiu fora deste caminho. O script
# recusa em vez de adivinhar.
#
# O que este roteiro faz e o que não faz:
#   FAZ      -> carrega as imagens, guarda a tag anterior, tira dump com guarda de
#               parada, troca uma única linha do `.env`, sobe, e REVERTE sozinho
#               se o `migrate` sair diferente de 0.
#   NÃO FAZ  -> o ensaio do `migrate` contra Postgres de pé, que é passo da
#               bancada (passo 1 do checklist da seção 0) e roda ANTES daqui.
#               Também não decide nada sobre a carga de estoque.
#
# Executado como root, então nenhum comando com `sudo` entra em pipe: em
# 22/09/2026 o `tee` de um pipeline herdou o `echo` da senha do sudo em vez da
# saída do `pg_dump`, e o dump de produção saiu com 12 bytes contendo a senha.
set -u

SHA="${1:?informe a tag nova, no formato sha-xxxxxxx}"
ANTERIOR="${2:?informe a tag que deve estar no ar, conferida no registro-de-entregas.md}"
DIR=/opt/spaguas-dmo
COMPOSE="docker compose -f $DIR/docker-compose.prod.yml"
PACOTE="${PACOTE:-/root/dmo-$SHA.tar.gz}"

cd "$DIR" || { echo "ABORTAR: $DIR nao existe"; exit 1; }

echo "== 1. Carregar as imagens =="
docker load -i "$PACOTE"
COD=$?
if [ "$COD" != "0" ]; then echo "ABORTAR: docker load saiu com $COD"; exit 1; fi
LINHAS=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep -cE "^spaguas/(dashboard|migrate|carga-estoque):$SHA$")
echo "imagens spaguas com $SHA: $LINHAS   (espera 3, ou 2 quando a entrega nao leva carga-estoque)"
if [ "$LINHAS" -lt 2 ]; then echo "ABORTAR: faltou imagem da tag nova"; exit 1; fi

echo
echo "== 2. Registrar a tag que esta no ar =="
grep '^IMAGEM_TAG=' "$DIR/.env" | tee -a "/root/tag-anterior-$(date -u +%Y%m%d).txt"
NO_AR=$(grep '^IMAGEM_TAG=' "$DIR/.env" | cut -d= -f2)
if [ "$NO_AR" != "$ANTERIOR" ]; then
  echo "ABORTAR: no ar esta $NO_AR e o registro diz $ANTERIOR. Alguem subiu fora deste caminho."
  exit 1
fi

echo
echo "== 3. Dump antes de trocar, com guarda de parada =="
install -d -m 0700 -o root -g root /var/backups/spaguas-dmo
DUMP="/var/backups/spaguas-dmo/antes-de-$SHA-$(date -u +%Y%m%dT%H%M%SZ).dump"
$COMPOSE exec -T db pg_dump -U spaguas -d spaguas_dmo --format=custom </dev/null > "$DUMP"
echo "codigo do pg_dump: $?   (espera 0)"
chmod 0600 "$DUMP"
TAMANHO=$(stat -c %s "$DUMP")
TABELAS=$(cat "$DUMP" | $COMPOSE exec -T db pg_restore --list 2>/dev/null | grep -c 'TABLE DATA')
echo "dump: $TAMANHO bytes, $TABELAS TABLE DATA"
# Referências medidas: 16/09/2026 com 2.085.051 bytes e 43 TABLE DATA; 24/09/2026
# com 2.574.674 e 44. Os pisos abaixo são ordem de grandeza, não a medida do dia:
# dump que encolhe uma ordem de grandeza é dump quebrado, e seguir apagaria a
# única volta possível.
if [ "$TAMANHO" -lt 100000 ] || [ "$TABELAS" -lt 30 ]; then
  echo "ABORTAR: dump com $TAMANHO bytes e $TABELAS TABLE DATA, abaixo do piso (100000 e 30)"
  exit 9
fi
echo "dump valido. Caminho: $DUMP"

echo
echo "== 4. Apontar a versao nova =="
cp -p "$DIR/.env" "$DIR/.env.antes-de-$SHA"
sed -i "s/^IMAGEM_TAG=.*/IMAGEM_TAG=$SHA/" "$DIR/.env"
grep '^IMAGEM_TAG=' "$DIR/.env"

echo
echo "== 5. Subir =="
$COMPOSE up -d
echo "codigo do up: $?"

echo
echo "== 6. Codigo do migrate, com reversao automatica =="
# `ps -a -q` pode listar resquicio de execucao anterior: conto e uso o primeiro,
# dizendo quantos apareceram, para nao medir o codigo de saida do container velho.
IDS_MIGRATE=$($COMPOSE ps -a -q migrate)
echo "containers migrate listados: $(echo "$IDS_MIGRATE" | grep -c .)"
ID_MIGRATE=$(echo "$IDS_MIGRATE" | head -n1)
ESTADO=$(docker inspect --format '{{.State.ExitCode}}|{{.State.FinishedAt}}' "$ID_MIGRATE")
echo "estado do migrate: $ESTADO"
CODIGO_MIGRATE=${ESTADO%%|*}
echo "EXIT_CODE_DO_MIGRATE=$CODIGO_MIGRATE   (espera 0)"
if [ "$CODIGO_MIGRATE" != "0" ]; then
  $COMPOSE logs --no-log-prefix migrate 2>/dev/null | grep -A3 "ERROR:" | head -20
  cp -p "$DIR/.env.antes-de-$SHA" "$DIR/.env"
  grep '^IMAGEM_TAG=' "$DIR/.env"
  # Sem a dependencia do migrate: o banco continua com o schema completo, e o que
  # trava o site e o migrate abortando, nao o app.
  $COMPOSE up -d --no-deps app
  echo "REVERTIDO para $ANTERIOR. Nao tentar de novo antes de ler a secao 7.2 do runbook."
  exit 7
fi

echo
echo "== 7. Conferir que subiu de verdade (secao 6.3 do runbook) =="
$COMPOSE ps -a --format '{{.Service}} | {{.Status}} | {{.Image}}'
echo "--- ultimas linhas do migrate ---"
$COMPOSE logs migrate 2>/dev/null | tail -3
echo "--- contagens do migrate ---"
echo "linhas '->' : $($COMPOSE logs migrate 2>/dev/null | grep -cE -- '-> [0-9]{4}_')   (espera o total de migrations do commit)"
echo "linhas ERROR: $($COMPOSE logs migrate 2>/dev/null | grep -c 'ERROR:')   (espera 0)"
echo "--- banco ---"
$COMPOSE exec -T db psql -U spaguas -d spaguas_dmo -tAc \
  "select count(*) from information_schema.tables where table_schema='public'" </dev/null
echo "   ^ tabelas em public"
$COMPOSE exec -T db psql -U spaguas -d spaguas_dmo -tAc \
  "select to_regclass('public.estoque_desconformidades') is not null,
          (select extversion from pg_extension where extname='postgis')" </dev/null
echo "   ^ espera t|3.4.3"
# O indice transitorio da 0057 (o defeito de 22/09) tem de estar AUSENTE, e o
# substituto da 0060 presente. Pergunto ao catalogo pelos dois NOMES, e nao por
# regclass, que erra e polui a saida quando o objeto nao existe.
$COMPOSE exec -T db psql -U spaguas -d spaguas_dmo -tAc \
  "select indexname from pg_indexes where schemaname='public'
     and indexname in ('idx_estoque_unidades_codigo','idx_estoque_unidades_codigo_spaguas')
   order by 1" </dev/null
echo "   ^ espera SOMENTE idx_estoque_unidades_codigo_spaguas"
echo "--- portas: a 5432 nao pode aparecer ---"
docker inspect spaguas-dmo-db  --format 'db  {{.NetworkSettings.Ports}}'
docker inspect spaguas-dmo-app --format 'app {{.NetworkSettings.Ports}}'
ss -ltnp 2>/dev/null | grep -E ':(3000|5432)' | sed -E 's/users:.*//'
echo "--- a imagem que esta rodando agora ---"
docker inspect spaguas-dmo-app --format 'app roda {{.Config.Image}} | user={{.Config.User}}'
docker inspect "$ID_MIGRATE" --format 'migrate rodou {{.Config.Image}} | user={{.Config.User}}'
echo "--- saude ---"
# O health do app comeca em `starting`: pergunto ao estado, nao ao `ps` de um
# instante atras.
for _ in $(seq 1 30); do
  SAUDE=$(docker inspect spaguas-dmo-app --format '{{.State.Health.Status}}')
  [ "$SAUDE" = "starting" ] || break
  sleep 2
done
echo "health do app: $SAUDE   (espera healthy)"
curl -sS --max-time 20 http://127.0.0.1:3000/api/health; echo
echo
echo "A BORDA SE MEDE DA ESTACAO COM VPN, nao daqui: o servidor nao resolve"
echo "dmo.spaguas.sp.gov.br. Da estacao:"
echo "  curl -sS -o /dev/null -w 'status=%{http_code}\\n' https://dmo.spaguas.sp.gov.br/"
echo "  curl -sS https://dmo.spaguas.sp.gov.br/api/health"

echo
echo "== 8. Tags no disco (retencao) =="
docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^spaguas/' | sort
echo "FIM. Registrar a passagem em docs/runbooks/registro-de-entregas.md."
