# Especificação Funcional — Sistema de Ficha Técnica de Postos Hidrológicos SPÁguas

| Campo | Valor |
|-------|-------|
| Cliente | SPÁguas — Governo do Estado de São Paulo |
| Responsável pela especificação | Camila — PO Produto (Damasceno Dev OS) |
| Versão | 1.2 — MVP (Fase 1) |
| Data | 2026-04-22 |
| Status | Rascunho — atualizado com documentação oficial do cliente (22/04/2026) |
| Tom do documento | Formal — padrão governo |

---

## 1. Visão Geral

O Sistema de Ficha Técnica de Postos Hidrológicos consiste em dashboard web de consulta que consolida, em ponto único, os dados cadastrais e o histórico documental da rede de postos hidrológicos (pluviométricos, fluviométricos, piezométricos) mantida pelo programa SPÁguas.

Atualmente, as informações encontram-se fragmentadas em planilha mestra (2.484 postos, 37 colunas) e em repositório de arquivos PDF armazenado em HD de rede do Governo do Estado, organizado por prefixo de posto. A consulta a essas informações depende de conhecimento tácito da equipe e de buscas manuais no explorador de arquivos, sem rastreabilidade nem auditoria de acesso.

O sistema substitui essa operação manual por interface única de consulta, preservando o repositório físico de arquivos e o prefixo do posto como identificador canônico da rede.

### 1.1 Problema a ser resolvido

1. Dispersão da informação entre planilha cadastral e arquivos físicos em rede.
2. Ausência de busca unificada por atributos do posto (município, bacia, UGRHI, tipo).
3. Inexistência de trilha de auditoria sobre quem acessa a ficha de qual posto — requisito LGPD para órgão público.
4. Dificuldade de localizar o histórico documental de determinado prefixo sem conhecimento prévio do caminho no HD de rede.

### 1.2 Usuários

| Perfil | Descrição | Volume estimado |
|--------|-----------|-----------------|
| Técnico SPÁguas | Técnico do programa que consulta ficha de posto para atividade operacional ou elaboração de relatório | Pequeno (setor reduzido) |
| Gestor SPÁguas | Responsável por visão consolidada da rede | Muito pequeno |

**Autenticação está fora do MVP** (decisão do Rafael em 22/04/2026). Consequências:

- Todo o fluxo de uso do MVP ocorre sem identificação individual do usuário.
- A trilha LGPD (`acesso_ficha`) permanece obrigatória (é exigência legal para órgão público), porém registra `timestamp`, `ip`, `user_agent` e `prefixo_consultado`. A coluna `usuario_id` fica nullable até a Fase 2, quando a autenticação for introduzida.
- **Pré-condição de deploy:** o sistema deve rodar **exclusivamente em rede interna** do setor durante o MVP, nunca exposto à internet pública. Essa pré-condição é responsabilidade conjunta do Rodrigo (DevOps) e da Marina (Documentação) e deve constar como requisito explícito no runbook de deploy (ADR-0002, quando for criado).

---

## 2. Escopo

### 2.1 Dentro do MVP (Fase 1)

1. Importação única da planilha mestra para a base de dados.
2. Dashboard de busca por prefixo e por texto livre sobre campos-chave.
3. Tela de detalhe da ficha técnica do posto, apresentando os dados cadastrais.
4. Listagem de arquivos PDF associados ao prefixo, com nome, caminho de rede, tamanho e data de modificação.
5. Execução de *worker* de indexação do HD de rede, populando tabela de arquivos indexados relacionada aos postos por prefixo.
6. Auditoria de acesso (trilha LGPD): registro de qual usuário visualizou a ficha de qual posto e quando.
7. Conformidade WCAG 2.1 AA / e-MAG na interface.

### 2.2 Fora do MVP (Fase 2 — arquitetar para comportar)

1. Cadastro e edição de postos pela interface.
2. Geração de ficha técnica consolidada persistida em banco.
3. Geração de ficha de inspeção de campo.
4. Upload de novos arquivos PDF pelo sistema.
5. Relatórios agregados por UGRHI, bacia ou município.
6. Visualização geoespacial (mapa) dos postos.
7. Integração automática com sistemas telemétricos (SAISP, *loggers*).

### 2.3 Explicitamente fora de escopo

1. Abertura, leitura ou *preview* dos PDFs pelo dashboard — o sistema apenas lista nome e caminho; a abertura ocorre no explorador de arquivos do sistema operacional do usuário.
2. Modificação do repositório físico de arquivos pelo sistema.
3. Alteração da planilha mestra original.

---

## 3. Modelo de Domínio

### 3.1 Entidades

#### 3.1.1 Posto Hidrológico

Estação de monitoramento que compõe a rede SPÁguas. Unidade básica do domínio.

**Atributos cadastrais (derivados da planilha mestra, 37 colunas):**

