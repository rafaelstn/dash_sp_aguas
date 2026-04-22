# Indexer — Worker de varredura do HD de rede SPÁguas

Varre recursivamente um diretório (normalmente um caminho UNC da rede do governo) e registra cada PDF em `arquivos_indexados` (match com prefixo conhecido) ou `arquivos_orfaos` (sem match). Operação **read-only** no filesystem — nunca modifica arquivos.

## Pré-requisitos

1. Python 3.12+.
2. Migrations aplicadas.
3. Tabela `postos` populada (o worker precisa da lista de prefixos).
4. `.env.local` com `DATABASE_URL_INDEXER` e `INDEXER_ROOT_PATH`.
5. Máquina que executa o worker tem acesso autorizado ao(s) caminho(s) de rede.

## Execução

```bash
python ops/indexer/index_fs.py --root "\\\\servidor\\postos"
```

## Estratégia de match de prefixo

Em vez de regex, o worker usa lookup contra a lista real de prefixos (2.484 valores na planilha atual). Razão: a planilha oficial apresenta 6 formatos distintos de prefixo, e não há regex único que cubra todos sem falso-positivo. Detalhes em `../../docs/architecture.md` §8.3 e `../../docs/spec.md` §4.2.1.

## Reconstrução por lote

Cada execução gera um `lote_indexacao` (UUID). Ao final, registros de execuções anteriores cujo `caminho_absoluto` começa com a raiz varrida e **não** foi visto neste lote são removidos — isso garante que a tabela reflita o estado real do filesystem.
