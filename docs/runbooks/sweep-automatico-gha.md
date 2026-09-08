# Runbook (DESENHO): sweep automatizado via GitHub Actions self-hosted runner

| Campo | Valor |
|-------|-------|
| Owner | Rodrigo (DevOps) |
| Status | **DESENHO PROPOSTO**. Não implementar até Rafael aprovar. |
| Sprint alvo | a definir (estimativa em §10) |
| Documento pai | ADR-0006 (lazy indexing), `docs/runbooks/vercel-cron.md`, `docs/runbooks/cron-externo-hobby.md`, `supabase/migrations/0027_cron_heartbeats.sql`, `supabase/migrations/0021_lazy_indexing.sql`, `supabase/migrations/0007_indexacao_log.sql` |
| Substitui | execução manual do comando `python -m ops.indexer.index_fs --root "Y:\000 Documentos de Campo"` |
| Última revisão | 2026-05-14 |

---

## 1. Contexto e motivação

### 1.1 Estado atual

O sweep batch de indexação do HD do DAEE roda **manualmente**, disparado por operador na máquina interna que tem o drive `Y:` mapeado para `\\10.20.40.9\dhp`. O ADR-0006 introduziu indexação preguiçosa por posto (cobrindo o caso de uso interativo), porém o sweep continua sendo necessário em duas situações:

1. **Carga inicial** (após reset do banco ou troca de máquina).
2. **Reconciliação periódica**, para detectar arquivos novos ou removidos que o lazy indexing não tocou (postos pouco acessados ficam com cache stale por dias).

Sem automação, a reconciliação depende de operador lembrar de rodar, e não há registro estruturado de quando o último sweep aconteceu. Para um cliente de governo, essa lacuna fere requisitos de auditoria (LGPD, e-MAG, plano de governança digital).

### 1.2 Restrição inegociável

O caminho `\\10.20.40.9\dhp` é compartilhamento SMB **interno do DAEE**, acessível **apenas de máquinas dentro da rede do cliente**. Logo, qualquer runner em nuvem pública (GitHub-hosted, AWS, Azure, GCP) está fora de alternativa. O sweep precisa rodar em uma máquina física dentro da rede do DAEE. A escolha natural, alinhada com o stack já em uso pelo time, é **GitHub Actions self-hosted runner** instalado na máquina autorizada.

### 1.3 Por que não cron-job.org ou cron nativo do SO

| Alternativa | Veredicto |
|-------------|-----------|
| cron-job.org disparando endpoint HTTP | rejeitada. O endpoint precisaria estar dentro da rede do cliente (não exposto na internet) ou exigir VPN inversa. Acrescenta superfície de ataque e infra externa. |
| Task Scheduler do Windows (built-in) | rejeitada. Sem audit trail centralizado, sem dashboard de execução, sem retry estruturado, sem rotação de credenciais via cofre. Operador precisaria abrir a máquina para investigar falhas. |
| systemd timer (se a máquina virasse Linux) | viável tecnicamente, porém perderia visibilidade pelo painel do GitHub, que o time já consulta diariamente. |
| GitHub Actions self-hosted runner | **escolhida**. Workflow versionado no repo, logs no painel do GitHub, secrets gerenciados em GitHub Secrets, integra com fluxo de PR e Dependabot que o time já opera. |

Observação: o runbook `cron-externo-hobby.md` §1.2 rejeitou GitHub Actions schedule para o cron de locks porque o caso de uso era sub-horário e a documentação do GitHub admite skips silenciosos quando o repo tem baixa atividade ou em períodos de alta carga global. No caso do sweep do HD, **a cadência é diária**, e o runner é self-hosted (a fila de schedule é própria da máquina, não compete com a fila global). A objeção não se aplica.

---

## 2. Visão geral da automação proposta

| Item | Valor |
|------|-------|
| Job ID (em `cron_heartbeats`) | `indexer-sweep-noturno` |
| Schedule | `0 4 * * *` (todo dia, 04h00 UTC, equivalente a 01h00 BRT) |
| Trigger adicional | `workflow_dispatch` (botão "Run workflow" no painel do GitHub, para disparo manual auditado) |
| Comando executado | `python -m ops.indexer.index_fs --root "%INDEXER_ROOT_PATH%"` |
| Runner | self-hosted, label `spaguas-daee-hd`, máquina Windows na rede do cliente |
| Timeout duro | 90 minutos (sweep atual leva 10 a 15 min, folga de 6x cobre crescimento) |
| Heartbeat | nova entrada em `cron_heartbeats`, `job = 'indexer-sweep-noturno'` |
| Alerta de saúde | A4 (a criar em `docs/runbooks/alertas-siem.md`) |
| Secrets | `DATABASE_URL_INDEXER`, `INDEXER_ROOT_PATH` (no `.env.local` da máquina, **não** em GitHub Secrets, ver §6) |

