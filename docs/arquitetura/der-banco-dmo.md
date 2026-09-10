# DER do banco da aplicação DMO

Diagrama entidade-relacionamento do PostgreSQL da aplicação, e o mapa de onde ele
encosta no `Dbfch`, o SQL Server da PRODESP.

**Extraído em 10/09/2026.** Produzido pedido do gestor do órgão, para o cruzamento
entre os dois modelos.

## Procedência

Este documento não foi escrito a partir de leitura de arquivo. As 68 migrations de
`supabase/migrations/` foram aplicadas num PostgreSQL 16 com PostGIS 3.4 limpo, pelo
mesmo `db/migrate.sh` que roda em produção, e o diagrama saiu do catálogo do banco
resultante: `pg_class`, `information_schema.columns` e
`information_schema.table_constraints`.

As contagens do `Dbfch` vêm de `docs/arquitetura/schema-dbfch-prodesp.md`, extração de
catálogo de 27/08/2026, somente leitura. Documento de ESTADO envelhece por construção:
cada número vale para a data da sua extração.

| Medida | Valor |
|---|---:|
| Tabelas da aplicação | 35 |
| Views da aplicação | 2 |
| Chaves estrangeiras | 40 |
| Migrations aplicadas | 68 |
| Tabelas no `Dbfch` | 157 |
| Tabelas do `Dbfch` replicadas aqui | 0 |

`spatial_ref_sys`, `geography_columns` e `geometry_columns` são do PostGIS e não entram
na contagem. O schema `auth` tem uma tabela, que é o shim de compatibilidade descrito no
ADR-0015.

## O que este banco é, e o que ele não é

Ele **não é cópia nem espelho do `Dbfch`**. Sobe vazio e guarda apenas o que o sistema
produz e não existe no banco do órgão.

O cadastro de posto e as séries históricas de medição **não moram aqui**: são lidos
diretamente do SQL Server do órgão a cada consulta, sem cópia, sem importação e sem banco
intermediário (ADR-0023). A conexão é somente leitura por construção, e recusa `INSERT`,
`UPDATE`, `DELETE`, `MERGE` e DDL antes de a consulta sair do sistema
(`src/infrastructure/db/mssql-client.ts`). A sessão se identifica em
`sys.dm_exec_sessions` do órgão como `spaguas-dmo (somente leitura)`.

## Sobreposição com o `Dbfch`

| Tabela no DMO | Equivalente no `Dbfch` | Veredito | Situação |
|---|---|---|---|
| `postos` | `Postos` (5.790 ativos) | **Sobrepõe** | Resolvida em favor do órgão. Desde o ADR-0023 o cadastro é lido ao vivo e a tabela local permanece vazia em produção. Continua no schema porque sete tabelas ainda a referenciam, e a remoção é irreversível. |
| `usuarios_papeis` | `UsuariosPermissoesIdentity` (1.007) | **Em aberto** | Único ponto de sobreposição ainda não decidido. O sistema está no ar sem exigência de login (ADR-0024), com a estrutura preservada e desligada por chave, esperando as APIs do órgão. A tabela local guarda papel e permissão de aprovação, nunca credencial. |
| `ibge_municipios_sp` | `MunicipioDistritos` (1.889) | Complementar | Os dois nomeiam município e só um tem geometria. A malha IBGE 2024 (645 municípios, SIRGAS 2000, SRID 4674) existe para responder se a coordenada declarada do posto cai no município declarado, que é o ADR-0013. O `Dbfch` não guarda polígono. |
| `estacoes_pluviometricas`, `leituras_pluviometricas` | Nenhum, origem é o SIBH | Origem externa | Paralelo deliberado. As séries do `Dbfch` continuam lidas ao vivo e nunca copiadas; estas tabelas existem para comparar as duas fontes, o que exige tê-las lado a lado. |
| `ana_revisao_*` | Nenhum | Origem externa | Inventário publicado pela ANA, carregado como snapshot para confronto. Nunca fonte de cadastro. |
| As demais 27 | Nenhum | Só do DMO | Varredura nas 157 tabelas do `Dbfch` por ficha, inspeção, visita, estoque, almoxarifado, patrimônio, arquivo, anexo, diagrama e favorito não devolveu correspondente nenhum. |

