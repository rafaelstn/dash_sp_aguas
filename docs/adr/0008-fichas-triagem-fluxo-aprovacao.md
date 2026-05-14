# ADR-0008 — Tabela de triagem (`fichas_triagem`) e fluxo de aprovação

| Campo | Valor |
|-------|-------|
| Status | Aceito 2026-05-08; ajustado em implementação na mesma data; §2.3 (MFA obrigatório) **superseded pelo ADR-0010 em 2026-05-14** |
| Autor | Damasceno Dev OS (Bruno — Engenharia; Lucas — Backend revisou na implementação) |
| Contexto | Módulo mobile do Sistema de Ficha Técnica de Postos Hidrológicos SPÁguas — Fase 2.A |
| Complementa | ADR-0007 (PWA + Capacitor); migration `0022_fichas_visita.sql` |
| Substitui | nada (cria estrutura nova) |
| Referências | `docs/spec-modulo-mobile.md §4`; `docs/seguranca/checklist-modulo-mobile.md`; migrations `0023`–`0026` |

> **Atualização 2026-05-08 (pós-implementação Sprint 1):** ao implementar, Lucas
> tomou 4 decisões autônomas que ajustam este ADR. Estão consolidadas na
> **§9 Decisões da implementação** (final do documento). O texto principal
> abaixo permanece como contexto e justificativa originais; quando houver
> divergência, §9 prevalece.

---

## 1. Contexto

A migration 0022 criou `fichas_visita` como destino final das fichas de campo digitalizadas. A tabela aceita status `rascunho | enviada | aprovada` e prevê `tecnico_id` (FK opcional pra `auth.users`) — o esqueleto está pronto.

A constraint do Rafael para a Fase 2.A redefine o fluxo: **a ficha enviada pelo app móvel não entra em `fichas_visita` direto.** Antes precisa passar por **triagem** feita por agente aprovador na web. Apenas após aprovação manual a ficha é promovida pra `fichas_visita`.

Isso resolve dois problemas:

1. **Integridade da base de produção**: `fichas_visita` é lido pelo dashboard de consulta (Fase 1) e por relatórios. Não pode receber dado não revisado.
2. **Controle de qualidade humano**: o aprovador filtra erros de digitação, GPS errado, ficha em posto errado, antes de virar dado oficial.

A solução exige uma tabela separada com **ciclo de vida próprio** (5 estados, máquina de transições) + tabela de auditoria de eventos.

## 2. Decisão

Criar duas tabelas novas + ajustar `fichas_visita` para conter rastreabilidade da promoção.

### 2.1 Tabela `fichas_triagem`

Schema canônico (será gerado em `supabase/migrations/0023_fichas_triagem.sql`):