Diagrama de fluxo:

```
GitHub Cloud                              Máquina interna DAEE
+----------------------+                  +------------------------------+
| Actions Scheduler    |                  | Self-hosted runner           |
|  cron 0 4 * * *      |---- dispatch --->|  label: spaguas-daee-hd      |
+----------------------+                  |                              |
                                          |  steps:                      |
                                          |   1. checkout                |
                                          |   2. setup-python 3.12       |
                                          |   3. pip install -r req.txt  |
                                          |   4. heartbeat inicial       |
                                          |   5. python -m index_fs ...  |
                                          |   6. heartbeat final         |
                                          |   7. (on failure) alerta     |
                                          +--------+---------------------+
                                                   |
                                                   |  SMB                  Postgres
                                                   v                       v
                                          \\10.20.40.9\dhp          Supabase (cron_heartbeats,
                                          (drive Y: mapeado)         indexacao_log)
```

---

## 3. Workflow YAML proposto

Caminho do arquivo: `.github/workflows/sweep-indexer.yml`.

```yaml
name: Sweep Indexer (HD DAEE)

# Disparo diário às 04h UTC (01h BRT, janela de menor uso do HD).
# `workflow_dispatch` permite disparo manual com auditoria.
on:
  schedule:
    - cron: "0 4 * * *"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Rodar em dry-run (sem gravar no banco)"
        required: false
        type: boolean
        default: false

# Garante que dois sweeps nunca rodam em paralelo na mesma maquina.
# `cancel-in-progress: false` preserva o sweep em curso e enfileira o novo.
concurrency:
  group: sweep-indexer-daee
  cancel-in-progress: false

# Permissoes minimas. O workflow nao escreve no repo.
permissions:
  contents: read

jobs:
  sweep:
    name: Varredura completa do HD
    # Label do self-hosted runner instalado na maquina interna do DAEE.
    runs-on: [self-hosted, windows, spaguas-daee-hd]
    timeout-minutes: 90

    # Variaveis vem do .env.local da maquina (carregado por python-dotenv).
    # NAO usar GitHub Secrets para DATABASE_URL_INDEXER (ver runbook secao 6).
    env:
      PYTHONIOENCODING: utf-8
      PYTHONUNBUFFERED: "1"

    steps:
      - name: Checkout do repo
        uses: actions/checkout@v4
        with:
          # Sweep nao precisa de historico, shallow clone economiza I/O.
          fetch-depth: 1

      - name: Setup Python 3.12
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Instalar dependencias do indexer
        shell: pwsh
        run: |
          python -m pip install --upgrade pip
          python -m pip install -r ops/indexer/requirements.txt

      - name: Validar acesso ao HD
        shell: pwsh
        run: |
          if (-not (Test-Path "$env:INDEXER_ROOT_PATH")) {
            Write-Error "INDEXER_ROOT_PATH inacessivel: $env:INDEXER_ROOT_PATH"
            exit 2
          }
          Write-Host "HD acessivel. Raiz: $env:INDEXER_ROOT_PATH"

      - name: Heartbeat inicial (status em_andamento)
        shell: pwsh
        run: |
          python ops/indexer/heartbeat.py `
            --job indexer-sweep-noturno `
            --fase inicio `
            --run-id "${{ github.run_id }}" `
            --run-attempt "${{ github.run_attempt }}" `
            --trigger "${{ github.event_name }}"

      - name: Sweep completo
        id: sweep
        shell: pwsh
        run: |
          $dry = "${{ inputs.dry_run }}"
          if ($dry -eq "true") {
            python -m ops.indexer.index_fs --root "$env:INDEXER_ROOT_PATH" --dry-run
          } else {
            python -m ops.indexer.index_fs --root "$env:INDEXER_ROOT_PATH"
          }

      - name: Heartbeat final (status ok)
        if: success()
        shell: pwsh
        run: |
          python ops/indexer/heartbeat.py `
            --job indexer-sweep-noturno `
            --fase fim `
            --status ok `
            --run-id "${{ github.run_id }}"

      - name: Heartbeat de falha
        if: failure()
        shell: pwsh
        run: |
          python ops/indexer/heartbeat.py `
            --job indexer-sweep-noturno `
            --fase fim `
            --status erro `
            --run-id "${{ github.run_id }}" `
            --erro "step falhou, ver logs do GitHub Actions run ${{ github.run_id }}"

      - name: Resumo no summary do GitHub
        if: always()
        shell: pwsh
        run: |
          "## Sweep indexer ${{ github.run_id }}" >> $env:GITHUB_STEP_SUMMARY
          "- Trigger: ${{ github.event_name }}" >> $env:GITHUB_STEP_SUMMARY
          "- Status: ${{ job.status }}" >> $env:GITHUB_STEP_SUMMARY
          "- Dry-run: ${{ inputs.dry_run }}" >> $env:GITHUB_STEP_SUMMARY
```