Os únicos acertos textuais daquela varredura foram falsos positivos: `TipoMaterialFiltros`
e `TipoMaterialTuboLisos` são tipo de material de poço e não estoque, e
`PluviografoTotalMaximo` casou a busca por "foto" dentro de "Pluviogra**fo**Total".

## Os módulos

## Cadastro de posto

SOBREPÕE o `Postos` do Dbfch, e a sobreposição já está resolvida em favor do órgão: em produção esta tabela nasce VAZIA, porque o cadastro vem do SQL Server por leitura ao vivo (ADR-0023). Ela permanece no schema porque sete tabelas nossas ainda a referenciam.

```mermaid
erDiagram
    postos ||--o{ posto_indexacao_cache : "prefixo"
    postos ||--o{ postos_caminhos : "prefixo"
    postos ||--o{ postos_evento : "posto_id"
    postos ||--o{ postos_favoritos : "prefixo"
    postos ||--o{ postos_fotos : "prefixo"
    postos {
        uuid id PK
        varchar prefixo
        text mantenedor
        varchar prefixo_ana
        text nome_estacao
        integer operacao_inicio_ano
        integer operacao_fim_ano
        numeric latitude
        numeric longitude
    }
    postos_evento {
        uuid id PK
        uuid posto_id FK
        text evento
        uuid ator_id
        jsonb valores_antes
        jsonb valores_depois
        text origem_evento
        uuid referencia_externa_id
        text observacao
    }
    postos_favoritos {
        uuid usuario_id PK
        varchar prefixo PK
    }
    postos_fotos {
        uuid id PK
        varchar prefixo FK
        text storage_path
        timestamptz tirada_em
        uuid tirada_por
    }
    postos_caminhos {
        varchar prefixo PK
        text caminho_unc
        varchar tipo_dado
        boolean ativo
        text observacao
        timestamptz verificado_em
    }
    posto_indexacao_cache {
        varchar prefixo PK
        timestamptz indexado_em
        timestamptz expira_em
        timestamptz mtime_hd
        integer arquivos_indexados
        integer arquivos_orfaos
        varchar status
        uuid ultimo_lote
    }
    ibge_municipios_sp {
        char codigo_ibge PK
        text nome
        char uf
        numeric area_km2
        geometry geom
    }
```

## Fichas de campo: inspeção, manutenção e medição

Sem equivalente no Dbfch. A ficha digitada em campo entra como triagem e só vira ficha oficial depois de aprovação humana, com trilha append-only e trava de um aprovador por vez. O payload de cada tipo fica em `dados` (JSONB).

```mermaid
erDiagram
    tipos_documento ||--o{ fichas_triagem : "cod_tipo_documento"
    fichas_triagem ||--o{ fichas_triagem : "ficha_origem_id (auto)"
    fichas_visita ||--o{ fichas_triagem : "ficha_visita_id"
    tipos_documento ||--o{ fichas_visita : "cod_tipo_documento"
    fichas_visita ||--o{ fichas_visita : "substitui_ficha_id (auto)"
    fichas_triagem ||--o{ triagem_eventos : "triagem_id"
    fichas_triagem ||--o{ triagem_locks : "triagem_id"
    fichas_triagem {
        uuid id PK
        varchar prefixo FK
        smallint cod_tipo_documento FK
        uuid ficha_visita_id FK
        uuid ficha_origem_id FK
        date data_visita
        time_without_time_zone hora_inicio
        time_without_time_zone hora_fim
        uuid tecnico_id
    }
    fichas_visita {
        uuid id PK
        varchar prefixo FK
        smallint cod_tipo_documento FK
        uuid substitui_ficha_id FK
        date data_visita
        time_without_time_zone hora_inicio
        time_without_time_zone hora_fim
        text tecnico_nome
        uuid tecnico_id
    }
    triagem_eventos {
        uuid id PK
        uuid triagem_id FK
        varchar evento
        varchar estado_anterior
        varchar estado_novo
        uuid ator_id
        text motivo
        jsonb payload
        inet ip
    }
    triagem_locks {
        uuid id PK
        uuid triagem_id FK
        uuid revisor_id
        timestamptz expira_em
    }
    tipos_documento {
        smallint codigo PK
        text rotulo
    }
    tipos_dado {
        varchar codigo PK
        text rotulo
        text regex_prefixo
        boolean usa_prefixo_ana
    }
    acesso_ficha {
        uuid id PK
        text usuario_id
        varchar prefixo
        varchar acao
        text ip
        text user_agent
        timestamptz ocorreu_em
    }
```

