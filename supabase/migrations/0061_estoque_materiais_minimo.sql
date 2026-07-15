-- =============================================================================
-- Migration 0061, modulo Estoque: estoque minimo (nivel de reposicao) por material.
-- =============================================================================
-- Contexto: a tela de Estoque precisa sinalizar "abaixo do minimo" (reposicao)
-- para materiais QUANTIFICAVEIS. O saldo de um quantificavel e a soma de
-- estoque_saldos.quantidade por material (varios locais/tamanhos). "Abaixo do
-- minimo" = material quantificavel com quantidade_minima definida E saldo total
-- menor que a minima.
--
-- Modelagem: coluna nullable em estoque_materiais.
--   NULL  = sem minimo definido (default). NUNCA dispara alerta.
--   >= 0  = nivel de reposicao. Alerta quando saldo total < quantidade_minima.
-- So faz sentido em material quantificavel; em serializado a coluna fica NULL e
-- e ignorada pela regra (nao ha "quantidade" de serializado). Nao ha CHECK de
-- natureza de proposito: manter a coluna neutra evita acoplar a regra de negocio
-- ao schema (a regra vive no dominio, helper abaixoDoMinimo).
--
-- Sem indice: a marcacao "abaixo do minimo" e computada no cliente cruzando o
-- catalogo (que a tela ja carrega) com os saldos agrupados; nao ha filtro no
-- banco por esta coluna.
--
-- Aditiva, idempotente (ADD COLUMN IF NOT EXISTS), reversivel.
-- Reversao: ALTER TABLE estoque_materiais DROP COLUMN IF EXISTS quantidade_minima;
-- Depende de: 0056 (estoque_materiais).
-- =============================================================================

ALTER TABLE estoque_materiais
  ADD COLUMN IF NOT EXISTS quantidade_minima INTEGER NULL
    CHECK (quantidade_minima IS NULL OR quantidade_minima >= 0);

COMMENT ON COLUMN estoque_materiais.quantidade_minima IS
  'Nivel de reposicao (estoque minimo). NULL = sem minimo definido (nao dispara alerta). So faz sentido em material quantificavel; em serializado fica NULL e e ignorado. Alerta "abaixo do minimo" quando a soma de estoque_saldos.quantidade do material for menor que este valor.';