```sql
CREATE TABLE IF NOT EXISTS fichas_triagem (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  prefixo             VARCHAR(32)  NOT NULL REFERENCES postos (prefixo) ON UPDATE CASCADE,
  cod_tipo_documento  SMALLINT     NOT NULL REFERENCES tipos_documento (codigo),

  data_visita         DATE         NOT NULL,
  hora_inicio         TIME         NULL,
  hora_fim            TIME         NULL,

  -- Identificação do técnico (autor)
  tecnico_id          UUID         NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  tecnico_nome        TEXT         NOT NULL,  -- snapshot do nome no momento do envio

  -- GPS capturado pelo dispositivo
  latitude_capturada  NUMERIC(10,7) NULL,
  longitude_capturada NUMERIC(10,7) NULL,
  precisao_gps_m      NUMERIC(8,2)  NULL,

  observacoes         TEXT         NULL,
  dados               JSONB        NOT NULL DEFAULT '{}'::jsonb,

  origem              VARCHAR(16)  NOT NULL DEFAULT 'app_campo',

  -- Ciclo de vida
  status              VARCHAR(16)  NOT NULL DEFAULT 'pendente',
  revisor_id          UUID         NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  revisor_lock_expira_em TIMESTAMPTZ NULL,
  motivo_decisao      TEXT         NULL,
  ficha_visita_id     UUID         NULL REFERENCES fichas_visita (id) ON DELETE SET NULL,

  criada_em           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizada_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  decidida_em         TIMESTAMPTZ  NULL,

  CONSTRAINT chk_fichas_triagem_origem
    CHECK (origem IN ('app_campo', 'web_simulada', 'importacao')),
  CONSTRAINT chk_fichas_triagem_status
    CHECK (status IN ('pendente', 'em_revisao', 'aprovada', 'rejeitada', 'devolvida')),
  CONSTRAINT chk_fichas_triagem_lock
    CHECK (
      (status = 'em_revisao' AND revisor_id IS NOT NULL AND revisor_lock_expira_em IS NOT NULL)
      OR (status <> 'em_revisao')
    ),
  CONSTRAINT chk_fichas_triagem_aprovada
    CHECK (
      (status = 'aprovada' AND ficha_visita_id IS NOT NULL AND decidida_em IS NOT NULL)
      OR (status <> 'aprovada')
    ),
  CONSTRAINT chk_fichas_triagem_motivo
    CHECK (
      (status IN ('rejeitada', 'devolvida') AND motivo_decisao IS NOT NULL AND length(motivo_decisao) >= 20)
      OR (status NOT IN ('rejeitada', 'devolvida'))
    ),
  CONSTRAINT chk_fichas_triagem_horas
    CHECK (hora_fim IS NULL OR hora_inicio IS NULL OR hora_fim >= hora_inicio)
);

CREATE INDEX idx_fichas_triagem_status_criada ON fichas_triagem (status, criada_em DESC);
CREATE INDEX idx_fichas_triagem_tecnico ON fichas_triagem (tecnico_id, criada_em DESC);
CREATE INDEX idx_fichas_triagem_revisor ON fichas_triagem (revisor_id) WHERE revisor_id IS NOT NULL;
CREATE INDEX idx_fichas_triagem_lock ON fichas_triagem (revisor_lock_expira_em)
  WHERE status = 'em_revisao';

CREATE TRIGGER fichas_triagem_atualizada_em
BEFORE UPDATE ON fichas_triagem
FOR EACH ROW EXECUTE FUNCTION trg_fichas_visita_atualizada_em();  -- reusa função da migration 0022

REVOKE UPDATE, DELETE ON fichas_triagem FROM PUBLIC;  -- só backend via service role
```

Notas:

- `tecnico_id NOT NULL` — ao contrário de `fichas_visita.tecnico_id`, aqui é obrigatório. Submissão sem técnico identificado é proibida (auth é obrigatória pro app).
- `tecnico_nome TEXT` — snapshot do nome no momento do envio. Se o técnico for desligado, o nome permanece visível no histórico.
- `precisao_gps_m` — campo novo (não existe em `fichas_visita`). Aprovador usa pra avaliar confiabilidade da localização.
- `ficha_visita_id` — null até aprovação; preenchido na transação atômica de promoção.
- `revisor_lock_expira_em` — TTL de 30min pra liberação automática (job de cron Vercel).
- Constraints garantem invariantes do ciclo de vida.
- REVOKE evita modificação direta — toda transição passa pelo backend.

### 2.2 Tabela `triagem_eventos` (audit trail)

```sql
CREATE TABLE IF NOT EXISTS triagem_eventos (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  ficha_triagem_id  UUID         NOT NULL REFERENCES fichas_triagem (id) ON DELETE RESTRICT,
  evento            VARCHAR(32)  NOT NULL,
  status_anterior   VARCHAR(16)  NULL,
  status_novo       VARCHAR(16)  NULL,
  usuario_id        UUID         NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  motivo            TEXT         NULL,
  ip                INET         NULL,
  user_agent        TEXT         NULL,
  criado_em         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_triagem_eventos_evento
    CHECK (evento IN (
      'enviada',
      'revisao_iniciada',
      'revisao_liberada',
      'aprovada',
      'rejeitada',
      'devolvida',
      're_enviada',
      'lock_expirado'
    ))
);

CREATE INDEX idx_triagem_eventos_ficha ON triagem_eventos (ficha_triagem_id, criado_em);
CREATE INDEX idx_triagem_eventos_usuario ON triagem_eventos (usuario_id, criado_em DESC);

REVOKE UPDATE, DELETE ON triagem_eventos FROM PUBLIC;
```

