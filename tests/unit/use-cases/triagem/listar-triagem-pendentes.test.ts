import { afterEach, describe, expect, it } from 'vitest';
import {
  listarTriagemPendentes,
  obterFichaTriagem,
} from '@/application/use-cases/triagem/listar-triagem-pendentes';
import { submeterFichaTriagem } from '@/application/use-cases/triagem/submeter-ficha-triagem';
import {
  triagemRepository,
  _resetTriagemMock,
} from '@/infrastructure/mock/triagem-repository.mock';
import { UsuarioNaoEhAprovador } from '@/domain/errors';
import {
  APROVADOR_A,
  META,
  TECNICO_ID_PADRAO,
  entradaSubmissaoValida,
  papeisFake,
} from './_helpers';

const TECNICO_INVASOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('use-case/listarTriagemPendentes', () => {
  afterEach(() => {
    _resetTriagemMock();
  });

  it('lista fichas pendentes para aprovador com permissão', async () => {
    await submeterFichaTriagem(triagemRepository, entradaSubmissaoValida(), META);
    await submeterFichaTriagem(triagemRepository, entradaSubmissaoValida(), META);
    const papeis = papeisFake({ aprovadores: [APROVADOR_A] });

    const r = await listarTriagemPendentes(triagemRepository, papeis, APROVADOR_A);
    expect(r.itens.length).toBe(2);
    expect(r.total).toBe(2);
  });

  it('rejeita usuário sem papel aprovador (UsuarioNaoEhAprovador)', async () => {
    const papeis = papeisFake({ aprovadores: [] });
    await expect(
      listarTriagemPendentes(triagemRepository, papeis, APROVADOR_A),
    ).rejects.toThrow(UsuarioNaoEhAprovador);
  });

  it('aplica filtros de tipo e prefixo', async () => {
    await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida({ prefixo: '3D-001', codTipoDocumento: 3 }),
      META,
    );
    await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida({
        prefixo: '3D-002',
        codTipoDocumento: 7,
        dados: { metodo_medicao: 'molinete' },
      }),
      META,
    );

    const papeis = papeisFake({ aprovadores: [APROVADOR_A] });
    const r = await listarTriagemPendentes(triagemRepository, papeis, APROVADOR_A, {
      prefixo: '3D-001',
    });
    expect(r.itens.length).toBe(1);
    expect(r.itens[0]!.prefixo).toBe('3D-001');
  });
});

describe('use-case/obterFichaTriagem (anti-IDOR)', () => {
  afterEach(() => {
    _resetTriagemMock();
  });

  it('aprovador acessa qualquer ficha', async () => {
    const ficha = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida(),
      META,
    );
    const papeis = papeisFake({ aprovadores: [APROVADOR_A] });

    const r = await obterFichaTriagem(triagemRepository, papeis, ficha.id, APROVADOR_A);
    expect(r?.id).toBe(ficha.id);
  });

  it('técnico dono acessa a própria ficha', async () => {
    const ficha = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida(),
      META,
    );
    const papeis = papeisFake({});

    const r = await obterFichaTriagem(
      triagemRepository,
      papeis,
      ficha.id,
      TECNICO_ID_PADRAO,
    );
    expect(r?.id).toBe(ficha.id);
  });

  it('técnico NÃO-dono recebe null (vira 404 no route handler) — bloqueio IDOR', async () => {
    const ficha = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida(),
      META,
    );
    const papeis = papeisFake({});

    const r = await obterFichaTriagem(
      triagemRepository,
      papeis,
      ficha.id,
      TECNICO_INVASOR,
    );
    expect(r).toBeNull();
  });

  it('ficha inexistente retorna null sem revelar oracle', async () => {
    const papeis = papeisFake({ aprovadores: [APROVADOR_A] });
    const r = await obterFichaTriagem(
      triagemRepository,
      papeis,
      '00000000-0000-4000-8000-000000000000',
      APROVADOR_A,
    );
    expect(r).toBeNull();
  });
});
