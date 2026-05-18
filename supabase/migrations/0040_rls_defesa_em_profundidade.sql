-- =============================================================================
-- Migration 0040, Row Level Security como defesa em profundidade.
-- =============================================================================
-- Contexto: a auditoria pré compartilhamento com gestores Governo SP
-- (2026-05-18) identificou que apenas `postos_favoritos` tem RLS habilitada.
-- O backend Next aplica todos os checks de autorização na aplicação (guards
-- em routes/use cases, helpers em src/app/api/_helpers/auth.ts), mas o
-- modelo de defesa do governo exige uma segunda barreira: se a `anon key`
-- vazar, ou se alguém abrir o PostgREST direto, nada deve voltar.
--
-- Estratégia escolhida (deny by default):
--   1. Habilita RLS em todas as tabelas com dados de cidadão/operação.
--   2. NÃO cria policies para `anon` nem `authenticated`. Sem policy ⇒
--      deny total. Toda I/O do backend continua passando porque o role
--      `postgres` usado pelo pooler Supabase tem BYPASSRLS.
--   3. Tabelas operacionais sem PII (lookups, cache, etc.) seguem sem RLS
--      pra evitar friction. Listadas no final como decisão explícita.
--
-- Reversível: ALTER TABLE ... DISABLE ROW LEVEL SECURITY.
-- Idempotente: NOTICE inofensivo se já estiver habilitado.
-- =============================================================================

-- Cadastro de pessoas/usuários ---------------------------------------------
ALTER TABLE IF EXISTS usuarios_papeis ENABLE ROW LEVEL SECURITY;

-- Fichas de campo (origem do dado, possível PII em observações) ------------
ALTER TABLE IF EXISTS fichas_visita ENABLE ROW LEVEL SECURITY;

-- Triagem (workflow privilegiado, exige aprovador) -------------------------
ALTER TABLE IF EXISTS fichas_triagem ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS triagem_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS triagem_eventos ENABLE ROW LEVEL SECURITY;

-- Inventário ANA (auditoria sensível, decisões de promoção) ----------------
ALTER TABLE IF EXISTS ana_revisao_lote ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ana_revisao_estacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ana_revisao_evento ENABLE ROW LEVEL SECURITY;

-- Audit trails -------------------------------------------------------------
ALTER TABLE IF EXISTS postos_evento ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS acesso_ficha ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS revisoes_desconformidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS indexacao_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS import_log ENABLE ROW LEVEL SECURITY;

-- Heartbeats de cron (revelam segredo de operação) -------------------------
ALTER TABLE IF EXISTS cron_heartbeats ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Decisão explícita: as tabelas abaixo SEGUEM sem RLS.
--
--   postos                    : dados cadastrais públicos (governo abre dados)
--   arquivos_indexados        : metadados de arquivos públicos (idem)
--   arquivos_orfaos           : metadados públicos
--   tipos_documento           : lookup
--   tipos_dado                : lookup
--   postos_caminhos           : configuração interna sem PII
--   posto_indexacao_cache     : cache, recomputável
--   ibge_municipios_sp        : referência geográfica pública
--
-- Caso o cliente decida tornar `postos` privado em fase futura, basta
-- habilitar RLS nele aqui — defesa em profundidade já está no padrão.
-- =============================================================================

COMMENT ON TABLE usuarios_papeis IS
  'RBAC mínimo, flag aprovador por usuário. MFA removido (ADR-0010). RLS deny-by-default ativa em 2026-05-18 (defesa em profundidade).';