| Campo lógico | Coluna origem no CSV | Tipo | Obrigatório | Observação |
|--------------|---------------------|------|-------------|------------|
| Prefixo | PREFIXO | Texto | Sim | Identificador canônico, único |
| Mantenedor | MANTENEDOR | Texto | Não | Frequentemente nulo |
| Prefixo ANA | PREFIXO AN | Texto | Não | Identificador na Agência Nacional de Águas |
| Nome da estação | NOME DA ES | Texto | Não | |
| Operação — início | DE | Inteiro (ano) | Não | Ano de entrada em operação |
| Operação — fim | ATE | Inteiro (ano) | Não | Ano de desativação, se aplicável |
| Latitude | LATITUDE | Decimal | Não | |
| Longitude | LONGITUDE | Decimal | Não | |
| Município | MUNICIPIO | Texto | Não | |
| Município (alternativo) | MUNICIPI_1 | Texto | Não | Variante/correção de grafia |
| Bacia hidrográfica | BACIA HIDR | Texto | Não | |
| Nome UGRHI | Nome UGHRI | Texto | Não | Unidade de Gerenciamento de Recursos Hídricos |
| Número UGRHI | N_UGRHI | Texto | Não | |
| Nome sub-UGRHI | Nome SUBUG | Texto | Não | |
| Número sub-UGRHI | N_SUBUGRHI | Texto | Não | |
| Rede | REDE | Texto | Não | |
| Proprietário | PROPRIETAR | Texto | Não | |
| Tipo de posto | TIPO DE PO | Texto | Não | PLU, FLU, PIEZO, CIAS, BAT etc. |
| Área (km²) | AREA (Km2) | Decimal | Não | Área de drenagem |
| BTL | BTL | Texto | Não | |
| Companhia ambiental | cia_amb | Texto | Não | |
| CoBacia | COBACIA | Texto | Não | Código oficial de bacia |
| Observações | OBS | Texto longo | Não | |
| Tempo de transmissão | TEMPO DE T | Texto | Não | |
| Status PCD | STATUS PCD | Texto | Não | Ativo/Inativo/etc. |
| Última transmissão | ULTIMA TRA | Data | Não | |
| Convencional | CONVENCION | Booleano/Texto | Não | |
| *Logger* | LOGGER | Booleano/Texto | Não | |
| Telemétrico | TELEMETRIC | Booleano/Texto | Não | |
| Nível | NIVEL | Booleano/Texto | Não | Mede nível |
| Vazão | VAZAO | Booleano/Texto | Não | Mede vazão |
| Ficha de inspeção | FICHA DE INSPECAO | Texto | Não | Indicador |
| Última data de FI | ULTIMA DATA FI | Data | Não | |
| Ficha descritiva | FICHA DESCRITIVA | Texto | Não | |
| Última atualização FD | ULTIMA_ATUALIZACAO_FD | Data | Não | |
| Aquífero | AQUIFERO | Texto | Não | |
| Altimetria | ALTIMETRIA | Decimal | Não | |

#### 3.1.2 Arquivo Indexado

Documento PDF localizado no HD de rede, vinculado a um posto por meio do prefixo que consta no nome do arquivo. A partir da documentação oficial fornecida pelo cliente (22/04/2026), o arquivo também carrega o **tipo de documento** (enum de 7 valores), o **código do encarregado** e a **data do documento**, extraídos por *parsing* do nome.

**Atributos:**

| Campo | Tipo | Obrigatório | Observação |
|-------|------|-------------|------------|
| Prefixo do posto | Texto | Sim | Chave de relação com Posto |
| Nome do arquivo | Texto | Sim | |
| Caminho absoluto | Texto | Sim | Caminho UNC da rede do governo |
| Tamanho em bytes | Inteiro | Sim | |
| Data de modificação | *Timestamp* | Sim | Do sistema de arquivos |
| *Hash* de conteúdo | Texto | Não | Opcional para deduplicação futura |
| Indexado em | *Timestamp* | Sim | Momento em que o *worker* registrou |
| Tipo de dado | Enum | Sim | Pasta raiz que determinou a classificação (ver 3.1.4) |
| Código do tipo de documento | Enum (01–07) | Não | Preenchido quando o nome foi parseado com sucesso (ver 3.1.5) |
| Código do encarregado | Texto (2 dígitos) | Não | Preenchido quando o nome foi parseado |
| Data do documento | Data | Não | Extraída do nome do arquivo |
| Parte opcional | Texto | Não | Segmento opcional do nome antes da data |
| Nome válido | Booleano | Sim | `true` se o nome aderiu ao padrão oficial; default `true` |

Observação: arquivo pode existir sem posto correspondente na base (prefixo órfão) — situação deve ser listada para curadoria manual, sem bloquear indexação. Arquivos cujo nome **não** aderiu ao padrão oficial também são registrados como órfãos, em categoria distinta (ver RN-08).

#### 3.1.4 Tipo de Dado (enum)

Cinco categorias oficiais de pasta raiz no HD de rede do cliente. Cada uma determina qual regex de prefixo se aplica aos arquivos contidos.

| Código | Rótulo | Regex do prefixo | Tamanho | Exemplo |
|--------|--------|------------------|---------|---------|
| `Fluviometria` | Fluviometria | `^[0-9][A-Z]-[0-9]{3}$` | 6 | `1D-008` |
| `FluviometriaANA` | Fluviometria — ANA | `^[0-9]{8}$` | 8 | `58183000` |
| `FluviometriaQualiAgua` | Fluviometria — QualiÁgua | `^[0-9][A-Z]-[0-9]{3}$` | 6 | `2D-006` |
| `Piezometria` | Piezometria | `^[0-9][A-Z]-[0-9]{3}[A-Z]$` | 7 | `2E-500Z` |
| `Pluviometria` | Pluviometria | `^[A-Z][0-9]-[0-9]{3}$` | 6 | `A6-001` |
| `QualiAgua` | QualiÁgua | `^[A-Z]{4}[0-9]{4,5}$` | 8–9 | `PARB0010` |

**Observações:**

1. Para `FluviometriaANA`, a coluna de *match* no `postos` é `prefixo_ana` (não `prefixo`). Os 435 casos com 7 dígitos na planilha oficial (em vez de 8) são aceitos mediante *padding* de zero à esquerda (`LPAD(prefixo_ana, 8, '0')`).
2. Os 5 valores são seed imutável da tabela `tipos_dado` e referenciados por FK em `arquivos_indexados.tipo_dado`.

#### 3.1.5 Tipo de Documento (enum)

Sete categorias oficiais, extraídas do segundo segmento do nome do arquivo (`CodDoc`).

| Código | Rótulo |
|--------|--------|
| `01` | Ficha Descritiva |
| `02` | PCD |
| `03` | Inspeção |
| `04` | Nivelamento |
| `05` | Levantamento de Seção |
| `06` | Troca de Observador |
| `07` | Vazão |

Seed imutável da tabela `tipos_documento`, referenciada por FK em `arquivos_indexados.cod_tipo_documento`.

#### 3.1.6 Revisão de Desconformidade

Registro operacional de curadoria sobre entidades (posto ou arquivo) identificadas como desconformes — seja pelo prefixo principal, pelo prefixo ANA ou pelo nome do arquivo. Serve ao fluxo da US-009.