### 3.1 Notas sobre o YAML

1. `concurrency.group` impede execuções concorrentes. Se um sweep manual disparar enquanto o noturno ainda roda, o novo entra na fila do runner sem cancelar o que está em curso (rollback gratuito, sem perda de lote).
2. `permissions: contents: read` é o mínimo possível. O workflow nunca abre PR nem escreve no repo, portanto não precisa de `write`.
3. `timeout-minutes: 90` é guarda contra travamento do SMB (visto historicamente quando o servidor 10.20.40.9 fica saturado). Termina o run com falha e dispara o heartbeat de erro.
4. `setup-python` em self-hosted Windows funciona, porém precisa do `tool cache` aceitar o caminho. Em §5.3 fica documentado como pré-instalar Python diretamente no runner caso a action falhe.
5. O script `ops/indexer/heartbeat.py` ainda **não existe** e é parte do escopo de implementação (Lucas, ver §10).

---

## 4. Integração com `cron_heartbeats`

### 4.1 Adição de job permitido no CHECK

A migration `0027_cron_heartbeats.sql` restringe `job` a um único valor. Será necessário criar nova migration (`0028_cron_heartbeats_sweep.sql`) que **adiciona** o job sem remover o existente:

```sql
-- Migration 0028: admitir o job de sweep noturno no CHECK
ALTER TABLE cron_heartbeats
  DROP CONSTRAINT chk_cron_heartbeats_job;

ALTER TABLE cron_heartbeats
  ADD CONSTRAINT chk_cron_heartbeats_job
  CHECK (job IN (
    'triagem-liberar-locks-expirados',
    'indexer-sweep-noturno'
  ));
```

Migration idempotente (pode rodar várias vezes) é viabilizada via `pg_constraint` check antes do `DROP`. Versão completa ficará na implementação.

### 4.2 Schema do `payload` por fase

O sweep grava **duas linhas** em `cron_heartbeats` por execução:

| Fase | `duracao_ms` | `payload` (exemplo) |
|------|--------------|---------------------|
| início | `0` | `{ "fase": "inicio", "run_id": "9876543210", "run_attempt": 1, "trigger": "schedule", "raiz": "Y:\\000 Documentos de Campo" }` |
| fim (sucesso) | `812345` | `{ "fase": "fim", "status": "ok", "run_id": "9876543210", "lote_indexacao": "uuid-do-lote", "arquivos_indexados": 41230, "arquivos_orfaos": 87, "arquivos_removidos": 3 }` |
| fim (erro) | `42100` | `{ "fase": "fim", "status": "erro", "run_id": "9876543210", "erro": "OSError: [WinError 64] ...", "etapa": "varredura" }` |

Decisão (Rodrigo): **duas linhas em vez de uma**. Motivo: se o sweep travar (perder energia, o SMB cair sem timeout), a linha de `fim` nunca chega ao banco, e o alerta A4 detecta "início sem fim em N minutos". Uma linha única não diferencia "sweep ainda rodando" de "sweep morreu silenciosamente".

A coluna `duracao_ms` na linha de início fica `0` por convenção. A linha de fim carrega a duração total.

### 4.3 Painel de consumo

O dashboard já tem precedente em `vercel-cron.md` §4.2. Nova query equivalente para o sweep:

```sql
SELECT
  ocorreu_em AT TIME ZONE 'America/Sao_Paulo' AS ocorreu_brt,
  payload->>'fase'              AS fase,
  payload->>'status'            AS status,
  payload->>'run_id'            AS run_id,
  payload->>'arquivos_indexados' AS indexados,
  payload->>'arquivos_orfaos'    AS orfaos,
  duracao_ms
FROM cron_heartbeats
WHERE job = 'indexer-sweep-noturno'
ORDER BY ocorreu_em DESC
LIMIT 20;
```

Painel administrativo (Sprint a definir) deve mostrar:

- Último sweep (data, status, contagens).
- Duração média dos últimos 7 sweeps.
- Gráfico de variação de `arquivos_indexados` (detecta deleção em massa ou ataque).

---

## 5. Setup do self-hosted runner no Windows

A máquina alvo é a estação Windows interna do DAEE que já tem o drive `Y:` mapeado. Premissa: existe usuário de serviço dedicado, sem privilégio de domínio, com permissão `read` no compartilhamento `\\10.20.40.9\dhp`. Caso não exista, **criar antes do passo 1 abaixo**.

### 5.1 Instalação do runner

Procedimento oficial do GitHub, com adaptações.

