/**
 * `aceitar-match` do inventário ANA x a ORIGEM do cadastro de posto.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O DEFEITO QUE ESTE ARQUIVO FECHA
 * ─────────────────────────────────────────────────────────────────────────
 * `anaRevisaoRepository.aceitarMatch` escreve em DUAS tabelas na mesma
 * transação, e a primeira é `postos`:
 *
 *     SELECT id, prefixo_ana, deleted_at FROM postos WHERE prefixo = ... FOR UPDATE
 *     if (!posto) throw new PostoNaoEncontrado(...)      -> HTTP 404
 *     UPDATE postos SET prefixo_ana = ...
 *
 * Desde o ADR-0023 o cadastro é lido ao vivo do `Dbfch` e a nossa tabela
 * `postos` está VAZIA em produção. Com isso a rota fazia duas coisas erradas de
 * uma vez: respondia **404 para posto que existe** no órgão e, se achasse,
 * tentaria **escrever num cadastro que é somente leitura**.
 *
 * A decisão de produto é a mínima: com origem `dbfch` a rota responde
 * `EscritaIndisponivel` (501), o mesmo tratamento que criar, editar, remover e
 * restaurar posto já recebem. Nas outras duas origens nada muda, e isso não é
 * cautela: com origem `postgres` a tabela `postos` É o cadastro daquele
 * ambiente.
 *
 * `aceitar-match-atomico.test.ts` continua provando a transação do repositório,
 * que não foi tocada. Aqui se prova QUANDO ela pode ser chamada.
 */
import { describe, expect, it, vi } from 'vitest';
import { aceitarMatchAna } from '@/application/use-cases/inventario-ana/aceitar-match';
import type { AnaRevisaoRepository } from '@/application/ports/ana-revisao-repository';
import type { OrigemCadastroPostos } from '@/application/ports/postos-repository';
import { EscritaIndisponivel } from '@/domain/errors';

const PARAMS = {
  estacaoId: '33333333-3333-4333-8333-333333333333',
  postoIdSugerido: '44444444-4444-4444-8444-444444444444',
  prefixoSugerido: '3D-001',
  codigoAna: '58880001',
  referenciaExternaId: '33333333-3333-4333-8333-333333333333',
  observacaoPosto: 'Aceito match.',
  origemEvento: 'aceitar_match_ana',
};

const ATOR = { usuarioId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ip: null, userAgent: null };

/**
 * Repositório espião. O que interessa não é o retorno, é se ele foi CHAMADO:
 * chamar significa que a transação que escreve em `postos` começou.
 */
function anaEspiao() {
  const aceitarMatch = vi.fn(async () => {});
  return { repo: { aceitarMatch } as unknown as AnaRevisaoRepository, aceitarMatch };
}

describe('inventário ANA/aceitarMatchAna — a escrita depende da origem do cadastro', () => {
  it('com o cadastro no Dbfch, recusa com EscritaIndisponivel', async () => {
    const { repo } = anaEspiao();

    await expect(aceitarMatchAna(repo, 'dbfch', PARAMS, ATOR)).rejects.toBeInstanceOf(
      EscritaIndisponivel,
    );
  });

  it('e a recusa acontece ANTES de a transação começar', async () => {
    // Esta é a asserção que importa, e não o tipo do erro. Recusar depois de o
    // repositório rodar deixaria a estação ANA marcada como revisada sem o
    // vínculo existir — o estado parcial que o desenho atômico existe para
    // impedir.
    const { repo, aceitarMatch } = anaEspiao();

    await expect(aceitarMatchAna(repo, 'dbfch', PARAMS, ATOR)).rejects.toThrow();

    expect(aceitarMatch).not.toHaveBeenCalled();
  });

  it('a mensagem nomeia a estação, o posto e a origem, e não vira 404', async () => {
    // O texto vai para a tela (`respostaDeErro` devolve `erro.message` no 501).
    // Sem os três nomes, a pessoa recebe "não foi possível" e não sabe o que
    // pedir a quem. E o que ela NÃO pode ler é "posto não encontrado", que era
    // a resposta anterior e mandava procurar um posto que existe.
    const { repo } = anaEspiao();

    const erro = await aceitarMatchAna(repo, 'dbfch', PARAMS, ATOR).catch((e) => e);

    expect(erro).toBeInstanceOf(EscritaIndisponivel);
    expect(erro.message).toContain('58880001');
    expect(erro.message).toContain('3D-001');
    expect(erro.message).toContain('Dbfch');
    expect(erro.message.toLowerCase()).not.toContain('não encontrado');
  });

  it.each<OrigemCadastroPostos>(['postgres', 'mock'])(
    'com o cadastro em %s a escrita segue, porque ali `postos` é a origem',
    async (origem) => {
      const { repo, aceitarMatch } = anaEspiao();

      await expect(aceitarMatchAna(repo, origem, PARAMS, ATOR)).resolves.toBeUndefined();

      // Chamado UMA vez e com os parâmetros intactos: um use case que
      // "passasse adiante" perdendo `referenciaExternaId` ou `origemEvento`
      // apagaria a trilha de auditoria do posto sem nada acusar.
      expect(aceitarMatch).toHaveBeenCalledTimes(1);
      expect(aceitarMatch).toHaveBeenCalledWith(PARAMS, ATOR);
    },
  );

  it('a régua enxerga a diferença: as três origens não respondem igual', async () => {
    // Guarda da guarda. Se o `if` sumisse, os casos de `postgres`/`mock`
    // continuariam verdes e só os de `dbfch` cairiam; se ele passasse a recusar
    // sempre, o inverso. Este caso afirma o CONTRASTE numa linha só, para a
    // saída dizer qual das duas metades quebrou.
    const chamadas = await Promise.all(
      (['dbfch', 'postgres', 'mock'] as OrigemCadastroPostos[]).map(async (origem) => {
        const { repo, aceitarMatch } = anaEspiao();
        await aceitarMatchAna(repo, origem, PARAMS, ATOR).catch(() => undefined);
        return aceitarMatch.mock.calls.length;
      }),
    );

    expect(chamadas).toEqual([0, 1, 1]);
  });
});
