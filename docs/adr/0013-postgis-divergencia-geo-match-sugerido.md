# ADR-0013, PostGIS para divergência geográfica e match assistido

| Campo | Valor |
|-------|-------|
| Status | Aceito (retroativo) |
| Data | 2026-05-18 |
| Decisor | Rafael Damasceno (proprietário) |
| Escopo | Banco (extensão PostGIS), módulo Inventário ANA, telas de edição/auditoria |

---

## 1. Contexto

O snapshot da ANA traz, para cada estação, latitude/longitude declarados e nome do município. A planilha original (~11k linhas) tem ~7% de divergências entre o município declarado e o município geográfico real da coordenada. O time precisa detectar essas divergências automaticamente e sugerir, quando possível, qual posto SP corresponde à estação ANA.

Sem PostGIS, qualquer cálculo de "ponto dentro do polígono" do município ou distância entre estação e posto teria que rodar fora do banco, em Python ou TS, com I/O por linha. Inviável para o volume.

Migrations envolvidas (todas aplicadas):
- 0030: instala PostGIS, cria `ibge_municipios_sp` (multipolígonos IBGE), índice GIST geom.
- 0033: adiciona `divergencia_municipio` e `distancia_municipio_m` em `postos`, função `recalcular_divergencia_municipio_posto()`.
- 0035 a 0037: coordenada sugerida e função `mover_coord_para_municipio_correto_inteligente()`.
- 0038: campos `match_sugerido_posto_id`, `match_sugerido_score`, `match_sugerido_confianca` em `ana_revisao_estacao`.

## 2. Decisão

PostGIS é dependência obrigatória do banco. As funções stored procedures coabitam com a Clean Architecture do backend (use cases leem o resultado, não chamam a heurística diretamente).

Divergência é classificada em 3 estados:
- `correto`: coordenada dentro do polígono IBGE do município declarado.
- `divergente`: coordenada cai em outro município (distância > 1 km do limite declarado).
- `borda`: coordenada no limite (< 1 km), classificado separadamente para evitar falso positivo em estações de cabeceira de rio.

Match sugerido entre estação ANA e posto SP combina:
- Distância haversine (peso 0.6).
- Similaridade do nome (peso 0.3, trigram via pg_trgm).
- Match de código adicional (peso 0.1, quando existe).

Score normalizado em [0, 1]. Confiança discreta (`alta`, `media`, `baixa`) a partir do score.

## 3. Consequências

- Lock-in moderado em PostGIS. Migração para banco sem suporte exigiria reescrever as funções em código de aplicação ou usar serviço externo (Mapbox, Nominatim).
- Tempo de carga das migrations cresceu (PostGIS demora ~10 s pra instalar em projeto novo). Aceito, é one-shot.
- Backend não chama essas funções dentro do hot path da listagem. Recálculo é disparado por triggers em UPDATE de `postos.latitude/longitude` e em INSERT/UPDATE em `ana_revisao_estacao.latitude/longitude`.

## 4. Alternativas consideradas

- Cálculo em aplicação (TS) usando turf.js: viável mas exige carregar GeoJSON IBGE em memória do server (~30 MB) em cold start. Pior para Vercel.
- Serviço externo (Nominatim, Mapbox Geocoding): latência por chamada inaceitável em batch de 11k linhas. Custo recorrente.
