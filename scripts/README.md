# Scripts operacionais

Utilitários de linha de comando para banco de dados, carga de dados, manutenção,
diagnóstico, backup e geração de artefatos. Os scripts são independentes entre si
(cada um é executável por conta própria) e estão organizados por finalidade.

A maioria dos scripts Python pressupõe o ambiente virtual do indexador
(`ops/indexer/.venv`) e lê a `DATABASE_URL` do `.env.local`. Os comandos abaixo
devem ser executados a partir da raiz do projeto.

## `db/` — Banco de dados

Migração e provisionamento do esquema.

| Script | Finalidade |
|--------|-----------|
| `apply_migrations.py` | Aplica as migrations SQL em ordem na `DATABASE_URL`. Idempotente. Suporta `--only` e `--since`. Usado no fluxo de desenvolvimento local. |
| `db-migrate.sh` | Aplica as migrations contra uma connection string (genérico, via shell). |
| `setup_db.py` | Provisiona o banco do zero. |

## `seed/` — Carga inicial de dados

Popular o banco com dados de base, usuários e fontes externas.

| Script | Finalidade |
|--------|-----------|
| `seed_fichas_demo.py` | Carrega fichas de demonstração. |
| `seed_postos_caminhos.py` | Popula postos e caminhos de indexação. |
| `criar_usuario.py` | Cria usuário do sistema. |
| `promover_aprovador.py` | Concede perfil de aprovador a um usuário. |
| `importar_ibge_municipios.py` | Importa a base de municípios do IBGE. |
| `importar_inventario_ana.py` | Importa o inventário oficial de estações da ANA. |

## `manutencao/` — Correção e manutenção de dados de produção

Operações pontuais sobre dados existentes. Tratar como sensível: alteram dados reais.

| Script | Finalidade |
|--------|-----------|
| `aplicar_decisoes_seguras.py` | Aplica decisões de match/correção marcadas como seguras. |
| `aplicar_resposta_na_planilha_sharepoint.py` | Edita a planilha do inventário ANA (SharePoint) in-place. |
| `arrumar_coordenadas_divergentes.py` | Corrige coordenadas divergentes de postos. |
| `calcular_coord_sugerida_postos.py` | Calcula coordenada sugerida para postos. |
| `corrigir_prefixo_ana_zero_esquerda.py` | Normaliza prefixos ANA com zero à esquerda. |
| `detectar_match_e_duplicatas.py` | Detecta correspondências e duplicatas. |
| `limpar_fim_operacao_ativos.py` | Limpa data de fim de operação de postos ativos. |
| `promover_correcoes_ana_para_postos.py` | Promove correções da ANA para a tabela de postos. |
| `recalcular_divergencia_postos.py` | Recalcula divergência geográfica dos postos. |

## `diagnostico/` — Inspeção (somente leitura)

Diagnóstico de estado. Não alteram dados.

| Script | Finalidade |
|--------|-----------|
| `diag_acesso_ficha_cross_user.py` | Verifica acesso indevido a ficha entre usuários. |
| `diag_ana_status.py` | Estado da revisão do inventário ANA. |
| `diag_postos_ativos_com_fim.py` | Postos ativos com data de fim preenchida. |
| `diag_usuarios.py` | Estado dos usuários do sistema. |

## `backup/` — Backup do banco

| Script | Finalidade |
|--------|-----------|
| `backup_banco.py` | Dump lógico do banco. Saída em `data/backups/` (fora do versionamento). |
| `backup_banco.bat` | Wrapper para o Agendador de Tarefas do Windows executar o backup diário. |

## `build/` — Geração de artefatos do front-end

| Script | Finalidade |
|--------|-----------|
| `gerar-icones-placeholder.mjs` | Gera os ícones do PWA. Disparado por `npm run pwa:icons`. |
| `gerar-pdf-relatorio.mjs` | Gera o PDF de relatório. |
| `gerar_xlsx_final.ts` | Gera a planilha XLSX final. |

## Raiz

| Script | Finalidade |
|--------|-----------|
| `dev.sh` | Auxiliar de desenvolvimento. |