```
1. No GitHub, ir em:
   Repositorio -> Settings -> Actions -> Runners -> New self-hosted runner
   Escolher: Windows x64

2. No portal, copiar os comandos sugeridos. Eles serao semelhantes a:
   mkdir C:\actions-runner
   cd C:\actions-runner
   Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/vX.Y.Z/actions-runner-win-x64-X.Y.Z.zip -OutFile runner.zip
   Add-Type -AssemblyName System.IO.Compression.FileSystem
   [System.IO.Compression.ZipFile]::ExtractToDirectory("$PWD\runner.zip", "$PWD")

3. Configurar (rodar como o usuario de servico, NAO como Administrator):
   .\config.cmd --url https://github.com/rafaelstn/dash_sp_aguas `
                --token <TOKEN_DO_PORTAL> `
                --name spaguas-daee-hd-01 `
                --labels spaguas-daee-hd,windows,daee-network `
                --work _work `
                --unattended `
                --replace

4. Instalar como servico do Windows (inicia com o SO):
   .\svc.cmd install
   .\svc.cmd start

5. Validar:
   .\svc.cmd status
   Saida esperada: status RUNNING.
```

Notas:

- O token do portal expira em 1 hora. Re-gerar se demorar.
- A label `spaguas-daee-hd` é o seletor usado no workflow (`runs-on:`). Se mudar, atualizar o YAML.
- O nome do runner (`spaguas-daee-hd-01`) permite escalar para múltiplos runners no futuro (`-02`, `-03`) sem trocar workflow.

### 5.2 Credencial persistente do SMB

Quando o runner roda como serviço, a sessão é diferente da do usuário logado, e o mapeamento `Y:` feito manualmente pode não estar visível. Solução documentada:

```
1. Logar na maquina como o usuario de servico (mesmo usuario que executa o runner).

2. Persistir a credencial no Credential Manager do Windows:
   cmdkey /add:10.20.40.9 /user:<dominio>\<usuario_servico> /pass:<senha>

3. Mapear Y: persistente:
   net use Y: \\10.20.40.9\dhp /persistent:yes /user:<dominio>\<usuario_servico> <senha>

4. Validar:
   dir Y:\
   Deve listar pastas.

5. Sair, reiniciar o servico do runner:
   .\svc.cmd stop
   .\svc.cmd start
```

Alternativa mais segura: configurar o serviço do runner para rodar **como o usuário de serviço** (não como `LocalSystem`), via `services.msc -> actions.runner.<repo>.<runner> -> Log On -> This account`. Assim o `Y:` mapeado pelo usuário fica visível ao runner sem precisar do `cmdkey` em sessão diferente.

### 5.3 Pré-instalar Python no runner (fallback)

Se `actions/setup-python@v5` falhar no runner Windows (problemas conhecidos com cache em paths longos), pré-instalar Python 3.12 globalmente:

```
1. Baixar instalador oficial python.org 3.12 (Windows x64).
2. Instalar com "Add Python to PATH" marcado.
3. Validar em PowerShell nova: python --version => 3.12.x
4. No workflow, substituir o step "Setup Python" por:
   - name: Validar Python pre-instalado
     shell: pwsh
     run: python --version
```

### 5.4 `.gitignore` da pasta do runner

A pasta `C:\actions-runner` não fica dentro do repo. Porém, se por acidente alguém clonar dentro dela, **adicionar ao `.gitignore` do repo** as seguintes entradas preventivas:

```
# Self-hosted runner (nunca deve estar dentro do repo, mas blindagem)
_work/
actions-runner/
*.runner
.credentials
.credentials_rsaparams
```

Estas linhas **não são opcionais**. O arquivo `.credentials` no diretório do runner contém o token de autenticação com o GitHub. Vazamento dá acesso write ao repo via runner.

---

## 6. Estratégia de secrets

### 6.1 Princípio

**Nada que toque o HD ou o banco fica em GitHub Secrets.** O runner é local, então faz mais sentido manter `DATABASE_URL_INDEXER` e `INDEXER_ROOT_PATH` em `C:\actions-runner\_work\.env.local` na própria máquina, e deixar o script Python carregar via `python-dotenv` (que `index_fs.py` já faz nas linhas 406-407).

Justificativas:

| Risco em GitHub Secrets | Mitigação local |
|-------------------------|-----------------|
| Secret aparece em log do Actions se mal escapado | Secret nunca sai da máquina; log do Actions só vê o stdout do Python, que não imprime conn string |
| Service role do Supabase exposta se workflow for modificado por PR de fork malicioso | Repo é privado, mas blindagem extra: secret nunca chega ao GitHub |
| Rotação exige acesso ao GitHub Org Settings | Rotação é local: editar `.env.local`, restart do serviço, fim |
| Compliance (governo): dado de conexão sai da rede do cliente para datacenter externo | Conexão fica integralmente na rede do cliente |

### 6.2 Layout do `.env.local` da máquina