**Atributos:**

| Campo | Tipo | Obrigatório | Observação |
|-------|------|-------------|------------|
| Tipo da entidade | Enum (`posto` \| `arquivo`) | Sim | |
| Identificador da entidade | Texto | Sim | Prefixo do posto ou caminho do arquivo |
| Status | Enum (`pendente` \| `revisado`) | Sim | Default `pendente` |
| Nota | Texto | Não | Observação livre do técnico |
| IP | Texto | Não | Registrado em lugar de `usuario_id` no MVP (auth = Fase 2) |
| Revisado em | *Timestamp* | Não | Preenchido quando transição para `revisado` |
| Criado em | *Timestamp* | Sim | Default `NOW()` |

Esta tabela admite `UPDATE` em `status`, `nota` e `revisado_em` durante o MVP (ausência de auth torna *append-only* inviável sem comprometer o fluxo). Fase 2 recebe *trigger* que exige `usuario_id` na criação e bloqueia edição do histórico.

#### 3.1.3 Acesso a Ficha (trilha de auditoria LGPD)

Registro imutável de visualização de ficha de posto por usuário autenticado.

**Atributos:**

| Campo | Tipo | Obrigatório |
|-------|------|-------------|
| Identificador do usuário | Texto | Sim |
| Prefixo consultado | Texto | Sim |
| *Timestamp* do acesso | *Timestamp* | Sim |
| Origem (IP ou sessão) | Texto | Sim |
| Ação | Enum (`visualizou_ficha`, `listou_arquivos`) | Sim |

### 3.2 Relacionamentos

- **Posto (1) — (0..N) Arquivo Indexado**, relação por prefixo. Um posto pode ter zero ou muitos arquivos; um arquivo pertence a um único prefixo.
- **Posto (1) — (0..N) Acesso a Ficha**, relação por prefixo. Nunca se deleta acesso.

### 3.3 Invariantes

1. **INV-01 —** O prefixo do posto é SEMPRE único na base. Não existe posto sem prefixo.
   **Nota de realidade dos dados:** a planilha oficial contém **2.484 linhas com 2.483 prefixos únicos** — há 1 (um) prefixo duplicado na fonte. A importação é **obrigada** a detectar essa colisão, registrar em `import_log` e abortar a carga com erro descritivo (nunca silenciar com `ON CONFLICT DO NOTHING`, sob pena de perda de dado). A resolução do caso duplicado é tratada como curadoria manual antes de nova execução da importação.
2. **INV-02 —** Qualquer campo cadastral (exceto prefixo) pode ser nulo — a planilha original tolera ausências e o sistema não pode rejeitar por isso.
3. **INV-03 —** Busca textual SEMPRE deve ser *case-insensitive* e insensível a acentuação.
4. **INV-04 —** Registro de acesso a ficha, uma vez gravado, NUNCA é alterado ou removido (*append-only*).
5. **INV-05 —** A tabela de arquivos indexados é totalmente reconstrutível pelo *worker*; não contém dado de verdade absoluta do sistema.
6. **INV-06 —** Ano de início de operação, quando preenchido, SEMPRE é menor ou igual ao ano de fim.
7. **INV-07 —** O sistema NUNCA grava PDFs ou modifica o repositório físico de arquivos.

### 3.4 Glossário

| Termo | Definição |
|-------|-----------|
| Prefixo | Código canônico do posto (ex.: `1D-008`, `2D-006`). Identificador único na rede SPÁguas. |
| UGRHI | Unidade de Gerenciamento de Recursos Hídricos — unidade territorial de gestão de bacias no Estado de São Paulo. |
| Sub-UGRHI | Subdivisão de UGRHI. |
| PLU | Posto pluviométrico (mede chuva). |
| FLU | Posto fluviométrico (mede vazão/nível de rio). |
| PIEZO | Posto piezométrico (mede nível de aquífero). |
| PCD | Plataforma de Coleta de Dados — equipamento telemétrico. |
| CoBacia | Código oficial de bacia hidrográfica. |
| Ficha técnica | Conjunto consolidado de dados cadastrais do posto. |
| Ficha de inspeção | Documento de campo gerado em visita técnica (fase 2). |
| Ficha descritiva | Documento descritivo do posto (fase 2). |

---

## 4. Regras de Negócio

### 4.1 Importação da planilha mestra

- **RN-01 —** A importação ocorre uma única vez no MVP, por execução controlada de script no servidor, com credencial de serviço.
- **RN-02 —** A importação é idempotente: reexecução sobre prefixo existente atualiza os campos cadastrais; não duplica registros.
- **RN-03 —** Campos vazios na planilha são persistidos como nulos na base — nunca como *string* vazia.
- **RN-04 —** Linhas sem prefixo são rejeitadas, registradas em *log* de importação e reportadas ao operador.
- **RN-05 —** *Encoding* e caracteres especiais da planilha (acentuação) devem ser preservados integralmente.
- **RN-05.1 — Detecção de prefixos duplicados na fonte:** antes de qualquer gravação, o script faz uma **varredura prévia** do CSV agrupando por `PREFIXO`. Se existirem prefixos duplicados na planilha de origem:
  1. O script **aborta** a execução sem gravar nenhum posto.
  2. Registra ocorrência em `import_log` com `status = 'erro'` e amostra em `erros_amostra` (prefixo, número das linhas conflitantes, diferenças encontradas).
  3. Retorna ao operador a lista completa de duplicidades para curadoria manual.
  4. Nunca aplica `ON CONFLICT DO NOTHING` em colisão proveniente da **mesma carga** — isso ocultaria dado; `ON CONFLICT DO UPDATE` só é aplicado em reexecuções legítimas sobre base já populada (ver RN-02).

### 4.2 Indexação de arquivos

> **Atualização 22/04/2026 (documentação oficial do cliente):** o cliente forneceu a especificação oficial do padrão de pastas e de nomes de arquivo. O *worker* deixa de depender de `startswith` contra a lista de prefixos cadastrados (estratégia da v1.1) e passa a usar o padrão oficial, com regex específica por tipo de dado. A estratégia por *lookup* permanece apenas como **validação adicional** (confirmar que o prefixo parseado existe em `postos`).