Append-only por convenção + REVOKE. Mesmo padrão de `acesso_ficha` da Fase 1 (LGPD).

### 2.3 Papel de aprovador (RBAC mínimo)

Sem schema RBAC completo (overkill pra 3–8 aprovadores). Decisão:

- Tabela nova `usuarios_papeis` com (`usuario_id UUID PK`, `aprovador BOOLEAN DEFAULT false`, `mfa_obrigatorio BOOLEAN DEFAULT false`, `criado_em`, `atualizado_em`).
- Função SQL `eh_aprovador(uuid) RETURNS BOOLEAN` consultada pelo backend antes de qualquer ação de triagem.
- Ativação manual no painel Supabase pelo Rafael ou via comando admin do Rodrigo.
- Constraint: aprovadores **devem ter MFA habilitado** (validado em runtime via `aal2` do Supabase Auth — ver ADR-0008-A do André).

Decisão deliberada de **não criar enum complexo** (`leitor`, `editor`, `aprovador`). Tem 1 papel especial — `aprovador`. Resto é "usuário comum". Quando crescer (Fase 3), refatora pra enum.

### 2.4 Promoção `fichas_triagem` → `fichas_visita`

Transação atômica no backend:

```ts
// pseudo-código no use case `aprovarTriagem`
await sql.begin(async (tx) => {
  // 1. trava a linha pra evitar double-aprovação
  const [t] = await tx`
    SELECT * FROM fichas_triagem
    WHERE id = ${id} AND status = 'em_revisao' AND revisor_id = ${aprovadorId}
    FOR UPDATE`;
  if (!t) throw new ConflictError('Ficha não está em revisão por você');

  // 2. valida posto ativo
  const [p] = await tx`SELECT ativo FROM postos WHERE prefixo = ${t.prefixo}`;
  if (!p?.ativo) throw new BusinessError('Posto descomissionado');

  // 3. cria em fichas_visita
  const [fv] = await tx`
    INSERT INTO fichas_visita (
      prefixo, cod_tipo_documento, data_visita, hora_inicio, hora_fim,
      tecnico_nome, tecnico_id,
      latitude_capturada, longitude_capturada,
      observacoes, dados,
      origem, status
    ) VALUES (
      ${t.prefixo}, ${t.cod_tipo_documento}, ${t.data_visita}, ${t.hora_inicio}, ${t.hora_fim},
      ${t.tecnico_nome}, ${t.tecnico_id},
      ${t.latitude_capturada}, ${t.longitude_capturada},
      ${t.observacoes}, ${t.dados},
      ${'app_campo'}, ${'aprovada'}
    ) RETURNING id`;

  // 4. atualiza fichas_triagem
  await tx`
    UPDATE fichas_triagem
    SET status = 'aprovada', ficha_visita_id = ${fv.id}, decidida_em = NOW()
    WHERE id = ${id}`;

  // 5. registra evento
  await tx`
    INSERT INTO triagem_eventos
      (ficha_triagem_id, evento, status_anterior, status_novo, usuario_id, ip, user_agent)
    VALUES (${id}, 'aprovada', 'em_revisao', 'aprovada', ${aprovadorId}, ${ip}, ${ua})`;
});
```

Tudo ou nada. Idempotência via UNIQUE em `(ficha_triagem_id) WHERE status = 'aprovada'` implícito pelo lock.

### 2.5 Liberação de lock por TTL

Job cron (Vercel Cron ou similar — Rodrigo escolhe) que roda a cada 5 minutos:

```sql
WITH liberadas AS (
  UPDATE fichas_triagem
  SET status = 'pendente', revisor_id = NULL, revisor_lock_expira_em = NULL
  WHERE status = 'em_revisao' AND revisor_lock_expira_em < NOW()
  RETURNING id, revisor_id
)
INSERT INTO triagem_eventos (ficha_triagem_id, evento, status_anterior, status_novo, usuario_id, motivo)
SELECT id, 'lock_expirado', 'em_revisao', 'pendente', revisor_id, 'TTL 30min sem ação'
FROM liberadas;
```

