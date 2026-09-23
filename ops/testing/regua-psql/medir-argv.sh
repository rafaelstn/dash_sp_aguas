#!/usr/bin/env bash
# =============================================================================
# Regua da classe "senha do banco no argv do psql".
#
# POR QUE EXISTE (sintoma medido em 23/09/2026): tres scripts deste repositorio
# chamavam `psql` com a connection string inteira como argumento, entao a senha
# do banco ficava legivel em `ps` para qualquer processo da maquina enquanto eles
# rodavam. No caminho do container isso alcancava a credencial do banco do orgao,
# legivel tambem por `docker top`.
#
# O QUE ELA MEDE, e por que nao da para medir isso com padrao de texto: depois do
# conserto a senha viaja em PGPASSWORD e o argv sai de um array
# (`psql "${PSQL_CONEXAO[@]}"`) ou de `set --` (`psql "$@"`). Nenhuma varredura
# de FORMA segue esse desvio: ela veria `"$@"` e nao saberia dizer o que ha
# dentro. A propriedade em disputa e o VALOR que chega ao processo, e quem mede
# valor e um psql de mentira que registra o que recebeu (psql-de-mentira/psql).
#
# COMO SE LE O RESULTADO: cada caso imprime a contagem que ele afirma. O caso
# `mutante` reintroduz o defeito de proposito e SO passa se esta regua reprovar
# aquele codigo: regua que nunca reprovou o defeito e enfeite verde.
#
# O QUE ELA NAO MEDE:
#   1) Nenhuma conexao real. Nenhum caso aqui prova que o Postgres aceita a
#      forma nova; prova que o argv nao leva senha e que PGPASSWORD chega com o
#      valor certo. A prova de conexao exige banco de pe e esta no job
#      `integracao` do CI e na conferencia (i) do runbook de entrega.
#   2) O caminho "sem string de conexao" de scripts/db/db-migrate.sh nao e
#      exercitado ponta a ponta de proposito: ele carrega o .env.local da
#      bancada, e regua nao le arquivo de segredo do desenvolvedor. Esse caminho
#      e medido no componente (casos `componente-*`), que e onde a decisao mora.
#   3) Ela nao olha `docs/`. Documento que ENSINA a forma antiga continua
#      possivel e se conserta a mao.
#   4) scripts/dev.sh nao e exercitado aqui: ele sobe o `next dev`. Ele usa o
#      mesmo componente, e a regressao dele e pega pela guarda de FORMA do CI,
#      que foi provada em 23/09/2026 semeando nele a forma antiga (a guarda
#      reprovou apontando o arquivo e a linha).
# =============================================================================
set -euo pipefail

RAIZ="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." &> /dev/null && pwd)"
BIN_MENTIRA="$RAIZ/ops/testing/regua-psql/psql-de-mentira"
COMPONENTE="$RAIZ/scripts/db/conexao-psql.sh"
MUTANTE="$RAIZ/scripts/db/.regua-mutante-db-migrate.sh"

TRABALHO="$(mktemp -d)"
limpar() {
  rm -rf "$TRABALHO"
  rm -f "$MUTANTE"
}
trap limpar EXIT

# A sentinela nao e senha de ninguem: e valor inventado aqui, e o registro nunca
# a imprime. Ela existe com `%21` na URI para que a regua tambem reprove
# decodificacao errada, que e o jeito silencioso de o conserto quebrar (o usuario
# veria "password authentication failed" e culparia o banco).
MARCA='SENTINELA-NAO-REAL-9f3c'
SENHA_CLARA="${MARCA}!"
SENHA_NA_URI="${MARCA}%21"
MD5_ESPERADO=$(printf '%s' "$SENHA_CLARA" | md5sum | cut -d' ' -f1)

falhas=0
reprovar() {
  echo "FALHA: $*" >&2
  falhas=$((falhas + 1))
}
aprovar() { echo "ok   $*"; }

registro=''
novo_registro() {
  registro="$TRABALHO/registro-$1.txt"
  : > "$registro"
  export REGISTRO_PSQL="$registro"
}

chamadas() { grep -c '^ARGV:' "$registro" || true; }
com_marca() { grep '^ARGV:' "$registro" | grep -c -- "$MARCA" || true; }
com_senha_certa() { grep -c "^AMBIENTE: PGPASSWORD=presente md5=$MD5_ESPERADO\$" "$registro" || true; }
com_stop() { grep '^ARGV:' "$registro" | grep -c -- '\[-v\] \[ON_ERROR_STOP=1\]' || true; }