- **RN-06 — Padrão oficial do caminho e do nome de arquivo.** Todo arquivo PDF do HD de rede segue o padrão:
  1. **Caminho:** `{Unidade}\{TipoDado}\{Prefixo}\{Arquivo}`, onde `TipoDado` é uma das 5 pastas raiz oficiais (ver 3.1.4).
  2. **Nome do arquivo:** `{Prefixo} {CodDoc} {CodEnc} [Opcional] {AAAA MM DD}.pdf`.
  3. **Regex oficial do nome (obrigatória no *worker*):**
     ```
     ^(?P<prefixo>[^ ]+)\s+(?P<cod_doc>\d{2})\s+(?P<cod_enc>\d{2})(?:\s+(?P<opcional>.+?))?\s+(?P<data>\d{4}\s+\d{2}\s+\d{2})\.pdf$
     ```
  4. **Regex por tipo de dado (aplicada ao `prefixo` capturado):** ver tabela em 3.1.4. Cada pasta raiz determina qual regex se aplica.
- **RN-06.1 — Mapeamento do prefixo → posto.** Após o *parsing*, o *worker* verifica a existência do prefixo em `postos`:
  1. Para `FluviometriaANA`, a coluna de *match* é `postos.prefixo_ana`, normalizada por `LPAD(x, 8, '0')` (aceita os 435 casos com 7 dígitos).
  2. Para os demais tipos de dado, a coluna é `postos.prefixo`, comparação exata.
- **RN-07 —** A indexação é reconstrutiva: cada execução substitui os registros daquela raiz de varredura nas tabelas `arquivos_indexados` e `arquivos_orfaos`, evitando registros obsoletos.
- **RN-08 — Classificação em três *buckets* na indexação.**
  1. **Nome parseado com sucesso + prefixo encontrado em `postos`:** registro em `arquivos_indexados` com todos os campos derivados (`tipo_dado`, `cod_tipo_documento`, `cod_encarregado`, `data_documento`, `parte_opcional`, `nome_valido = true`).
  2. **Nome parseado com sucesso + prefixo NÃO encontrado em `postos`:** registro em `arquivos_orfaos` com `categoria = 'PREFIXO_DESCONHECIDO'` e `tipo_dado` populado.
  3. **Nome NÃO aderiu à regex oficial:** registro em `arquivos_orfaos` com `categoria = 'NOME_FORA_DO_PADRAO'` e `tipo_dado` populado quando detectável pela pasta raiz.
  Categoria adicional `EXTENSAO_NAO_PDF` é reservada para casos futuros; no MVP, extensões diferentes de `.pdf` são ignoradas.
- **RN-09 —** O *worker* nunca modifica, move ou remove arquivos do HD de rede.
- **RN-10 —** A indexação pode ser executada de modo incremental (por diretório) ou total.
- **RN-10.1 — Realidade da cobertura atual.** A observação oficial do cliente (22/04/2026) informa que os documentos recuperados representam **apenas 7,88% do total**. O alto volume de arquivos fora do padrão justifica, por si, o módulo de desconformidade (US-009). A política oficial é: **o sistema detecta e sugere, não corrige em lote**. A correção do dado-fonte cabe ao técnico SPÁguas com responsabilidade individual, auditada quando a Fase 2 introduzir autenticação.

### 4.2.2 Classificação de conformidade cadastral (prefixos e prefixo ANA)

Análise cruzada do CSV oficial (22/04/2026) contra as regex de 3.1.4:

**Prefixo principal (`postos.prefixo`) — 2484 linhas:**

| Classe | Quantidade | Regex aplicada |
|--------|-----------:|----------------|
| Conformes `Pluviometria` | 1851 | `^[A-Z][0-9]-[0-9]{3}$` |
| Conformes `Fluviometria`/`QualiAgua` (FLU) | 473 | `^[0-9][A-Z]-[0-9]{3}$` |
| Conformes `Piezometria` | 106 | `^[0-9][A-Z]-[0-9]{3}[A-Z]$` |
| **Desconformes — suspeita de dígito/letra trocados** | 27 | `^[A-Z][0-9]-[0-9]{3}[A-Z]$` (ex.: `B6-007A`) |
| **Desconformes — placeholder `FLU001?`** | 26 | `^[A-Z]{3}[0-9]{3}\?$` |
| **Desconformes — outlier** | 1 | `J3` |
| **Total desconforme** | **54 (2,2%)** | |

**Prefixo ANA (`postos.prefixo_ana`) — 512 linhas preenchidas:**

| Classe | Quantidade | Observação |
|--------|-----------:|------------|
| Conformes (8 dígitos) | 76 | `^[0-9]{8}$` |
| **Desconformes (7 dígitos — zero à esquerda faltante)** | 435 | Aceitos via `LPAD(x, 8, '0')` |
| **Desconformes (outros)** | 1 | Outlier de 1 dígito |
| **Total desconforme** | **436** | |

### 4.2.3 Política de não-edição em lote no MVP

- **RN-10.2 —** O sistema **nunca** altera dado cadastral de posto em lote com base em sugestão automática. Motivo: regra de governo + LGPD — alteração de dado cadastral exige *audit trail* com responsável humano autenticado, e autenticação entra apenas na Fase 2.
- **RN-10.3 —** O módulo de desconformidade **sugere** a correção e permite que o técnico marque o caso como `revisado` (gera registro em `revisoes_desconformidade` com IP e *timestamp* em lugar de `usuario_id` no MVP). A correção efetiva do dado ocorre manualmente na planilha-fonte, fora do escopo do sistema.
- **RN-10.4 —** O importador do CSV, quando executado, **repopula** a base a partir da planilha já corrigida; não há rota de escrita direta em `postos` pela aplicação no MVP.

#### 4.2.1 Formatos de prefixo observados na fonte (histórico)

> Esta seção, originada na v1.1, continua documental para rastreabilidade. A estratégia operacional agora é definida pela documentação oficial do cliente (RN-06 e 3.1.4); os formatos abaixo permanecem listados para justificar a classificação de desconformidade em 4.2.2.