### 2.6 RLS no Supabase

Banco continua acessado **só pelo backend** via service role (ADR-0002). Sem RLS por usuário no MVP, exceto `usuarios_favoritos` (já existente, ADR-0005).

Razão: o app móvel **não fala direto com o Supabase** — sempre passa pelos endpoints `/api/*` da Vercel. Não há leitura/escrita de cliente direto. Adicionar RLS seria proteção dupla mas com manutenção alta. Mantida a postura da Fase 1.

## 3. Alternativas consideradas

| Alternativa | Por que rejeitada |
|-------------|-------------------|
| Reusar `fichas_visita` com status novos (`pendente`, `em_revisao` etc) | Polui a tabela de produção, dashboard de consulta passaria a ter que filtrar por status, impacto em índices e queries. Risco muito alto. |
| Coluna `aprovacao_status` em `fichas_visita` + soft-state | Mesma crítica acima — mistura cycle-of-life com tabela de leitura. |
| Fila de mensagens (SQS, etc) entre app e produção | Overkill — temos SLA humano, não real-time. Ferramenta errada pro problema. |
| RLS no Supabase pro app falar direto | Quebra ADR-0002 (sem `supabase-js` nas camadas internas). Acopla domínio à API proprietária. |
| Schema RBAC completo com enum de papéis | Overkill no MVP. 1 papel especial, dados ad-hoc. Refatora quando crescer. |
| Triagem por aprovação automática (sem humano) | Não atende constraint do Rafael — Rafael pediu aprovador humano explícito. |

## 4. Consequências

### 4.1 Positivas

- **Separação clara**: tabela de produção (`fichas_visita`) lida pelo dashboard nunca recebe dado não-revisado.
- **Audit trail completa**: toda transição é evento, recuperável pra qualquer ficha (LGPD + governança).
- **Promoção atômica**: garantia de invariante "ficha aprovada ⇔ existe em `fichas_visita`".
- **Lock por TTL** evita ficha "presa" se aprovador esquece a aba aberta.
- **REVOKE em ambas as tabelas** força toda escrita pelo backend — superfície de ataque reduzida.

### 4.2 Negativas / trade-offs

- **Duas tabelas pra mesmo "domínio"** — convivem `fichas_triagem` e `fichas_visita`. Separação é o ponto, mas exige documentação clara (Marina) e UI que não confunde aprovador.
- **Job cron novo** pra TTL — peça de operação que pode falhar silenciosamente. Mitigação: alerta de monitoria (Rodrigo), heartbeat checkable em `/api/health`.
- **Snapshots `tecnico_nome`** podem desatualizar se o usuário mudar nome. Aceitável — campo de auditoria histórica.
- **Idempotência de `re_enviada`**: técnico edita e re-envia → mesmo `id` volta pra `pendente`. Backend tem que validar status atual `devolvida` antes de aceitar update.

### 4.3 Impacto operacional

- **Migrations novas**:
  - `supabase/migrations/0023_fichas_triagem.sql` — tabela principal + constraints + índices + REVOKE.
  - `supabase/migrations/0024_triagem_eventos.sql` — audit log.
  - `supabase/migrations/0025_usuarios_papeis.sql` — RBAC mínimo + função `eh_aprovador`.
  - `supabase/migrations/0026_fichas_visita_origem_app_campo.sql` — atualizar CHECK de `origem` se ainda restritivo (já aceita `app_campo`, conferir).
- **Use cases novos** (Lucas):
  - `application/use-cases/triagem/criarFichaTriagem.ts` (POST do app)
  - `application/use-cases/triagem/iniciarRevisao.ts` (lock)
  - `application/use-cases/triagem/aprovarTriagem.ts` (transação atômica)
  - `application/use-cases/triagem/rejeitarTriagem.ts`
  - `application/use-cases/triagem/devolverTriagem.ts`
  - `application/use-cases/triagem/reEnviarTriagem.ts`
  - `application/use-cases/triagem/liberarLocksExpirados.ts` (cron)
  - `application/use-cases/triagem/listarMinhasFichas.ts` (técnico)
  - `application/use-cases/triagem/listarFilaTriagem.ts` (aprovador)