## Repositório de arquivos digitalizados

Sem equivalente no Dbfch. Indexação do HD de rede do órgão: o arquivo continua onde está, e aqui ficam caminho, metadado e hash. Arquivo que não casa com posto nenhum vira órfão registrado com o motivo.

```mermaid
erDiagram
    arquivos_indexados {
        uuid id PK
        varchar tipo_dado FK
        smallint cod_tipo_documento FK
        varchar prefixo
        text nome_arquivo
        text caminho_absoluto
        bigint tamanho_bytes
        timestamptz data_modificacao
        varchar hash_conteudo
    }
    arquivos_orfaos {
        uuid id PK
        varchar tipo_dado FK
        text nome_arquivo
        text caminho_absoluto
        bigint tamanho_bytes
        timestamptz data_modificacao
        timestamptz indexado_em
        uuid lote_indexacao
        text motivo
    }
    indexacao_log {
        uuid id PK
        uuid lote_indexacao
        text raiz_varredura
        timestamptz iniciado_em
        timestamptz finalizado_em
        integer arquivos_encontrados
        integer arquivos_indexados_qtd
        integer arquivos_orfaos_qtd
        integer arquivos_removidos_qtd
    }
    import_log {
        uuid id PK
        text arquivo_origem
        varchar hash_arquivo
        timestamptz iniciado_em
        timestamptz finalizado_em
        integer linhas_lidas
        integer linhas_inseridas
        integer linhas_atualizadas
        integer linhas_rejeitadas
    }
```

## Inventário ANA e desconformidades

Origem externa (ANA). Confronto entre o inventário publicado e a rede do órgão. Uma planilha de dúvidas é um lote, com prazo de resposta; toda decisão vira evento imutável. Snapshot, nunca fonte de cadastro.

```mermaid
erDiagram
    ana_revisao_lote ||--o{ ana_revisao_estacao : "lote_id"
    ana_revisao_estacao ||--o{ ana_revisao_evento : "estacao_id"
    ana_revisao_lote {
        uuid id PK
        text nome
        text arquivo_origem
        char hash_sha256
        integer total_estacoes
        integer total_pendencias
        date prazo_resposta
        uuid criado_por
        text observacao
    }
    ana_revisao_estacao {
        uuid id PK
        uuid lote_id FK
        uuid posto_id FK
        char municipio_sugerido_codigo FK
        uuid match_sugerido_posto_id FK
        text codigo_ana
        text codigo_adicional
        text nome
        numeric latitude
    }
    ana_revisao_evento {
        uuid id PK
        uuid estacao_id FK
        text evento
        uuid ator_id
        jsonb valores_antes
        jsonb valores_depois
        text observacao
        inet ip
        text user_agent
    }
    revisoes_desconformidade {
        uuid id PK
        varchar tipo_entidade
        text id_entidade
        varchar categoria
        varchar status
        text nota
        text ip
        timestamptz revisado_em
        text usuario_id
    }
```

## Monitor pluviométrico

Origem externa (API do SIBH), que é outro sistema e não o Dbfch. Paralelo deliberado: as séries do Dbfch continuam lidas ao vivo e nunca copiadas, e estas tabelas existem para COMPARAR as duas fontes, o que exige tê-las lado a lado.

```mermaid
erDiagram
    estacoes_pluviometricas ||--o{ leituras_pluviometricas : "estacao_id"
    estacoes_pluviometricas {
        uuid id PK
        text prefixo
        text nome
        float8 lat
        float8 lng
        text tipo
        text bacia
        text sibh_id
        text owner
    }
    leituras_pluviometricas {
        bigint id PK
        uuid estacao_id FK
        timestamptz momento
        float8 manual_mm
        float8 automatico_mm
    }
```