Distribuição encontrada nos 2.484 prefixos da planilha oficial (18/03/2026):

| Formato | Exemplos | Ocorrências | Classificação oficial |
|---------|----------|-------------|----------------------|
| `XN-NNN` (letra-dígito + hífen + 3 dígitos) | `A6-001`, `B4-001` | 1851 | Conforme `Pluviometria` |
| `NX-NNN` (dígito-letra + hífen + 3 dígitos) | `1D-008` | 473 | Conforme `Fluviometria`/`QualiAgua` |
| `NX-NNNX` (dígito-letra + hífen + 3 dígitos + letra) | `2E-500Z` | 106 | Conforme `Piezometria` |
| `XN-NNNX` (letra-dígito + hífen + 3 dígitos + letra) | `B6-007A` | 27 | **Desconforme** (suspeita de dígito/letra trocados) |
| `XXXNNN?` (três letras + três dígitos + `?` literal) | `FLU001?` | 26 | **Desconforme** — placeholder, ver 9.9 (resposta parcial) |
| `XN` (dois caracteres, sem hífen) | `J3` | 1 | **Desconforme** — outlier |

### 4.3 Busca

- **RN-11 —** Busca por prefixo aceita correspondência exata ou prefixo parcial (ex.: `1D` retorna todos que começam com `1D`).
- **RN-12 —** Busca textual atua sobre, no mínimo: nome da estação, município, bacia hidrográfica, nome UGRHI, nome sub-UGRHI, proprietário, mantenedor.
- **RN-13 —** Busca textual é *case-insensitive* e insensível a acentuação (`Guaratinguetá` = `guaratingueta`).
- **RN-14 —** Resultados são paginados (padrão: 25 por página) e ordenáveis por prefixo e nome da estação.
- **RN-15 —** Tempo de resposta aceitável: até 2 segundos para 95% das buscas sobre a base de 2.484 registros — a arquitetura pode relaxar esse teto mediante justificativa técnica, conforme decisão do Rafael em kickoff.

### 4.4 Visualização da ficha

- **RN-16 —** Todo acesso à ficha de um posto gera registro em `acesso_ficha` antes da apresentação dos dados.
- **RN-17 —** Campos nulos devem ser apresentados como “não informado” — nunca em branco, nunca como `null`.
- **RN-18 —** A listagem de arquivos do posto é ordenada por data de modificação descendente.
- **RN-19 —** O caminho do arquivo é exibido em formato copiável; o sistema não abre o arquivo.
- **RN-20 —** Caso o *worker* nunca tenha indexado o prefixo, a seção de arquivos apresenta estado “índice ainda não executado para este prefixo”.

### 4.5 Auditoria e conformidade

- **RN-21 —** Todo acesso à ficha é registrado com identificador do usuário, *timestamp* e prefixo — exigência LGPD para órgão público.
- **RN-22 —** A trilha de auditoria é somente-leitura pela aplicação; alterações ocorrem apenas em nível de DBA com registro.
- **RN-23 —** A interface atende WCAG 2.1 AA: contraste, navegação por teclado, semântica adequada, leitor de tela.
- **RN-24 —** Rótulos, mensagens e conteúdo textual são exibidos em português (pt-BR) formal.

---

## 5. Histórias de Usuário e Critérios de Aceitação

Formato: Como/Quero/Para, com critérios GWT (Dado/Quando/Então).

### US-001 — Importação da planilha mestra (executada pelo operador)

> **Como** operador técnico do Damasceno Dev
> **Quero** carregar a planilha de 2.484 postos na base inicial
> **Para que** os técnicos possam consultar os dados pelo dashboard.

Tamanho: M — PO responsável: Lucas

**Critérios:**
- GWT-001.1 — **DADO** o CSV oficial `Postos_PLU_FLU_PIEZO_CIAS_BAT_MUNIC_UGRHI_SUB_OTTO-18-03-26a-csv.csv`, **QUANDO** o script de importação é executado com credencial de serviço, **ENTÃO** os 2.484 postos são gravados na base, acentuação preservada, campos vazios persistidos como nulos.
- GWT-001.2 — **DADO** uma reexecução sobre base já populada, **QUANDO** um prefixo existente aparece no CSV, **ENTÃO** os campos cadastrais são atualizados, sem duplicação de linha.
- GWT-001.3 — **DADO** uma linha sem prefixo, **QUANDO** a importação a lê, **ENTÃO** a linha é rejeitada, registrada em *log* com número da linha e motivo, e a importação prossegue.
- GWT-001.4 — **DADO** o final da importação, **QUANDO** o script encerra, **ENTÃO** produz relatório com: linhas lidas, linhas importadas, linhas atualizadas, linhas rejeitadas.

### US-002 — Indexação de arquivos PDF do HD de rede

> **Como** operador técnico
> **Quero** que um *worker* varra o HD de rede e registre nome, caminho e metadados dos PDFs
> **Para que** o dashboard possa listar os arquivos de cada posto.

Tamanho: L — PO responsável: Lucas (*worker* Python)

**Critérios:**
- GWT-002.1 — **DADO** um diretório da rede autorizado, **QUANDO** o *worker* é executado, **ENTÃO** cada PDF é registrado com prefixo extraído, nome, caminho absoluto, tamanho e data de modificação.
- GWT-002.2 — **DADO** um arquivo cujo nome não contém prefixo reconhecível, **QUANDO** o *worker* o processa, **ENTÃO** o arquivo é gravado como “órfão” e não bloqueia a execução.
- GWT-002.3 — **DADO** reexecução sobre o mesmo diretório, **QUANDO** o *worker* termina, **ENTÃO** a tabela reflete o estado atual do diretório — sem registros desatualizados.
- GWT-002.4 — **DADO** qualquer execução, **QUANDO** o *worker* acessa o HD, **ENTÃO** nenhum arquivo é criado, modificado ou removido.

### US-003 — Busca de postos por prefixo

