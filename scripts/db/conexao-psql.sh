#!/usr/bin/env bash
# =============================================================================
# Componente de conexão dos scripts de BANCADA que chamam o psql.
#
# POR QUE EXISTE (sintoma medido em 23/09/2026): scripts/db/db-migrate.sh e
# scripts/dev.sh passavam a connection string inteira como argumento do psql
# (`psql "$DATABASE_URL" ...`), então a senha do banco ficava legível em `ps`
# para qualquer processo da máquina durante a execução. É a mesma classe de
# defeito consertada em db/migrate.sh no mesmo dia, e ela voltaria arquivo por
# arquivo se cada script resolvesse do seu jeito: por isso a cirurgia mora aqui,
# num único lugar, e não em cada chamador.
#
# O que este arquivo faz: separa a SENHA da string de conexão, entrega a senha
# ao psql por PGPASSWORD (ambiente só é legível pelo mesmo uid e pelo root, ao
# contrário de argv, que é legível por qualquer um) e devolve em PSQL_CONEXAO os
# argumentos SEM segredo. Quando não sabe separar com certeza, RECUSA com
# instrução, em vez de adivinhar e produzir "password authentication failed".
#
# Este arquivo é feito para ser lido com `.` (source), não executado.
#
# O QUE NÃO FOI MEDIDO: nenhuma conexão real foi aberta ao escrever isto (a
# bancada estava sem banco de pé em 23/09/2026, por limite de disco). O que foi
# medido, com um psql de mentira que registra argumento e ambiente
# (ops/testing/regua-psql), é que a senha sai do argv, que ela chega ao psql por
# PGPASSWORD com o valor certo (comparação por md5, sem imprimir senha) e que
# cada caminho de recusa recusa com zero chamadas.
# =============================================================================

# Decodifica %XX, que é como a senha vem dentro de uma URI (o painel do Supabase
# entrega a string já percent-encoded). Sem isto, mover a senha para PGPASSWORD
# mandaria ao servidor o texto `p%40ss` em vez de `p@ss`.
#
# Recusa (código 1) quando encontra um `%` que não é escape válido, porque aí o
# certo é o desenvolvedor exportar PGPASSWORD à mão: adivinhar daria erro de
# autenticação sem explicação.
#
# Limite conhecido: um byte 0x0A no fim da senha seria perdido pela substituição
# de comando. Senha com quebra de linha não existe nos ambientes deste projeto, e
# não vale um segundo mecanismo para cobrir isso.
decodificar_percent() {
  local resto="$1"
  local saida=''
  while [ -n "$resto" ]; do
    case "$resto" in
      %[0-9A-Fa-f][0-9A-Fa-f]*)
        saida+=$(printf '%b' "\\x${resto:1:2}")
        resto="${resto:3}"
        ;;
      %*)
        return 1
        ;;
      *)
        saida+="${resto:0:1}"
        resto="${resto:1}"
        ;;
    esac
  done
  printf '%s' "$saida"
}

# Uso: preparar_conexao_psql [connection_string]
#
# Define o array PSQL_CONEXAO com os argumentos de conexão do psql (nunca com a
# senha) e exporta PGPASSWORD quando há senha a entregar. Sai com código 1 e
# mensagem em stderr quando não há como conectar sem adivinhar.
#
# Precedência, que é a de antes mais o caminho das PG*:
#   1) a string passada como argumento
#   2) $DATABASE_URL (o chamador é quem decide se carrega o .env.local antes)
#   3) PGHOST/PGUSER/PGDATABASE (ou POSTGRES_*) mais POSTGRES_PASSWORD
preparar_conexao_psql() {
  local conexao="${1:-${DATABASE_URL:-}}"
  PSQL_CONEXAO=()

  if [ -z "$conexao" ]; then
    # Sem string de conexão: só segue se o desenvolvedor pediu explicitamente o
    # caminho das PG*, para não conectar calado nos defaults do libpq (localhost,
    # usuário do sistema, banco de mesmo nome) quando ele só esqueceu o .env.local.
    if [ -n "${PGHOST:-}" ] || [ -n "${PGDATABASE:-}" ] || [ -n "${POSTGRES_DB:-}" ]; then
      if [ -z "${PGPASSWORD:-}" ]; then
        if [ -z "${POSTGRES_PASSWORD:-}" ]; then
          echo "erro: defina POSTGRES_PASSWORD (ou PGPASSWORD) para usar o caminho das PG*." >&2
          return 1
        fi
        PGPASSWORD="$POSTGRES_PASSWORD"
        export PGPASSWORD
      fi
      PSQL_CONEXAO=(
        -h "${PGHOST:-localhost}"
        -p "${PGPORT:-5432}"
        -U "${PGUSER:-${POSTGRES_USER:-postgres}}"
        -d "${PGDATABASE:-${POSTGRES_DB:-postgres}}"
      )
      return 0
    fi
    echo "erro: sem conexão. Defina DATABASE_URL no .env.local, passe a connection string como argumento, ou exporte PGHOST/PGUSER/PGDATABASE mais POSTGRES_PASSWORD." >&2
    return 1
  fi

  # Conninfo por palavra-chave com senha dentro (`host=... password=...`) tem o
  # mesmo defeito da URI, e separar palavra-chave é outra gramática: recusa.
  case "$conexao" in
    *password=*)
      echo "erro: a string de conexão traz password=, que ficaria visível em ps. Tire a senha da string e exporte PGPASSWORD." >&2
      return 1
      ;;
  esac

  case "$conexao" in
    postgres://*|postgresql://*) ;;
    *)
      # Não é URI (por exemplo só o nome do banco): não há senha a separar.
      PSQL_CONEXAO=("$conexao")
      return 0
      ;;
  esac

  local esquema="${conexao%%://*}"
  local sem_esquema="${conexao#*://}"
  local autoridade="${sem_esquema%%[/?]*}"
  local resto_uri="${sem_esquema#"$autoridade"}"

  local arrobas="${autoridade//[^@]/}"
  if [ "${#arrobas}" -gt 1 ]; then
    # Numa URI válida o arroba da senha é escrito %40, então mais de um arroba
    # aqui significa string fora do padrão: recusa em vez de cortar no lugar errado.
    echo "erro: a URI tem mais de um arroba na autoridade e não há como separar a senha com certeza. Tire a senha da URI e exporte PGPASSWORD." >&2
    return 1
  fi

  if [ "${#arrobas}" -eq 0 ]; then
    # Sem userinfo, não há senha embutida.
    PSQL_CONEXAO=("$conexao")
    return 0
  fi

  local userinfo="${autoridade%@*}"
  local servidor="${autoridade##*@}"

  case "$userinfo" in
    *:*) ;;
    *)
      # Usuário sem senha na URI.
      PSQL_CONEXAO=("$conexao")
      return 0
      ;;
  esac

  local usuario="${userinfo%%:*}"
  local senha_bruta="${userinfo#*:}"

  if [ -z "$senha_bruta" ]; then
    PSQL_CONEXAO=("${esquema}://${usuario}@${servidor}${resto_uri}")
    return 0
  fi

  local senha
  if ! senha=$(decodificar_percent "$senha_bruta"); then
    echo "erro: a senha na URI tem um % que não é escape válido, e decodificar no chute daria erro de autenticação. Tire a senha da URI e exporte PGPASSWORD." >&2
    return 1
  fi

  PGPASSWORD="$senha"
  export PGPASSWORD
  PSQL_CONEXAO=("${esquema}://${usuario}@${servidor}${resto_uri}")
  return 0
}