```
# C:\actions-runner\_work\.env.local
# Permissoes: somente o usuario de servico le. Verificar com `icacls`.

# Connection string com role indexer_worker (DML em arquivos_indexados,
# arquivos_orfaos, indexacao_log e cron_heartbeats; READ em postos,
# postos_caminhos, posto_indexacao_cache; NUNCA DDL).
DATABASE_URL_INDEXER=postgresql://indexer_worker:<senha>@aws-X.pooler.supabase.com:5432/postgres

# Caminho raiz da varredura. Drive mapeado persistente (ver secao 5.2).
INDEXER_ROOT_PATH=Y:\000 Documentos de Campo
```

Permissões obrigatórias no arquivo:

```
icacls C:\actions-runner\_work\.env.local /inheritance:r
icacls C:\actions-runner\_work\.env.local /grant:r "<dominio>\<usuario_servico>:(R)"
icacls C:\actions-runner\_work\.env.local /grant:r "BUILTIN\Administrators:(F)"
icacls C:\actions-runner\_work\.env.local /remove "BUILTIN\Users"
icacls C:\actions-runner\_work\.env.local /remove "Everyone"
```

Validar com `icacls C:\actions-runner\_work\.env.local` que só o usuário de serviço e Administrators têm leitura.

### 6.3 Role de banco dedicada

Criar uma role nova no Supabase (`indexer_worker`), com permissões mínimas:

```sql
-- Migration 0029 (hipotese): role do worker de indexacao
CREATE ROLE indexer_worker LOGIN PASSWORD '<gerar>';
GRANT CONNECT ON DATABASE postgres TO indexer_worker;
GRANT USAGE ON SCHEMA public TO indexer_worker;

-- READ
GRANT SELECT ON postos, postos_caminhos, posto_indexacao_cache,
                tipos_dado, tipos_documento, prefixos_ana,
                cthdoc_mapeamento TO indexer_worker;

-- WRITE somente onde o sweep grava
GRANT SELECT, INSERT, UPDATE, DELETE ON arquivos_indexados,
                                        arquivos_orfaos TO indexer_worker;
GRANT SELECT, INSERT, UPDATE ON indexacao_log TO indexer_worker;
GRANT SELECT, INSERT ON cron_heartbeats TO indexer_worker;

-- NEGAR explicitamente acesso a tabelas sensiveis
REVOKE ALL ON acesso_ficha, audit_log, postos_audit FROM indexer_worker;
```

**Service role do Supabase NUNCA é usada pelo sweep.** Aceita-se apenas a role `indexer_worker` acima. Tentar usar `service_role` aqui é violação de §6 e deve ser bloqueada em revisão.

### 6.4 Rotação de senha

Política: rotação **trimestral** (alinhada com `CRON_SECRET`, ver `vercel-cron.md` §6) ou imediata em caso de suspeita de vazamento.

Procedimento (~5 min, com janela de 1 sweep perdido):

```
1. Gerar nova senha (gerenciador de senhas, 32+ chars).
2. No painel Supabase: alterar senha da role indexer_worker.
3. Na maquina do runner:
   a. Editar C:\actions-runner\_work\.env.local com a nova senha.
   b. .\svc.cmd stop
   c. .\svc.cmd start
4. Disparar workflow_dispatch (Run workflow) com dry_run=true.
   Esperado: HTTP de heartbeat OK, dry-run conclui em ~10 min sem erro.
5. Registrar em CHANGELOG.md: "Sweep indexer: senha rotacionada YYYY-MM-DD".
```

---

## 7. Alertas

### 7.1 Alerta A4 (a criar em `alertas-siem.md`)

| Item | Valor |
|------|-------|
| ID | A4 |
| Nome | Sweep noturno do indexer ausente ou falhou |
| Critério | Não existe linha em `cron_heartbeats` com `job = 'indexer-sweep-noturno'`, `payload->>'fase' = 'fim'`, `payload->>'status' = 'ok'`, `ocorreu_em > NOW() - INTERVAL '36 hours'`. **OU** existe linha com `payload->>'status' = 'erro'` nas últimas 24h. |
| Janela | 36h (cobre 1 sweep diário + 12h de tolerância para investigação) |
| Severidade | P2 (operacional, sem impacto de UX imediato porque o lazy indexing cobre acessos por posto) |
| Canal | E-mail para Rafael (caixa institucional), painel `/admin/observabilidade` |
| Runbook de resposta | §7.3 deste documento |

### 7.2 Implementação

Duas opções, escolher uma na implementação:

| Opção | Prós | Contras |
|-------|------|---------|
| Query em `/api/health` que retorna `degraded` se A4 disparar | Sem infra extra, reaproveita health-check | E-mail exige integração com SendGrid/SES (não temos hoje) |
| Job adicional no workflow do GitHub (step "verificar alertas") roda 06h UTC e abre issue no repo se A4 disparar | Notificação por GitHub (Rafael já recebe), sem novo serviço de e-mail | Cria ruído de issues; mitigado com label `alerta-operacional` e auto-close ao recuperar |

