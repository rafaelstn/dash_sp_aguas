import { describe, it, expect } from 'vitest';

import config from '../../../next.config';

/**
 * O Monitor foi fundido na tela Postos em 17/09/2026 e `/monitor` passou a
 * redirecionar. Esta régua existe porque a escolha entre 307 e 308 tem
 * consequência que não se desfaz: o 308 é permanente e o navegador o guarda em
 * cache sem voltar a perguntar ao servidor, então ele só pode entrar depois de
 * a descontinuação do detalhe por estação do SIBH estar decidida por escrito com
 * o órgão. Enquanto a decisão está aberta, `permanent` é `false`.
 *
 * O comentário em `next.config.ts` explica a razão; sem uma régua, o comentário
 * é só uma promessa, e a próxima pessoa troca por 308 sem saber o que custa.
 */
describe('redirect de /monitor', () => {
  it('aponta para a tela de Postos e NÃO é permanente', async () => {
    expect(typeof config.redirects).toBe('function');

    const redirects = await config.redirects!();
    const monitor = redirects.find((r) => r.source === '/monitor');

    expect(monitor, 'o redirect de /monitor precisa existir: link salvo e favorito ainda chegam').toBeDefined();
    expect(monitor!.destination).toBe('/');
    expect(monitor!.permanent).toBe(false);
  });
});