> **Como** técnico SPÁguas
> **Quero** buscar um posto pelo seu prefixo
> **Para** acessar sua ficha rapidamente.

Tamanho: S — PO responsável: Fernanda (UI) + Lucas (API)

**Critérios:**
- GWT-003.1 — **DADO** o termo `1D-008`, **QUANDO** submeto a busca, **ENTÃO** o posto de prefixo exato é retornado em até 2 segundos.
- GWT-003.2 — **DADO** o termo parcial `2D`, **QUANDO** submeto a busca, **ENTÃO** todos os postos cujo prefixo inicia por `2D` são retornados, paginados.
- GWT-003.3 — **DADO** prefixo inexistente, **QUANDO** submeto a busca, **ENTÃO** é exibido estado “nenhum posto encontrado”, com sugestão de ajustar o termo.

### US-004 — Busca textual por atributos do posto

> **Como** técnico SPÁguas
> **Quero** buscar postos por nome da estação, município, bacia ou UGRHI
> **Para** localizar postos quando não lembro do prefixo.

Tamanho: M — PO responsável: Fernanda + Lucas

**Critérios:**
- GWT-004.1 — **DADO** o termo `guaratingueta` (sem acento), **QUANDO** submeto a busca, **ENTÃO** postos com município `Guaratinguetá` são retornados.
- GWT-004.2 — **DADO** o termo `PARAIBA`, **QUANDO** submeto a busca, **ENTÃO** postos com bacia `R. PARAÍBA DO SUL` e UGRHI `Paraíba do Sul` são retornados.
- GWT-004.3 — **DADO** resultados superiores a 25, **QUANDO** são apresentados, **ENTÃO** são paginados, com total de resultados visível.
- GWT-004.4 — **DADO** nenhum resultado, **QUANDO** a busca termina, **ENTÃO** estado vazio é apresentado com mensagem clara.

### US-005 — Visualização da ficha do posto

> **Como** técnico SPÁguas
> **Quero** visualizar todos os dados cadastrais de um posto selecionado
> **Para** consultar suas informações operacionais.

Tamanho: M — PO responsável: Fernanda

**Critérios:**
- GWT-005.1 — **DADO** um posto válido, **QUANDO** acesso sua ficha, **ENTÃO** todos os 37 campos são apresentados, agrupados em seções lógicas (identificação, localização, bacia, operação, equipamentos, observações).
- GWT-005.2 — **DADO** campo nulo, **QUANDO** a ficha é renderizada, **ENTÃO** o rótulo é apresentado com valor “não informado”.
- GWT-005.3 — **DADO** o carregamento em andamento, **QUANDO** os dados ainda não retornaram, **ENTÃO** estado de carregamento é apresentado (*skeleton* ou indicador).
- GWT-005.4 — **DADO** falha de rede/servidor, **QUANDO** a chamada falha, **ENTÃO** mensagem de erro clara é apresentada com ação “tentar novamente”.
- GWT-005.5 — **DADO** prefixo inválido na URL, **QUANDO** a página carrega, **ENTÃO** estado “posto não encontrado” é apresentado.
- GWT-005.6 — **DADO** o acesso bem-sucedido, **QUANDO** a ficha é exibida, **ENTÃO** registro é gravado em `acesso_ficha`.
- GWT-005.7 — **DADO** usuário navegando apenas por teclado, **QUANDO** percorre a ficha, **ENTÃO** todos os controles e seções são alcançáveis e claramente focados.

### US-006 — Listagem de arquivos PDF do posto

> **Como** técnico SPÁguas
> **Quero** ver os arquivos PDF associados ao prefixo exibido
> **Para** abrir manualmente o documento de interesse no explorador de arquivos.

Tamanho: S — PO responsável: Fernanda + Lucas

**Critérios:**
- GWT-006.1 — **DADO** o prefixo `1D-008`, **QUANDO** a ficha é aberta, **ENTÃO** os arquivos indexados são listados com nome, caminho completo, tamanho e data de modificação, ordenados por data descendente.
- GWT-006.2 — **DADO** prefixo sem arquivos indexados, **QUANDO** a ficha carrega, **ENTÃO** estado vazio é apresentado: “nenhum arquivo indexado para este prefixo”.
- GWT-006.3 — **DADO** prefixo nunca varrido pelo *worker*, **QUANDO** a ficha carrega, **ENTÃO** é apresentado aviso “indexação ainda não executada para este prefixo”.
- GWT-006.4 — **DADO** a listagem apresentada, **QUANDO** o usuário clica em “copiar caminho”, **ENTÃO** o caminho de rede é copiado para a área de transferência.
- GWT-006.5 — **DADO** a listagem, **QUANDO** renderizada, **ENTÃO** nenhum arquivo é aberto, baixado ou embutido pelo sistema.

### US-007 — Registro de auditoria (transparente ao usuário)

> **Como** órgão público sujeito à LGPD
> **Quero** que toda consulta a ficha de posto seja rastreada
> **Para** atender às exigências de auditoria e direitos do titular.

Tamanho: S — PO responsável: Lucas + André

**Critérios:**
- GWT-007.1 — **DADO** qualquer consulta bem-sucedida à ficha, **QUANDO** a resposta é emitida, **ENTÃO** registro é gravado contendo `timestamp`, `ip`, `user_agent` e `prefixo_consultado` (o campo `usuario_id` permanece nulo enquanto não houver autenticação, conforme decisão do kickoff).
- GWT-007.2 — **DADO** o registro gravado, **QUANDO** o DBA consulta a tabela, **ENTÃO** o conteúdo é imutável pela aplicação (*append-only*).
- GWT-007.3 — **DADO** volume de consultas, **QUANDO** acumulado por 12 meses, **ENTÃO** a tabela de auditoria não compromete a performance do sistema (estratégia de retenção definida pelo PO DevOps).

### US-008 — Autenticação (Fase 2 — não implementar no MVP)

> **Como** órgão público sujeito à LGPD
> **Quero** identificar individualmente cada usuário que consulta a rede de postos
> **Para** atribuir responsabilidade individual à trilha de auditoria.

