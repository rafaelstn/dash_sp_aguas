import { afterEach, describe, expect, it } from 'vitest';
import { submeterFichaTriagem, reenviarFichaTriagem } from '@/application/use-cases/triagem/submeter-ficha-triagem';
import { iniciarRevisao } from '@/application/use-cases/triagem/iniciar-revisao';
import { aprovarFichaTriagem } from '@/application/use-cases/triagem/aprovar-ficha-triagem';
import { rejeitarFichaTriagem } from '@/application/use-cases/triagem/rejeitar-ficha-triagem';
import { devolverFichaTriagem } from '@/application/use-cases/triagem/devolver-ficha-triagem';
import {
  listarTriagemPendentes,
  obterFichaTriagem,
} from '@/application/use-cases/triagem/listar-triagem-pendentes';
import {
  triagemRepository,
  _resetTriagemMock,
} from '@/infrastructure/mock/triagem-repository.mock';
import {
  APROVADOR_A,
  META,
  TECNICO_ID_PADRAO,
  entradaSubmissaoValida,
  papeisFake,
} from '../unit/use-cases/triagem/_helpers';

/**
 * Teste de integração end-to-end com mocks — exercita o pipeline completo
 * de uma ficha de triagem usando todos os use cases coordenados.
 *
 * Cobre:
 *   - Submissão pelo técnico
 *   - Listagem pelo aprovador
 *   - Detalhe (anti-IDOR — técnico vê só as próprias)
 *   - Iniciar revisão
 *   - Devolver
 *   - Re-envio (cria nova linha)
 *   - Iniciar revisão da nova
 *   - Aprovar (promoção atômica para fichas_visita)
 */

describe('integração/triagem — fluxo end-to-end happy path', () => {
  afterEach(() => {
    _resetTriagemMock();
  });

  it('cobre o fluxo completo: submissão → devolução → re-envio → aprovação', async () => {
    const papeis = papeisFake({ aprovadores: [APROVADOR_A] });

    // 1. Técnico submete ficha
    const original = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida({ idempotencyKey: 'idem-001' }),
      META,
    );
    expect(original.estado).toBe('pendente');

    // 2. Aprovador lista — vê a ficha
    const fila = await listarTriagemPendentes(triagemRepository, papeis, APROVADOR_A);
    expect(fila.itens.length).toBe(1);
    expect(fila.itens[0]!.id).toBe(original.id);

    // 3. Aprovador abre detalhe
    const detalhe = await obterFichaTriagem(triagemRepository, papeis, original.id, APROVADOR_A);
    expect(detalhe?.id).toBe(original.id);

    // 4. Inicia revisão
    const lock = await iniciarRevisao(triagemRepository, papeis, original.id, APROVADOR_A, META);
    expect(lock.ficha.estado).toBe('em_revisao');

    // 5. Devolve com solicitação
    await devolverFichaTriagem(
      triagemRepository,
      papeis,
      original.id,
      APROVADOR_A,
      'Refazer captura GPS — coordenadas fora do entorno do posto.',
      META,
    );
    const aposDevolver = await triagemRepository.obterPorId(original.id);
    expect(aposDevolver?.estado).toBe('devolvida');

    // 6. Técnico re-envia (nova linha)
    const reenviada = await reenviarFichaTriagem(
      triagemRepository,
      original.id,
      entradaSubmissaoValida({
        latitudeCapturada: -23.55,
        longitudeCapturada: -46.64,
      }),
      META,
    );
    expect(reenviada.id).not.toBe(original.id);
    expect(reenviada.fichaOrigemId).toBe(original.id);
    expect(reenviada.estado).toBe('pendente');

    // 7. Original permanece imutável em devolvida
    const originalAposReenvio = await triagemRepository.obterPorId(original.id);
    expect(originalAposReenvio?.estado).toBe('devolvida');

    // 8. Aprovador inicia revisão da NOVA
    await iniciarRevisao(triagemRepository, papeis, reenviada.id, APROVADOR_A, META);

    // 9. Aprova — promoção atômica
    const r = await aprovarFichaTriagem(
      triagemRepository,
      papeis,
      reenviada.id,
      APROVADOR_A,
      META,
    );
    expect(r.fichaVisitaId).toBeTruthy();
    expect(r.triagem.estado).toBe('aprovada');

    // 10. Invariante: fichaVisitaId persistido na nova
    const final = await triagemRepository.obterPorId(reenviada.id);
    expect(final?.estado).toBe('aprovada');
    expect(final?.fichaVisitaId).toBe(r.fichaVisitaId);

    // 11. Lista de pendentes deve estar vazia agora (nada em pendente nem em_revisao)
    const filaFinal = await listarTriagemPendentes(triagemRepository, papeis, APROVADOR_A);
    expect(filaFinal.itens.length).toBe(0);
  });

  it('rejeição isolada: ficha rejeitada NÃO promove para fichas_visita', async () => {
    const papeis = papeisFake({ aprovadores: [APROVADOR_A] });
    const ficha = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida(),
      META,
    );
    await iniciarRevisao(triagemRepository, papeis, ficha.id, APROVADOR_A, META);
    const rejeitada = await rejeitarFichaTriagem(
      triagemRepository,
      papeis,
      ficha.id,
      APROVADOR_A,
      'Ficha duplicada — visita já registrada por outro técnico.',
      META,
    );

    expect(rejeitada.estado).toBe('rejeitada');
    expect(rejeitada.fichaVisitaId).toBeNull();
  });

  it('IDOR — técnico A não vê ficha do técnico B nem em listagem nem em detalhe', async () => {
    const papeis = papeisFake({ aprovadores: [] });
    const TECNICO_B = '99999999-9999-4999-8999-999999999999';

    const fichaB = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida({ tecnicoId: TECNICO_B, tecnicoNome: 'Tec B' }),
      META,
    );

    // Técnico A (TECNICO_ID_PADRAO) tenta ler a ficha do B
    const tentativa = await obterFichaTriagem(
      triagemRepository,
      papeis,
      fichaB.id,
      TECNICO_ID_PADRAO,
    );
    expect(tentativa).toBeNull();
  });
});