- **Endpoints novos** (`src/app/api/triagem/...`):
  - `POST /api/triagem/fichas` — técnico envia
  - `GET /api/triagem/fichas` — aprovador lista (filtros)
  - `GET /api/triagem/fichas/:id` — detalhe
  - `POST /api/triagem/fichas/:id/iniciar-revisao`
  - `POST /api/triagem/fichas/:id/aprovar`
  - `POST /api/triagem/fichas/:id/rejeitar`
  - `POST /api/triagem/fichas/:id/devolver`
  - `GET /api/triagem/minhas-fichas` — técnico lista as próprias
  - `POST /api/triagem/cron/liberar-locks` — cron protegido por secret
- **Frontend web** (Fernanda): `/triagem` (lista), `/triagem/[id]` (detalhe + ações).
- **Migration de existing fichas**: nenhuma. Fichas já em `fichas_visita` com `origem='web_simulada'` ficam intactas. App novo só alimenta `fichas_triagem`.

## 5. Como rolar back

1. `DROP TABLE triagem_eventos;`
2. `DROP TABLE fichas_triagem;`
3. `DROP TABLE usuarios_papeis;`
4. `DROP FUNCTION eh_aprovador;`
5. Remover endpoints `/api/triagem/*` e use cases.
6. Remover tela `/triagem`.

`fichas_visita` permanece intacta. Reversibilidade total.

## 6. Status de execução

- [ ] Migrations 0023–0026 escritas
- [ ] Use cases backend (Lucas)
- [ ] Endpoints `/api/triagem/*` (Lucas)
- [ ] Tela `/triagem` (Fernanda)
- [ ] Job cron de liberação de lock (Rodrigo)
- [ ] Testes — feliz + edge (Thiago)

## 7. Pendências