Tamanho: M — PO responsável: André (Segurança) + Lucas — **Fase 2**

**Restrição vigente no MVP:** enquanto esta US não for implementada, o sistema **deve** rodar exclusivamente em rede interna do setor, sem exposição à internet pública. Essa restrição é pré-condição de deploy e é responsabilidade do Rodrigo documentá-la no runbook.

### US-009 — Consultar desconformidades cadastrais

> **Como** técnico SPÁguas responsável pela curadoria
> **Quero** visualizar, por categoria, os postos e arquivos desconformes ao padrão oficial
> **Para** priorizar a correção da planilha-fonte e reduzir o percentual de arquivos fora do índice (hoje 92,12% não recuperados).

Tamanho: M — PO responsável: Fernanda (UI) + Lucas (API)

**Critérios:**

- GWT-009.1 — **DADO** que acesso `/desconformidades`, **QUANDO** a página carrega, **ENTÃO** são apresentadas **4 abas**: (a) *Prefixo principal desconforme* (54 postos), (b) *Prefixo ANA desconforme* (436 postos), (c) *Arquivos órfãos* (sem prefixo conhecido), (d) *Arquivos malformados* (nome fora do padrão). Cada aba exibe contador e *badge* visual.
- GWT-009.2 — **DADO** a aba *Prefixo principal desconforme*, **QUANDO** renderizada, **ENTÃO** cada linha apresenta: prefixo atual, classe do problema (ex.: "suspeita de dígito/letra trocados", "placeholder com interrogação", "outlier"), sugestão de correção textual e status (`pendente` | `revisado`).
- GWT-009.3 — **DADO** a aba *Prefixo ANA desconforme*, **QUANDO** renderizada, **ENTÃO** cada linha apresenta: prefixo do posto, prefixo ANA atual, prefixo ANA sugerido (com *padding* de zeros à esquerda), e status.
- GWT-009.4 — **DADO** qualquer linha, **QUANDO** clico em *Marcar como revisado*, **ENTÃO** o sistema registra em `revisoes_desconformidade` com `status = 'revisado'`, `ip` do *requester* e `revisado_em = NOW()`. O estado da aba é atualizado sem recarga completa da página.
- GWT-009.5 — **DADO** o MVP sem auth, **QUANDO** a ação de revisão é executada, **ENTÃO** o registro grava `usuario_id = NULL` e `ip` preenchido — nunca bloqueia por ausência de autenticação, mas a nota deixa explícito que a correção efetiva é responsabilidade do técnico sobre a planilha-fonte.
- GWT-009.6 — **DADO** o usuário navegando por teclado, **QUANDO** percorre as abas, **ENTÃO** as setas esquerda/direita alternam as abas (padrão WAI-ARIA *tabs*), o `Tab` desce para a primeira linha da aba ativa, e o foco é anunciado pelo leitor de tela.
- GWT-009.7 — **DADO** que o *worker* de indexação ainda não rodou, **QUANDO** as abas *Arquivos órfãos* e *Arquivos malformados* são abertas, **ENTÃO** é apresentado estado vazio com mensagem "nenhum arquivo indexado até o momento — aguardando varredura do *worker*".
- GWT-009.8 — **DADO** o tom formal do padrão governo, **QUANDO** os textos são exibidos, **ENTÃO** seguem o exemplo: "Verificamos 436 postos com código da ANA fora do padrão oficial (8 dígitos). A correção sugerida é preencher os dígitos faltantes à esquerda." Nenhuma informalidade, nenhum *emoji*.

### US-010 — Visualizar ficha com arquivos agrupados por tipo de documento

> **Como** técnico SPÁguas
> **Quero** ver os arquivos de um posto agrupados pelos 7 tipos oficiais (Ficha Descritiva, PCD, Inspeção, Nivelamento, Levantamento de Seção, Troca de Observador, Vazão)
> **Para** localizar rapidamente o documento da categoria que me interessa, em vez de percorrer uma lista plana.

Tamanho: S — PO responsável: Fernanda (UI) + Lucas (API)

**Critérios:**

- GWT-010.1 — **DADO** um posto com arquivos indexados de múltiplos tipos, **QUANDO** a ficha é renderizada, **ENTÃO** os arquivos aparecem agrupados em até 7 seções nomeadas (uma por tipo), cada seção com contador e ordenada por `data_documento` descendente dentro do grupo.
- GWT-010.2 — **DADO** um tipo sem arquivos, **QUANDO** a ficha é renderizada, **ENTÃO** a seção daquele tipo **não** é apresentada (evita ruído visual).
- GWT-010.3 — **DADO** um arquivo com `cod_tipo_documento = NULL` (arquivo legado indexado antes da refatoração, ou raro caso de parsing parcial), **QUANDO** a ficha é renderizada, **ENTÃO** o arquivo entra em uma seção final rotulada *Sem classificação*.
- GWT-010.4 — **DADO** um grupo, **QUANDO** cada linha é renderizada, **ENTÃO** exibe os campos derivados disponíveis: `cod_encarregado`, `data_documento` formatada em pt-BR, `parte_opcional` quando presente, além de nome, tamanho, caminho copiável e data de modificação do sistema de arquivos.
- GWT-010.5 — **DADO** o contrato de acessibilidade, **QUANDO** o usuário navega com leitor de tela, **ENTÃO** cada seção é anunciada com `aria-labelledby` apontando para o cabeçalho do grupo e contador.

---

## 6. Estados de Interface Cobertos

A feature só é considerada concluída quando, para cada tela relevante, os estados abaixo estão implementados e validados pelo Thiago (QA).

| Tela | Vazio | Carregando | Erro | Sucesso | Sem resultados | Borda |
|------|-------|------------|------|---------|----------------|-------|
| Busca | Sugestão inicial ao abrir o dashboard | *Skeleton* de lista | Mensagem de erro com ação | Lista paginada | Estado “nenhum posto encontrado” | Termo com apenas espaços, termo muito curto |
| Ficha do posto | Não aplicável | *Skeleton* da ficha | Mensagem de erro com ação | Ficha completa | Estado “posto não encontrado” (404) | Todos os campos nulos |
| Arquivos do posto | “Nenhum arquivo indexado” | *Skeleton* de lista | Mensagem de erro | Lista ordenada | Aviso “indexação ainda não executada” | Caminhos muito longos; muitos arquivos |

