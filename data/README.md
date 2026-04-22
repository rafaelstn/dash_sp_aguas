# data/

Dados brutos e fixtures do projeto. Nenhum arquivo aqui é produzido pelo sistema — tudo vem de fonte externa (cliente SPÁguas) e é consumido pelos scripts de ingestão.

## Conteúdo

### `Postos_PLU_FLU_PIEZO_CIAS_BAT_MUNIC_UGRHI_SUB_OTTO-18-03-26a-csv.csv`

Planilha mestra fornecida pelo cliente em 2026-03-18. Contém os 2.484 postos hidrológicos da rede SPÁguas com 37 colunas cadastrais (PREFIXO, coordenadas, bacia, UGRHI, aquífero, status PCD, etc.).

- **Encoding:** UTF-8
- **Separador:** `,`
- **Quoting:** valores com vírgula aparecem entre aspas duplas
- **Consumido por:** `ops/importer/import_csv.py` (variável `IMPORTER_CSV_PATH` em `.env.local`)

Qualquer atualização da planilha pelo cliente **substitui este arquivo** — o importador é idempotente (`INSERT ... ON CONFLICT DO UPDATE`) e só adiciona uma linha em `import_log`.

### `samples/`

Exemplos reais de nome de arquivo PDF do HD de rede do cliente, usados como fixture para testar o parser do indexer (`ops/indexer/index_fs.py`).

- `1D-002 01 1960 08 26.pdf` — formato PARCIAL (Prefixo + CodDoc + data, sem CodEnc). Documento histórico de 1960.

Os PDFs aqui não têm valor operacional; servem apenas para validar que o regex reconhece os 3 formatos de nome (COMPLETO, PARCIAL, LEGADO) previstos em `docs/architecture.md` §8.

## Política

- **Não editar manualmente** o CSV. Qualquer correção cadastral deve vir do cliente (nova versão da planilha) — rastreabilidade exigida por LGPD em governo.
- PDFs reais de postos (não-samples) **nunca** entram aqui. O HD de rede do cliente é a fonte de verdade; o indexer apenas registra metadados em `arquivos_indexados`.
