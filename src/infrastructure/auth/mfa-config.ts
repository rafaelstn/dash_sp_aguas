/**
 * Configuracao global da obrigatoriedade de MFA.
 *
 * Por padrao MFA e OBRIGATORIO para aprovadores (decisao #2 da Fase 2.A,
 * ADR-0008, regra governo.md). A flag `MFA_OPCIONAL_HOMOLOGACAO=true` libera
 * temporariamente as 3 camadas de defesa para permitir teste end-to-end em
 * ambiente de homologacao SEM exigir QR code + app autenticador.
 *
 * CRITICO: a flag SOMENTE deve ficar ligada em ambiente de homologacao /
 * pre-producao. Antes do go-live com o cliente, REMOVER a env var da Vercel
 * (Settings > Environment Variables) e validar que aprovador volta a precisar
 * de MFA. Ver ADR-0009.
 */
export function mfaObrigatorio(): boolean {
  return process.env.MFA_OPCIONAL_HOMOLOGACAO !== 'true';
}