---

## 7. Requisitos Não-Funcionais

### 7.1 Performance
- **RNF-01 —** Busca por prefixo deve responder em até 2 segundos no percentil 95 sobre a base de 2.484 postos.
- **RNF-02 —** Ficha do posto deve renderizar em até 2 segundos após navegação.
- **RNF-03 —** Indexação completa do HD de rede deve poder ser executada fora do horário de expediente.

### 7.2 Disponibilidade
- **RNF-04 —** Indisponibilidade do *worker* de indexação não pode bloquear o acesso ao dashboard. Quando a tabela de arquivos estiver desatualizada, o sistema deve informar o usuário com aviso discreto.

### 7.3 Acessibilidade
- **RNF-05 —** Conformidade WCAG 2.1 AA e e-MAG obrigatória em todas as telas.
- **RNF-06 —** Navegação completa por teclado.
- **RNF-07 —** Contraste de cor mínimo 4.5:1 para texto normal.
- **RNF-08 —** Leitor de tela deve anunciar corretamente estados (carregando, erro, resultado).

### 7.4 Segurança e LGPD
- **RNF-09 —** Chave de serviço do banco NUNCA trafega para o navegador; todas as operações de escrita e importação passam por rota ou *worker* em ambiente servidor.
- **RNF-10 —** Trilha de auditoria de acesso a ficha é obrigatória.
- **RNF-11 —** *Inputs* de busca são sanitizados contra injeção SQL e XSS.
- **RNF-12 —** CORS restritivo em produção; `debug=false`.
- **RNF-13 —** *Logs* estruturados, sem exposição de chaves ou segredos.

### 7.5 Portabilidade de dados
- **RNF-14 —** A camada de acesso a dados deve ser abstraída de modo que a migração do Supabase para provedor em território nacional não exija reescrita da aplicação — apenas substituição da camada de conexão e migração de *schema*.

### 7.6 Internacionalização
- **RNF-15 —** Todo conteúdo textual em pt-BR, tom formal. Não há previsão de outros idiomas.

---

## 8. Priorização

| Release | Conteúdo | Justificativa |
|---------|----------|---------------|
| **MVP — Fase 1** | US-001 a US-007 | Essencial para substituir a operação manual atual. |
| **Fase 2** | Ficha técnica persistida, ficha de inspeção, *upload* de PDFs, cadastro/edição de postos | Requer aprovação do MVP e evolução de escopo com o cliente. |
| **Fase 3 (indicativa)** | Mapa geoespacial, relatórios agregados, integração com SAISP | Depende de viabilidade operacional e escopo contratual. |

---

## 9. Perguntas em Aberto (a confirmar com o Rafael / cliente)

1. ~~**Padrão do prefixo nos nomes de arquivo:** o regex `^([0-9][A-Z]-[0-9]{3})` cobre todos os casos reais do HD de rede?~~ **RESPONDIDO (22/04/2026 — documentação oficial do cliente):** o cliente forneceu o padrão oficial por pasta raiz (5 categorias), com regex específica por tipo de dado (ver 3.1.4) e padrão de nome de arquivo consolidado `{Prefixo} {CodDoc} {CodEnc} [Opcional] {AAAA MM DD}.pdf` (ver RN-06). A estratégia da v1.1 por `startswith` é descartada; o *worker* passa a usar parsing por regex + validação de existência do prefixo em `postos`.
2. ~~**Identidade do usuário:** no MVP, como será feita a autenticação?~~ **RESPONDIDO (22/04/2026):** autenticação está **fora do MVP**. Trilha LGPD passa a registrar `timestamp`, `ip`, `user_agent` e `prefixo_consultado`, com `usuario_id` nullable até a Fase 2 (US-008). Pré-condição: sistema rodando exclusivamente em rede interna no MVP.
3. **Território nacional para produção:** o contrato exige explicitamente hospedagem em território nacional? Data alvo para migração?
4. **Política de retenção da trilha LGPD:** por quanto tempo manter os registros de acesso (12 meses? Indefinido?).
5. **Variações de caminho do HD de rede:** há múltiplos volumes/servidores ou é um único caminho UNC raiz?
6. **Volume futuro de arquivos:** estimativa da ordem de grandeza — centenas, milhares ou dezenas de milhares de PDFs? Afeta estratégia de indexação.
7. **Campo `MUNICIPI_1`:** confirmar se é correção/padronização do `MUNICIPIO` ou outro conceito. Impacta lógica de busca.
8. **Necessidade de *export* (CSV/PDF) dos resultados da busca no MVP?** Registrado como fora de escopo até confirmação.
9. ~~**Semântica da interrogação nos 26 prefixos `XXXNNN?` (ex.: `FLU001?`):**~~ **RESPONDIDO — parcialmente (22/04/2026):** consistente com o padrão oficial (apenas 5 regex de prefixo por pasta, nenhuma contendo `?`), os 26 casos são confirmados como **placeholders** na planilha-fonte — representam postos com cadastro pendente, sem correspondência esperada no HD de rede. Tratamento no MVP: os 26 permanecem em `postos` (preservando INV-01) e aparecem na aba *Prefixo principal desconforme* da US-009, com sugestão textual "placeholder sem cadastro definitivo — confirmar numeração com a equipe SPÁguas". O *worker* simplesmente não gera `arquivos_indexados` para esses prefixos. Aguarda-se confirmação formal do cliente apenas para o texto da sugestão.

---

## 10. Próximos Passos

1. Aprovação desta especificação pelo Rafael.
2. Validação da arquitetura produzida pelo Bruno em paralelo (`architecture.md` + ADR).
3. Alinhamento das perguntas em aberto (Seção 9) com o cliente.
4. Liberação do pipeline para Lucas, Fernanda, Rodrigo, Thiago, André e Marina — conforme ordem do orquestrador.
