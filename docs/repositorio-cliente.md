# Repositório de documentos do cliente — notas de descoberta

Documento interno consolidando o que aprendemos dos dois manuais oficiais do DAEE ("Como consultar a pasta repositório" e "Descrição dos Documentos de Campo") em 2026-04-22. Os manuais originais estão em `docs/manuais-cliente/` (gitignored — os prints expõem IP interno da rede DAEE).

## 1. Localização

**Drive mapeado na máquina do técnico:** `Y:\000 Documentos de Campo\`

Equivalente ao compartilhamento de rede interno do DAEE (registrado nos manuais do cliente, detalhes em `docs/manuais-cliente/` — não replicar aqui).

O worker de indexação deve ser configurado com `INDEXER_ROOT_PATH=Y:\000 Documentos de Campo` na máquina autorizada.

## 2. Estrutura de pastas

```
Y:\000 Documentos de Campo\
├── Atividades diversas do DAEE\         (docs em execução — fora de escopo por ora)
├── DOCUMENTOS-CTHDOC-RECUPERAÇÃO\       (documentos antigos digitalizados)
│   ├── REPOSITORIO\                     (MODELO B — PDFs numéricos)
│   │   ├── 138591.pdf
│   │   ├── 138592.pdf
│   │   └── ...
│   ├── relacao_doc_arquivos_cthdoc.xlsx (MAPEAMENTO número → posto)
│   ├── Levantamento Arquivo Hidrologia.xlsx
│   └── Como consultar a pasta repositorio.pdf
├── Fluviometria\                        (MODELO A — pasta por prefixo)
│   ├── 0 FICHAS DESCRITIVAS FLU - Ativos\
│   ├── 0 FICHAS DESCRITIVAS FLU - Completa\
│   ├── 0 Paralisados\
│   ├── 0 SEM PREFIXO\                   (desconformidade pré-classificada)
│   ├── 1D-008 paralisado\               (exemplo de pasta com anotação textual)
│   ├── 2D-013\
│   ├── 2D-028\
│   └── ...
├── Med.vazão por email - Uso Joãozinho\ (fora de escopo)
├── Piezometria\                         (MODELO A)
│   ├── 0 DUVIDAS\
│   ├── 0 SemPrefixo\
│   ├── 2E-500Z\
│   └── ...
├── Pluviometria\                        (MODELO A)
│   ├── 0 duvidas\
│   ├── 0 FICHAS DESCRITIVAS PLU\
│   ├── 0 Paralisado\
│   ├── 0 SemPrefixo\
│   ├── A7-005\
│   ├── B4-001\
│   └── ...
└── QualiAgua\                           (MODELO A — convênio CETESB/DAEE)
    ├── AGUA02010\
    ├── BACO02950\
    └── ...