Recomendação: **opção 2** (issue auto-aberta). É o menor custo de implementação e mantém auditoria no próprio GitHub.

### 7.3 Resposta a A4

```
1. Conferir o ultimo run no GitHub:
   Repositorio -> Actions -> Sweep Indexer -> ultimo run

2. Se status = failure:
   a. Ler logs do step que falhou.
   b. Se step "Validar acesso ao HD" falhou:
      - Conferir na maquina se Y: ainda esta mapeado: `dir Y:\`
      - Se nao: reaplicar net use (secao 5.2 passo 3)
   c. Se step "Sweep completo" falhou com OSError:
      - SMB instavel. Aguardar 1h e disparar workflow_dispatch.
      - Se reincidir, escalar para Rafael (provavel manutencao do servidor 10.20.40.9).
   d. Se step "Heartbeat" falhou:
      - Supabase fora ou pooler saturado. Conferir status.supabase.com.

3. Se status = success mas A4 disparou:
   - Verificar se o runner esta online: GitHub -> Settings -> Actions -> Runners
   - Status esperado: Idle (verde). Se Offline: maquina desligada ou perdeu rede.

4. Em caso de duvida: disparar workflow_dispatch com dry_run=true para validar
   pipeline sem efeitos colaterais.

5. Documentar a ocorrencia em docs/incidentes/YYYY-MM-DD-sweep.md.
```

### 7.4 Limite de duração

Alerta secundário (A4.1, opcional na implementação): se um sweep durar **> 60 min** (4x a média histórica), enviar aviso de degradação. Pode indicar HD lento ou crescimento anormal de arquivos. Implementação trivial via query em `cron_heartbeats`:

```sql
SELECT duracao_ms
FROM cron_heartbeats
WHERE job = 'indexer-sweep-noturno'
  AND payload->>'fase' = 'fim'
  AND payload->>'status' = 'ok'
  AND duracao_ms > 60 * 60 * 1000
  AND ocorreu_em > NOW() - INTERVAL '24 hours';
```

---

## 8. LGPD e auditoria (cliente governo)

A regra `governo.md` exige audit trail explícito de quem dispara, quando e onde fica o log. Pontos de conformidade:

| Requisito | Onde fica registrado |
|-----------|----------------------|
| Quem disparou (humano ou cron) | `cron_heartbeats.payload->>'trigger'` (`schedule` ou `workflow_dispatch`); em caso de `workflow_dispatch`, o GitHub registra o usuário disparador no log do run, retido por 90 dias por padrão (estender para 400 dias em Settings → Actions → General → Retention) |
| Quando rodou | `cron_heartbeats.ocorreu_em` (fase início e fim) + log do GitHub Actions (timestamps de cada step) |
| O que foi feito | `indexacao_log` (uma linha por lote, com `escopo = 'sweep'`, `prefixo_alvo = NULL`, contagens, erros de amostra), payload do heartbeat final |
| Onde fica o log | (1) tabela `cron_heartbeats` no Supabase, retenção 7 dias por design da migration 0027; (2) tabela `indexacao_log`, retenção indefinida (audit trail), backup pelo Supabase PITR; (3) painel do GitHub Actions, retenção 90 dias (estender para 400) |
| Dado de cidadão acessado? | **Não**. O sweep lê apenas metadados de arquivo (path, tamanho, mtime). Conteúdo dos PDFs não é aberto. Sem dado pessoal trafegando. |

Cláusula a incluir em `docs/lgpd/registro-de-tratamentos.md` (se existir; senão, criar):

> O processo automatizado de indexação varre o diretório de documentos de campo do DAEE diariamente, registrando apenas metadados (nome, caminho, tamanho, data de modificação) dos arquivos para fins de organização e busca. Não há leitura de conteúdo nem extração de dados pessoais de cidadãos. O processo roda em máquina interna do DAEE, sem trânsito de dados para infraestrutura externa que não seja o banco operacional do sistema (Supabase, com cláusula contratual de processador).

### 8.1 Retenção dos logs do GitHub Actions

Por padrão, o GitHub retém logs por 90 dias. Para cliente governo, **estender para 400 dias** (limite do plano público), em:

```
Repositorio -> Settings -> Actions -> General -> Artifact and log retention
Setar: 400 days
```

---

## 9. Riscos e mitigações