- [ ] Decisão: papel `aprovador` setado por painel Supabase ou comando admin? (operacional — Rodrigo)
- [x] **Resolvido 2026-05-08:** TTL de lock = 1 hora (decisão Rafael, ver `memory/decisoes_fase_2a.md` #5).
- [x] **Resolvido 2026-05-08:** ficha aprovada não reabre — cria substituição via `substitui_ficha_id`, coluna adicionada em `fichas_visita` na migration `0024` (decisão Rafael, ver `memory/decisoes_fase_2a.md` #4).

---

## 8. Pendências de hardening (abertas)

- [ ] **Endurecer schema dinâmico de payload** (`construirSchemaZod`): hoje o `dados` da ficha usa `.passthrough()` no fluxo de triagem. Endurecer pra `.strict()` exige varredura dos `secoes[].campos[].codigo` em `src/domain/fichas/schemas.ts` para confirmar cobertura. Owner: André + Lucas — meta Sprint 1.5.
- [ ] **Suite de testes unitários do domínio** (`podeTransitar`, `MotivoDecisao`, regras de negócio dos use cases). Owner: Thiago — Sprint 1.5.
- [ ] **Pen-test do fluxo**: race em iniciar revisão, IDOR cross-aprovador, cron forjado, promoção atômica com falha no meio. Owner: Thiago + André — Sprint 2.
- [ ] **Vercel Cron + alerta de heartbeat** para `/api/cron/liberar-locks-expirados` (5min de cadência). Owner: Rodrigo — Sprint 4.

---

## 9. Decisões da implementação (Lucas, 2026-05-08)

Ajustes ao desenho original feitos durante a entrega da Sprint 1 backend. Cada um traz contexto pra futuros leitores entenderem por que o código não bate exatamente com §2.

### 9.1 Tabela `triagem_locks` separada (não inline em `fichas_triagem`)

**Original (§2.1):** colunas `lock_aprovador_id` e `lock_expira_em` inline em `fichas_triagem`.

**Implementado:** tabela própria `triagem_locks` (migration `0026`) com `UNIQUE(triagem_id)` e `expira_em`.

**Por quê:** com a UNIQUE explícita, a corrida entre dois aprovadores tentando iniciar revisão é detectada pelo driver via violação de constraint, em vez de exigir `FOR UPDATE` + checagem manual. Mais simples de raciocinar e mais difícil de errar. Custa uma tabela extra — vale a troca.

### 9.2 Re-envio após devolução cria NOVA linha (não reutiliza a devolvida)

**Original (§2.2):** `devolvida → pendente` no re-envio (mesma linha).

**Implementado:** re-envio cria nova linha em `fichas_triagem` com `ficha_origem_id` apontando pra original; a devolvida permanece imutável em estado `devolvida`. Use case dedicado `reenviarFichaTriagem`.

**Por quê:**
- Preserva linhagem auditável completa — quem devolveu, quando, motivo, e o que foi reenviado.
- Simplifica imutabilidade: nenhum registro muda de estado depois de chegar a estado terminal.
- Custo: ~1 linha extra por ciclo de devolução. Negligível.

A máquina de estados na §2.2 deve ser lida como "estados visíveis ao usuário"; internamente, `devolvida` é terminal.

### 9.3 Idempotência de submissão via UNIQUE composto

**Original:** não definido — o ADR §2.1 só listou a tabela; o checklist de André mencionou idempotency key.

**Implementado:** `UNIQUE(tecnico_id, idempotency_key)` parcial (`WHERE idempotency_key IS NOT NULL`) na `fichas_triagem`. App móvel envia header `Idempotency-Key` (UUID v4 gerado client-side). Use case `submeterFichaTriagem` faz lookup pela key antes do INSERT — se existe, devolve a ficha anterior sem 409. Erro `IdempotencyKeyDuplicada` reservado pra colisões de race onde key reusa com payload diferente.

**Por quê:** retransmissões de rede em campo (técnico com sinal ruim) não devem criar 2 fichas. UUID v4 client-side mais barato e suficientemente improvável de colidir.

### 9.4 `substitui_ficha_id` adicionado em `fichas_visita` agora

**Original (§7 pendência):** "campo `substitui_ficha_id` em ADR futuro".

**Implementado:** `ALTER TABLE fichas_visita ADD COLUMN substitui_ficha_id UUID NULL` já incluído na migration `0024`, com FK pra `fichas_visita(id)`.

**Por quê:** decisão #4 da Fase 2.A já amarra o comportamento de "criar substituição em vez de reabrir". Adicionar agora evita uma migration extra futura. Custo: zero — coluna nullable.

---

## 10. Status de execução (2026-05-08)

Implementação da Sprint 1 Semana 1 entregue por Lucas:

- Migrations `0023_usuarios_papeis.sql`, `0024_fichas_triagem.sql`, `0025_triagem_eventos.sql`, `0026_triagem_locks.sql` ✓
- Domínio puro (`src/domain/triagem.ts`, `src/domain/triagem-evento.ts`) ✓
- Ports (`triagem-repository.ts`, `papeis-repository.ts`) ✓
- Use cases em `src/application/use-cases/triagem/` ✓
- Implementação Postgres (`src/infrastructure/db/triagem-repository.pg.ts`, `papeis-repository.pg.ts`) ✓
- Mocks em memória (`src/infrastructure/mock/triagem-repository.mock.ts`, `papeis-repository.mock.ts`) ✓
- Endpoints HTTP em `src/app/api/{app/fichas, triagem, cron}/` ✓
- Rate limit Camada 1 in-memory (`src/infrastructure/security/rate-limit.ts`) ✓
- Audit trail emitido na mesma transação dos use cases mutadores ✓
- MFA enforcement em duas camadas (trigger SQL + runtime check) ✓
- Cenários de teste manual em `ops/testing/triagem-flow.http` ✓
- `tsc --noEmit` zerado, `npm run lint` zerado (warnings menores não-bloqueantes) ✓

Próximo: Sprint 1 Semana 2 — Fernanda implementa `/triagem` web consumindo os endpoints; André revisa OWASP nos endpoints prontos.