# Roda um caso num ambiente limpo: nada de PG*, POSTGRES_* nem DATABASE_URL da
# bancada vaza para dentro. Sem isto um caso de recusa passaria porque a maquina
# de quem roda tinha a variavel exportada.
rodar_limpo() {
  (
    unset PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE
    unset POSTGRES_PASSWORD POSTGRES_USER POSTGRES_DB DATABASE_URL
    PATH="$BIN_MENTIRA:$PATH"
    export PATH
    "$@"
  ) > "$TRABALHO/saida.txt" 2>&1
}

# ---------------------------------------------------------------------------
# Piso contra leitura vazia. Se as migrations nao forem encontradas, todos os
# casos abaixo passam com zero chamada e a regua fica verde sem medir nada.
# ---------------------------------------------------------------------------
QTD_MIGRATIONS=$(find "$RAIZ/supabase/migrations" -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')
if [ "$QTD_MIGRATIONS" -lt 50 ]; then
  echo "FALHA: esperava ao menos 50 migrations em supabase/migrations e encontrei $QTD_MIGRATIONS. Sem elas esta regua nao mede nada: corrigir o caminho." >&2
  exit 1
fi
echo "migrations encontradas: $QTD_MIGRATIONS"

# ---------------------------------------------------------------------------
# Instrumento antes do alvo. Se o psql de mentira nao estiver executavel (o bit
# de execucao se perde facil num repositorio que vem do Windows), o PATH resolve
# `psql` para o cliente de VERDADE, que no runner esta instalado, e esta regua
# passa a medir outra coisa sem dizer nada.
# ---------------------------------------------------------------------------
if [ ! -x "$BIN_MENTIRA/psql" ]; then
  echo "FALHA: $BIN_MENTIRA/psql nao esta executavel, entao o PATH cairia no psql de verdade. Corrigir com: git update-index --chmod=+x ops/testing/regua-psql/psql-de-mentira/psql" >&2
  exit 1
fi
resolvido=$(PATH="$BIN_MENTIRA:$PATH" command -v psql)
if [ "$resolvido" != "$BIN_MENTIRA/psql" ]; then
  echo "FALHA: com o diretorio da mentira na frente do PATH, \`psql\` ainda resolve para '$resolvido'. Esta regua nao esta medindo o que diz medir." >&2
  exit 1
fi
echo "psql de mentira no PATH: $resolvido"

# ---------------------------------------------------------------------------
# Caso 1: scripts/db/db-migrate.sh com a URI passada como argumento, que e o uso
# do dia a dia. ANTES do conserto, todas as chamadas levavam a senha no argv.
# ---------------------------------------------------------------------------
novo_registro 'db-migrate-uri'
# `bash <script>` e nao execucao direta: e assim que o README e o
# docs/onboarding-notebook.md mandam chamar (`bash scripts/db/db-migrate.sh`), e
# nenhum .sh versionado deste repositorio carrega bit de execucao (todos
# 100644, medido em 23/09/2026 com `git ls-files -s`). No Git Bash do Windows
# isso nao aparece, porque `core.fileMode=false` deixa executar de qualquer
# forma; no Linux do CI a execucao direta deu `Permission denied` e a regua
# reprovou com ZERO chamada de psql, o que passou nas assercoes de AUSENCIA e
# so foi denunciado pela assercao de PRESENCA das 73 chamadas.
if ! rodar_limpo bash "$RAIZ/scripts/db/db-migrate.sh" "postgresql://spaguas:${SENHA_NA_URI}@localhost:5432/spaguas"; then
  reprovar "db-migrate.sh saiu com erro no caminho da URI. Saida:"
  cat "$TRABALHO/saida.txt" >&2
fi

n=$(chamadas)
echo "db-migrate.sh (URI): $n chamadas de psql"
[ "$n" -eq "$QTD_MIGRATIONS" ] || reprovar "esperava $QTD_MIGRATIONS chamadas de psql e obtive $n."

n_marca=$(com_marca)
echo "db-migrate.sh (URI): $n_marca chamadas com a senha no argv (esperado 0)"
[ "$n_marca" -eq 0 ] || reprovar "a senha continua no argv do psql em $n_marca chamadas."

n_senha=$(com_senha_certa)
echo "db-migrate.sh (URI): $n_senha chamadas com PGPASSWORD no valor esperado"
[ "$n_senha" -eq "$n" ] || reprovar "esperava PGPASSWORD com o md5 certo em todas as $n chamadas e obtive $n_senha (senha nao decodificada, ou nao exportada)."

n_stop=$(com_stop)
[ "$n_stop" -eq "$n" ] || reprovar "esperava -v ON_ERROR_STOP=1 em todas as $n chamadas e obtive $n_stop."

n_uri=$(grep '^ARGV:' "$registro" | grep -c -- '\[postgresql://spaguas@localhost:5432/spaguas\]' || true)
[ "$n_uri" -eq "$n" ] || reprovar "esperava a URI sem senha no argv das $n chamadas e obtive $n_uri."

# A ordem dos arquivos e o comportamento que o conserto nao podia mudar: a
# migration 0057 depende do que a 0045 fez.
# O `|| true` nao e frouxidao: com o registro VAZIO (caso 1 quebrado por qualquer
# motivo) o `grep` sai 1, e sob `set -euo pipefail` o pipeline mata a regua aqui,
# antes do mutante e dos outros nove casos. Foi o que aconteceu no run 35927205357:
# a regua reprovou o que devia reprovar e nao relatou mais nada, e ferramenta que
# morre ao relatar esconde os outros achados. A falha de verdade ja esta contada.
grep '^ARGV:' "$registro" | sed -n 's/.*\[-f\] \[\(.*\)\]$/\1/p' | sed 's#.*/##' > "$TRABALHO/ordem-obtida.txt" || true
find "$RAIZ/supabase/migrations" -maxdepth 1 -name '*.sql' | sed 's#.*/##' | sort > "$TRABALHO/ordem-esperada.txt"
if cmp -s "$TRABALHO/ordem-obtida.txt" "$TRABALHO/ordem-esperada.txt"; then
  aprovar "db-migrate.sh: ordem dos $n arquivos igual a \`ls | sort\`, ON_ERROR_STOP em todas, senha so no ambiente."
else
  reprovar "a ordem dos arquivos aplicados mudou. Diferenca:"
  diff "$TRABALHO/ordem-esperada.txt" "$TRABALHO/ordem-obtida.txt" >&2 || true
fi

# ---------------------------------------------------------------------------
# Caso 2: o MUTANTE. Reintroduz a forma antiga no db-migrate.sh e exige que esta
# regua reprove. A copia mora no mesmo diretorio de proposito, para que
# SCRIPT_DIR e PROJECT_ROOT resolvam igual e o unico desvio seja a linha trocada.
# ---------------------------------------------------------------------------
# O texto da forma antiga e montado com escape de proposito, em vez de escrito
# literal: escrito literal, ele faria a guarda de FORMA do CI (passo "a senha do
# banco nunca no argv do psql") acusar esta propria regua, e guarda que precisa se
# isentar de um arquivo perde o valor. O escape muda o byte no disco e nao muda o
# que o sed produz.
FORMA_NOVA='psql "${PSQL_CONEXAO\[@\]}"'
FORMA_ANTIGA="psql \"\$CONN\""
sed "s#$FORMA_NOVA#$FORMA_ANTIGA#" "$RAIZ/scripts/db/db-migrate.sh" > "$MUTANTE"
# A fronteira `(^|[[:space:]])` nao e enfeite: sem ela o proprio nome da funcao
# `preparar_conexao_psql "$CONN"`, na linha de cima, casa como se fosse a chamada
# do psql, a contagem da 2 e a semeadura parece errada quando esta certa.
trocas=$(grep -c -E '(^|[[:space:]])psql "\$CONN"' "$MUTANTE" || true)
if [ "$trocas" -ne 1 ]; then
  reprovar "o mutante nao foi semeado (esperava 1 troca, obtive $trocas). Sem a semeadura o resultado abaixo nao mede esta regua."
else
  novo_registro 'mutante'
  # Tambem por `bash`, como o caso 1: o mutante mede ESTA regua, e invocar por
  # caminho diferente do caso que ele espelha seria medir outra coisa. E por isso
  # que a copia nao recebe bit de execucao.
  rodar_limpo bash "$MUTANTE" "postgresql://spaguas:${SENHA_NA_URI}@localhost:5432/spaguas" || true
  n_mutante=$(com_marca)
  echo "mutante (forma antiga): $n_mutante chamadas com a senha no argv"
  if [ "$n_mutante" -gt 0 ]; then
    aprovar "mutante: esta regua REPROVA a forma antiga ($n_mutante chamadas com senha no argv)."
  else
    reprovar "o mutante com a forma antiga passou sem senha no argv. Esta regua esta medindo outra coisa."
  fi
fi
rm -f "$MUTANTE"

# ---------------------------------------------------------------------------
# Caso 3: o componente no caminho das PG*, que e o caminho de producao do
# container e o caminho de quem exporta PGHOST na bancada.
# ---------------------------------------------------------------------------
novo_registro 'componente-pg'
(
  unset PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE
  unset POSTGRES_PASSWORD POSTGRES_USER POSTGRES_DB DATABASE_URL
  PATH="$BIN_MENTIRA:$PATH"; export PATH
  PGHOST='localhost'; export PGHOST
  POSTGRES_DB='spaguas'; export POSTGRES_DB
  POSTGRES_USER='spaguas'; export POSTGRES_USER
  POSTGRES_PASSWORD="$SENHA_CLARA"; export POSTGRES_PASSWORD
  # shellcheck source=scripts/db/conexao-psql.sh
  . "$COMPONENTE"
  preparar_conexao_psql '' || exit 3
  psql "${PSQL_CONEXAO[@]}" -v ON_ERROR_STOP=1 -f qualquer.sql
) > "$TRABALHO/saida.txt" 2>&1 || reprovar "o componente recusou o caminho das PG* com senha presente."

n=$(chamadas)
n_marca=$(com_marca)
n_senha=$(com_senha_certa)
n_flags=$(grep '^ARGV:' "$registro" | grep -c -- '\[-h\] \[localhost\] \[-p\] \[5432\] \[-U\] \[spaguas\] \[-d\] \[spaguas\]' || true)
echo "componente (PG*): $n chamada(s), $n_marca com senha no argv, $n_senha com PGPASSWORD certo, $n_flags com -h/-p/-U/-d"
[ "$n" -eq 1 ] || reprovar "esperava 1 chamada no caminho das PG* e obtive $n."
[ "$n_marca" -eq 0 ] || reprovar "a senha apareceu no argv no caminho das PG*."
[ "$n_senha" -eq 1 ] || reprovar "PGPASSWORD nao chegou com o valor esperado no caminho das PG*."
[ "$n_flags" -eq 1 ] || reprovar "o argv do caminho das PG* nao e -h/-p/-U/-d como esperado."

# ---------------------------------------------------------------------------
# Casos 4 a 8: RECUSA. A exigencia e recusar com ZERO chamadas, porque metade
# do valor de um fail-closed e nao ter chamado o psql de qualquer jeito.
# ---------------------------------------------------------------------------
recusa() {
  local nome="$1" conexao="$2"
  shift 2
  novo_registro "recusa-$nome"
  local codigo=0
  (
    unset PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE
    unset POSTGRES_PASSWORD POSTGRES_USER POSTGRES_DB DATABASE_URL
    PATH="$BIN_MENTIRA:$PATH"; export PATH
    # Variaveis do caso, no formato NOME=valor.
    for par in "$@"; do
      export "${par?}"
    done
    # shellcheck source=scripts/db/conexao-psql.sh
    . "$COMPONENTE"
    # O `|| exit 3` e o que faz esta medicao existir. O `set -e` do topo NAO vale
    # aqui: subshell chamado na esquerda de um `||` roda com o -e suprimido, e foi
    # assim que os cinco casos de recusa passaram como "codigo 0" na primeira
    # execucao, em 23/09/2026, com o psql sendo chamado depois da recusa. Instrumento
    # quebrado antes do alvo: a recusa se declara aqui, na mao.
    preparar_conexao_psql "$conexao" || exit 3
    psql "${PSQL_CONEXAO[@]}" -c 'SELECT 1;'
  ) > "$TRABALHO/saida-$nome.txt" 2>&1 || codigo=$?

  local n_chamadas
  n_chamadas=$(chamadas)
  if [ "$codigo" -eq 0 ]; then
    reprovar "recusa '$nome': o componente NAO recusou (codigo 0)."
  elif [ "$n_chamadas" -ne 0 ]; then
    reprovar "recusa '$nome': recusou, mas depois de $n_chamadas chamada(s) de psql."
  else
    aprovar "recusa '$nome': codigo $codigo, zero chamadas de psql, mensagem: $(head -1 "$TRABALHO/saida-$nome.txt")"
  fi
}

recusa 'pg-sem-senha' '' 'PGHOST=localhost' 'POSTGRES_DB=spaguas'
recusa 'sem-conexao-nenhuma' ''
recusa 'conninfo-com-password' "host=localhost dbname=spaguas password=${SENHA_CLARA}"
recusa 'uri-com-dois-arrobas' "postgresql://spaguas:${SENHA_CLARA}@sobra@localhost:5432/spaguas"
recusa 'uri-com-escape-invalido' "postgresql://spaguas:${MARCA}%2@localhost:5432/spaguas"

# ---------------------------------------------------------------------------
# Casos 9 e 10: db/migrate.sh, o script que roda DENTRO do container e aplica as
# migrations no servidor do orgao. Ele usa caminhos absolutos do container
# (/db, /migrations), que nao existem na bancada nem no runner: a copia troca
# esses dois caminhos e NADA MAIS, e a troca e conferida antes de valer.
# ---------------------------------------------------------------------------
COPIA="$TRABALHO/copia-migrate.sh"
sed -e "s#/db/auth-compat.sql#$RAIZ/db/auth-compat.sql#" \
    -e "s#/migrations/#$RAIZ/supabase/migrations/#" "$RAIZ/db/migrate.sh" > "$COPIA"
chmod +x "$COPIA"
sobrou=$(grep -c -E '(^| )/(db|migrations)/' "$COPIA" || true)
if [ "$sobrou" -ne 0 ]; then
  reprovar "a copia de db/migrate.sh ainda tem $sobrou caminho absoluto de container: os casos abaixo nao mediriam o script."
else
  novo_registro 'container-pg'
  (
    unset PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE
    unset POSTGRES_PASSWORD POSTGRES_USER POSTGRES_DB DATABASE_URL
    PATH="$BIN_MENTIRA:$PATH"; export PATH
    PGHOST='db'; export PGHOST
    POSTGRES_PASSWORD="$SENHA_CLARA"; export POSTGRES_PASSWORD
    sh "$COPIA"
  ) > "$TRABALHO/saida-container.txt" 2>&1 || reprovar "db/migrate.sh recusou o caminho das PG* com POSTGRES_PASSWORD presente."

  n=$(chamadas)
  n_marca=$(com_marca)
  n_senha=$(com_senha_certa)
  n_flags=$(grep '^ARGV:' "$registro" | grep -c -- '\[-h\] \[db\] \[-p\] \[5432\] \[-U\] \[spaguas\] \[-d\] \[spaguas\]' || true)
  esperado=$((QTD_MIGRATIONS + 1))
  echo "db/migrate.sh (PG*): $n chamadas (esperado $esperado: shim + migrations), $n_marca com senha no argv, $n_senha com PGPASSWORD certo"
  [ "$n" -eq "$esperado" ] || reprovar "esperava $esperado chamadas em db/migrate.sh e obtive $n."
  [ "$n_marca" -eq 0 ] || reprovar "a senha apareceu no argv de db/migrate.sh em $n_marca chamadas."
  [ "$n_senha" -eq "$n" ] || reprovar "PGPASSWORD nao chegou com o valor esperado em todas as chamadas de db/migrate.sh."
  [ "$n_flags" -eq "$n" ] || reprovar "o argv de db/migrate.sh nao e -h/-p/-U/-d em todas as chamadas."

  # Sem senha e sem DATABASE_URL o script de producao tem que recusar antes de
  # qualquer chamada, e nao adivinhar credencial (era `:-spaguas` embutido).
  novo_registro 'container-sem-senha'
  codigo=0
  (
    unset PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE
    unset POSTGRES_PASSWORD POSTGRES_USER POSTGRES_DB DATABASE_URL
    PATH="$BIN_MENTIRA:$PATH"; export PATH
    sh "$COPIA"
  ) > "$TRABALHO/saida-container-sem-senha.txt" 2>&1 || codigo=$?
  n=$(chamadas)
  if [ "$codigo" -eq 0 ]; then
    reprovar "db/migrate.sh NAO recusou sem POSTGRES_PASSWORD."
  elif [ "$n" -ne 0 ]; then
    reprovar "db/migrate.sh recusou depois de $n chamada(s) de psql."
  else
    aprovar "db/migrate.sh: sem POSTGRES_PASSWORD recusa com codigo $codigo e zero chamadas."
  fi
fi

echo
if [ "$falhas" -ne 0 ]; then
  echo "REGUA REPROVADA: $falhas asserto(es) falharam." >&2
  exit 1
fi
echo "REGUA APROVADA: nenhuma senha no argv do psql nos scripts medidos, e cada caminho de recusa recusa com zero chamadas."