| ID | Risco | Probabilidade | Impacto | Mitigação |
|----|-------|---------------|---------|-----------|
| R1 | Máquina interna do DAEE desligada ou sem rede no horário do cron | média | alta (sweep perde 1 dia) | Alerta A4 dispara em 36h. Operador reinicia máquina, runner volta automaticamente (serviço configurado em §5.1). Próximo cron diário recompõe. |
| R2 | Servidor SMB `10.20.40.9` indisponível ou lento | média | média | Timeout duro de 90 min no workflow. Step "Validar acesso ao HD" falha rápido (< 30s) se totalmente offline. Reagendar manualmente. |
| R3 | Token do runner vaza (arquivo `.credentials`) | baixa | alta (atacante registra novo runner com acesso ao repo) | `.gitignore` de §5.4. Pasta do runner com ACL restrita. Em caso de vazamento, regenerar token no portal do GitHub (passo: Settings → Actions → Runners → remover runner → cadastrar de novo). |
| R4 | Senha do `indexer_worker` vaza | baixa | média (atacante grava em `arquivos_indexados`, polui catálogo) | Role tem grants mínimos (§6.3), sem acesso a `acesso_ficha` nem `audit_log`. Rotação trimestral §6.4. Worker não conhece service role. |
| R5 | Crescimento do HD faz sweep ultrapassar 90 min | baixa | média | Timeout falha o run, A4 dispara. Resposta: aumentar `timeout-minutes` em PR rastreável. Se virar tendência, paralelizar varredura por subpasta (escopo futuro). |
| R6 | Dois sweeps disparados em paralelo (manual + schedule) | baixa | médio (lote final indefinido, registros se sobrepõem) | `concurrency.group` no workflow já bloqueia. O sweep manual entra na fila. |
| R7 | Alguém commita `.env.local` da máquina por engano em outro repo | baixa | alto (conn string vaza) | `.gitignore` global da máquina inclui `.env.local`. Pre-commit hook (já existe no projeto principal) bloqueia. |
| R8 | Migração de schema (`0028`) aplicada em prod sem o workflow estar pronto | baixa | baixo | Migration adiciona valor ao CHECK, é backward-compatible. Run antigo continua válido. |
| R9 | GitHub Actions cai globalmente | muito baixa | médio (sweep não roda) | Aceitar; A4 cobre. Disparo manual via `python -m ops.indexer.index_fs` no console da máquina permanece como fallback documentado. |
| R10 | Usuário do GitHub com acesso `write` ao repo edita o workflow para exfiltrar dado | baixa | alto | Branch protection em `main` (já configurado). Requerer revisão de PR para `.github/workflows/**`. Adicionar CODEOWNERS para que workflow só seja modificado com aprovação de Rodrigo ou Rafael. |

---

## 10. Estimativa de effort

Estimativa em dias-PO úteis, post-aprovação do desenho.

| Atividade | PO | Dias | Observação |
|-----------|----|------|------------|
| Criar `ops/indexer/heartbeat.py` (CLI que grava linha em `cron_heartbeats`) | Lucas | 0,5 | Reaproveita `psycopg` e `structlog` já em uso |
| Ajustar `ops/indexer/index_fs.py` para retornar `lote_indexacao` em stdout estruturado, consumido pelo step seguinte | Lucas | 0,5 | Hoje imprime relatório JSON, falta expor lote como artifact |
| Migration `0028_cron_heartbeats_sweep.sql` | Lucas | 0,25 | Idempotente, segue padrão do projeto |
| Migration `0029_role_indexer_worker.sql` | Lucas + André (review) | 0,5 | Grants mínimos, validar com André contra OWASP A01 (broken access control) |
| Workflow `sweep-indexer.yml` | Rodrigo | 0,5 | Conforme §3 |
| Instalação e configuração do runner na máquina do DAEE | Rodrigo + Rafael (acesso físico) | 1,0 | Inclui validar SMB, criar usuário de serviço, configurar serviço, testar dry-run end-to-end |
| Alerta A4 (issue auto-aberta) | Rodrigo | 0,5 | Step adicional no workflow ou workflow separado |
| Atualização de `docs/runbooks/alertas-siem.md` com A4 | Marina | 0,25 | Seguir formato existente |
| Atualização de `docs/lgpd/registro-de-tratamentos.md` | Marina | 0,25 | Cláusula de §8 |
| QA: validar 3 sweeps consecutivos (1 schedule, 2 dispatch) | Thiago | 0,5 | Confere heartbeats, indexacao_log, status no painel |
| Revisão de segurança (vazamento de secrets, ACL do `.env.local`, role grants) | André | 0,5 | Vistar antes de habilitar schedule em prod |
| **Total** | | **5,25** | Sprint de uma semana com paralelismo entre POs |

Caminho crítico: **Rodrigo + Rafael juntos** no setup do runner (1 dia presencial ou remoto com acesso à máquina do DAEE). Sem isso, nada destrava.

---

## 11. Checklist para Rafael configurar no GitHub e na máquina

Pré-requisitos antes da implementação começar:

### 11.1 No repositório GitHub

- [ ] Confirmar que o repo é privado (necessário porque o workflow expõe label do runner e nome da máquina interna).
- [ ] Branch protection em `main` ativa, exigindo PR review para mudanças em `.github/workflows/**`.
- [ ] Criar `CODEOWNERS` (ou atualizar o existente) com a linha:
  ```
  /.github/workflows/sweep-indexer.yml @rafaelstn @<usuario-rodrigo>
  ```