```

## 3. Dois modelos de arquivo (CRÍTICO — impacta o indexer)

### Modelo A — por prefixo

Pastas: `Fluviometria\`, `Pluviometria\`, `Piezometria\`, `QualiAgua\`.

- Estrutura: `{TipoDado}\{PREFIXO}\{arquivo.pdf}`
- Nome do arquivo segue padrão `{Prefixo} {CodDoc} [{CodEnc}] [opcional] {AAAA MM DD}.pdf` — aceito em 3 variantes (`COMPLETO`, `PARCIAL`, `LEGADO`) já implementadas em `ops/indexer/index_fs.py`.
- Exemplo de arquivo real (fornecido pelo Rafael): `1D-002 01 1960 08 26.pdf` (PARCIAL — sem CodEnc).

### Modelo B — numérico com mapeamento Excel

Pasta: `DOCUMENTOS-CTHDOC-RECUPERAÇÃO\REPOSITORIO\`.

- Arquivos nomeados por **número sequencial**: `138591.pdf`, `138639.pdf`, etc. Nada no nome do arquivo identifica o posto.
- Mapeamento **posto ↔ arquivo** vem da planilha `relacao_doc_arquivos_cthdoc.xlsx`, também no HD de rede.
- Colunas relevantes da planilha (manuais mostram):
  | Coluna | Conteúdo | Exemplo |
  |--------|----------|---------|
  | A | PREFIXO | `C6-100` |
  | B | Tipo do Dado | `PLUVIAL` |
  | C | Tipo de Documento | `Ficha de Inspeção`, `Ficha Descritiva`, `Outros` |
  | F | Arquivo | `138639.pdf` |

- **Status no projeto:** o indexer atual (`ops/indexer/index_fs.py`) só cobre Modelo A. Extensão para Modelo B pendente de implementação.

## 4. Pastas especiais — desconformidade pré-classificada pelo cliente

O cliente já organiza fora do fluxo normal:

| Pasta (variações observadas) | Categoria | Tratamento proposto |
|------------------------------|-----------|---------------------|
| `0 SEM PREFIXO`, `0 SemPrefixo` | Arquivos sem posto identificado | Indexer marca como `arquivos_orfaos` categoria `PREFIXO_DESCONHECIDO`, tipo_dado preenchido |
| `0 DUVIDAS`, `0 duvidas` | Pendência sob análise | `arquivos_orfaos` categoria `PENDENCIA_CLIENTE` (nova) |
| `0 Paralisados`, `0 Paralisado` | Docs de postos inativos | Indexar normalmente, mas com flag `posto_paralisado=true` no metadado |
| `0 FICHAS DESCRITIVAS FLU/PLU (...)` | Fichas gerais não ligadas a posto específico | `arquivos_orfaos` categoria `FICHA_GERAL` (nova) |
| `{PREFIXO} paralisado` (ex: `1D-008 paralisado`) | Variação do nome da pasta | Regex do indexer deve tolerar sufixo textual — extrair o prefixo antes do espaço |

O módulo `/desconformidades` já desenhado cobre isso conceitualmente; só precisa das novas categorias.

## 5. Observações históricas (relevantes para produto)

- Digitalização começou **no fim de 2017 / início de 2018**. Documentos anteriores existem em papel e podem não estar no HD.
- Documentação **mais atualizada** é mantida pela Engª Luzia no antigo Laboratório de Sedimentometria — fora do HD. Pode gerar divergência entre "o que o sistema vê" e "o que existe de fato".
- Postos foram **paralisados/reativados** em décadas diferentes (80, 90) — o mesmo prefixo pode aparecer em mais de um contexto. Já coberto em `docs/spec.md` §4.2.1.

## 6. Impacto no backlog (não implementado ainda)

Quando o Rafael autorizar a extensão, Lucas precisa:

1. **Indexer Modelo B:**
   - Nova lib: `openpyxl` ou `pandas` pra ler `relacao_doc_arquivos_cthdoc.xlsx`
   - Novo modo de operação: `--modo=repositorio` vs `--modo=por-prefixo` (ou unificar com detecção automática pela pasta)
   - Tabela `arquivos_indexados` já tem os campos necessários (prefixo, tipo_dado, cod_tipo_documento); só ganha `numero_arquivo TEXT NULL` e `origem_mapeamento VARCHAR(16)` (`NOME` | `PLANILHA_XLSX`).
   - Migration 0016 pra adicionar as colunas.

2. **Novas categorias em `arquivos_orfaos`:**
   - `PENDENCIA_CLIENTE`, `FICHA_GERAL`, `PREFIXO_DESCONHECIDO` (já existe)
   - Migration 0017 só alterando o CHECK constraint.

3. **Normalização de nome de pasta:**
   - Regex pra extrair prefixo de pastas tipo `1D-008 paralisado` → prefixo = `1D-008`, flag_paralisado = `true`.

4. **Leitura da planilha de mapeamento:**
   - Cache local (a planilha tem ~140k linhas aparentemente, vide IDs de 138.591 até 143.552+).
   - Revalidar a cada execução do indexer — é a fonte de verdade para Modelo B.

5. **UI:**
   - Na ficha do posto, separar arquivos por origem: "HD por prefixo" vs "Repositório histórico (CTHDOC)".
   - Link do caminho de rede deve apontar pro arquivo certo (já que tem 2 raízes).

## 7. Perguntas em aberto (registrar com o cliente em oportunidade futura)

1. A planilha `relacao_doc_arquivos_cthdoc.xlsx` tem alguma política de versionamento? (Sabe-se que é mantida pelo analista Diego Monteiro.)
2. Os arquivos "paralisados" devem aparecer na busca padrão ou filtrados por default?
3. As pastas `0 FICHAS DESCRITIVAS *` têm equivalente na planilha de mapeamento ou são apenas físicas?
4. O drive `Y:\` é mapeado consistentemente em todas as máquinas do setor, ou apenas na máquina do técnico que forneceu o manual?
