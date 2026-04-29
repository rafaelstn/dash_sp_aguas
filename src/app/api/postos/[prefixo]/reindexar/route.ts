// Re-export do handler POST de `../route.ts`.
//
// O frontend (`BadgeIndexacao`) chama `POST /api/postos/{prefixo}/reindexar`,
// mas a rota canônica é `POST /api/postos/{prefixo}` — GET lê a ficha,
// POST força nova varredura. Este subpath `/reindexar` existe só pra tornar
// o contrato explícito pro cliente HTTP.
export { POST } from '../route';
export const runtime = 'nodejs';