- [ ] Em `Settings → Actions → General`:
  - [ ] Allow actions and reusable workflows: marcar "Allow <owner>, and select non-<owner>, actions and reusable workflows".
  - [ ] Permitir `actions/checkout`, `actions/setup-python`.
  - [ ] Workflow permissions: `Read repository contents permission` (sem write).
- [ ] Em `Settings → Actions → General → Artifact and log retention`:
  - [ ] Setar 400 dias (cliente governo).
- [ ] Em `Settings → Actions → Runners`:
  - [ ] Registrar runner com label `spaguas-daee-hd` (procedimento em §5.1).

### 11.2 GitHub Secrets

**Não criar nenhum secret no GitHub.** A estratégia de §6 mantém credenciais na máquina local.

Se em algum momento for necessário um secret (por exemplo, token de webhook para alerta), criar como **Repository secret** com nome prefixado `SWEEP_*`, e nunca como Organization secret (escopo desnecessário).

### 11.3 Permissões do runner na máquina

- [ ] Usuário de serviço Windows dedicado, sem privilégio de domínio, sem direito de logon interativo (ou apenas o mínimo para `cmdkey` e mapeamento inicial).
- [ ] Pertence ao grupo `Log on as a service` (Local Security Policy → User Rights Assignment).
- [ ] Permissão `read` em `\\10.20.40.9\dhp`.
- [ ] Sem permissão administrativa na máquina (princípio do menor privilégio).
- [ ] Senha armazenada apenas em gerenciador de senhas (1Password, Bitwarden, etc.). Não documentar em runbook nem em ticket.

### 11.4 Banco Supabase

- [ ] Aplicar migration `0028` (CHECK do `cron_heartbeats`).
- [ ] Aplicar migration `0029` (role `indexer_worker`).
- [ ] Validar grants com `\du indexer_worker` e `\dp arquivos_indexados`.
- [ ] Gerar senha forte para `indexer_worker` (32+ chars, gerenciador de senhas).
- [ ] Repassar conn string para Rodrigo via canal seguro (não e-mail puro, não Slack público).

### 11.5 Validação final (antes de habilitar schedule)

- [ ] Workflow disparado via `workflow_dispatch` com `dry_run = true` completa em < 20 min, status success.
- [ ] `cron_heartbeats` recebe 2 linhas (início e fim) para o run.
- [ ] `indexacao_log` **não** recebe linha (porque dry-run não persiste).
- [ ] Workflow disparado via `workflow_dispatch` com `dry_run = false` completa, status success.
- [ ] `indexacao_log` recebe 1 linha com `status = 'ok'`, `escopo = 'sweep'`.
- [ ] Painel administrativo (Sprint correspondente) mostra o sweep no histórico.
- [ ] Simular falha (parar serviço Supabase via firewall por 1 min durante o sweep): workflow falha, heartbeat de erro grava, alerta A4 dispara.
- [ ] Operador consegue ler runbook e responder ao alerta sem assistência externa em < 15 min.

Apenas após todos os itens acima é que o `schedule: "0 4 * * *"` deve ser habilitado (até a validação completar, manter o workflow só com `workflow_dispatch`).

---

## 12. Pendências e decisões em aberto

| Pendência | Owner | Bloqueia |
|-----------|-------|----------|
| Aprovação do desenho por Rafael | Rafael | Início da implementação |
| Confirmação da máquina alvo (nome de host, usuário de serviço existente?) | Rafael + DAEE | §5 (setup do runner) |
| Confirmação do horário 01h BRT como janela aceitável de uso do HD | Rafael (alinhar com DAEE) | §2 (cron schedule) |
| Escolha entre opção 1 ou 2 de alerta (§7.2) | Rodrigo + Rafael | §7 (implementação do alerta) |
| Existência de `docs/lgpd/registro-de-tratamentos.md` | Marina | §8 (cláusula LGPD) |
| Criação de caixa institucional para receber alertas (se opção 1) | Paula | §7 (canal) |

---

## 13. Quando arquivar este runbook

Quando a automação estiver estabilizada em produção (≥ 30 dias de operação sem incidente bloqueante), promover este documento de "DESENHO PROPOSTO" para "ATIVO":

1. Remover o badge de status DESENHO da tabela de cabeçalho.
2. Atualizar a seção §12 (pendências) para "nenhuma".
3. Adicionar seção §14 "Histórico de execuções relevantes" (incidentes, mudanças de schedule, etc.).
4. Notificar Rafael e Marina (Marina atualiza índice de runbooks).

Se a automação for desativada (por mudança de stack do cliente, por exemplo), mover para `docs/runbooks/_arquivados/` com nota de "substituído por <documento> em YYYY-MM-DD".

---

**Rodrigo, PO DevOps, Damasceno Dev OS, 2026-05-14**