## Estoque: almoxarifado e patrimônio

Sem equivalente no Dbfch. Item serializado e material quantificável no mesmo modelo. A movimentação é um ledger append-only: correção não apaga linha, gera ajuste com motivo. Saldo mantido e reconciliável pela soma do ledger.

```mermaid
erDiagram
    estoque_conferencias ||--o{ estoque_conferencia_itens : "conferencia_id"
    estoque_locais ||--o{ estoque_conferencia_itens : "local_encontrado_id"
    estoque_locais ||--o{ estoque_conferencia_itens : "local_esperado_id"
    estoque_materiais ||--o{ estoque_conferencia_itens : "material_id"
    estoque_movimentacoes ||--o{ estoque_conferencia_itens : "movimentacao_id"
    estoque_unidades ||--o{ estoque_conferencia_itens : "unidade_id"
    estoque_locais ||--o{ estoque_conferencias : "local_id"
    estoque_categorias ||--o{ estoque_materiais : "categoria_id"
    estoque_conferencias ||--o{ estoque_movimentacoes : "conferencia_id"
    estoque_locais ||--o{ estoque_movimentacoes : "local_destino"
    estoque_locais ||--o{ estoque_movimentacoes : "local_origem"
    estoque_materiais ||--o{ estoque_movimentacoes : "material_id"
    estoque_unidades ||--o{ estoque_movimentacoes : "unidade_id"
    estoque_locais ||--o{ estoque_saldos : "local_id"
    estoque_materiais ||--o{ estoque_saldos : "material_id"
    estoque_locais ||--o{ estoque_unidades : "local_id"
    estoque_materiais ||--o{ estoque_unidades : "material_id"
    estoque_locais {
        uuid id PK
        text unidade
        text sala
        text prateleira
        text armario
        text rotulo
        text observacao
    }
    estoque_categorias {
        uuid id PK
        text nome
    }
    estoque_materiais {
        uuid id PK
        uuid categoria_id FK
        text descricao
        text marca
        text modelo
        text natureza
        text unidade_medida
        boolean ativo
        integer quantidade_minima
    }
    estoque_unidades {
        uuid id PK
        uuid material_id FK
        uuid local_id FK
        text codigo
        text codigo_spaguas
        text pat_daee
        text outros_pat
        text numero_serie
        text helice
    }
    estoque_saldos {
        uuid id PK
        uuid material_id FK
        uuid local_id FK
        integer quantidade
        text tamanho
    }
    estoque_movimentacoes {
        uuid id PK
        uuid unidade_id FK
        uuid material_id FK
        uuid local_origem FK
        uuid local_destino FK
        uuid conferencia_id FK
        text tipo
        integer quantidade
        text estado_anterior
    }
    estoque_conferencias {
        uuid id PK
        uuid local_id FK
        text unidade
        text natureza
        text status
        text observacao
        uuid criada_por
        timestamptz criada_em
        uuid concluida_por
    }
    estoque_conferencia_itens {
        uuid id PK
        uuid conferencia_id FK
        uuid unidade_id FK
        uuid material_id FK
        uuid local_esperado_id FK
        uuid local_encontrado_id FK
        uuid movimentacao_id FK
        text tamanho
        text origem
    }
```

## Apoio e governança

Perfis de acesso, sinal de vida das rotinas automáticas e diagramas unifilares. `usuarios_papeis` é o ponto que muda quando a identidade do órgão entrar (ADR-0024).

```mermaid
erDiagram
    usuarios_papeis {
        uuid usuario_id PK
        boolean aprovador
        text observacao
        text papel
    }
    cron_heartbeats {
        uuid id PK
        varchar job
        timestamptz ocorreu_em
        integer duracao_ms
        jsonb payload
    }
    diagramas {
        uuid id PK
        text nome
        text bacia
        text descricao
        jsonb elementos
        uuid criado_por
    }
```
