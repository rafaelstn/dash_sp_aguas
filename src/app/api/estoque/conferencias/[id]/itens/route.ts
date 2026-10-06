import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  estoqueConferenciasRepository,
  usuariosIdentidadeRepository,
} from '@/infrastructure/repositories';
import { resolverOperadores } from '@/application/use-cases/estoque/resolver-operadores';
import { exigirUsuario, exigirGestorEstoque } from '@/app/api/_helpers/auth';
import { podeGerenciarEstoque } from '@/infrastructure/auth/permissao-estoque';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import type { FiltrosItemConferencia, SobraComando } from '@/domain/estoque/conferencia';
import { ehSituacaoItem } from '@/domain/estoque/conferencia';
import { checarRateLimit } from '../../../_rl';
import { lerPaginacao, motivosZod } from '../../../_schemas';
import { sobraItemSchema } from '../../_schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid('Identificador de conferência inválido.');

/**
 * GET /api/estoque/conferencias/[id]/itens — lista itens. Leitura: usuario.
 * Filtros: situacao, apenasDivergentes, apenasPendentesRecon, pagina, porPagina.
 *
 * A ROTA fica aberta a `user` e a AUTORIA, não (decisão do André, PO de
 * Segurança, em 06/10/2026; é o QUARTO caminho para a mesma projeção de
 * identidade, depois de `movimentacoes`, `export` e `unidades/[id]`).
 *
 * Por que a rota continua aberta: as páginas
 * `src/app/(dashboard)/estoque/conferencias/page.tsx` e `[id]/page.tsx` só
 * exigem sessão e passam `podeGerenciar` como propriedade, então um `user`
 * abre a conferência em modo leitura por desenho, e fechar a rota inteira
 * tiraria dele a contagem, a divergência e o saldo, que são o produto.
 *
 * Por que a autoria fecha: nome e e-mail do operador vêm de `auth.users`, a
 * MESMA fonte de `GET /api/admin/usuarios`, que exige Admin
 * (`src/infrastructure/db/usuarios-identidade-repository.pg.ts` e
 * `usuarios-admin-repository.supabase.ts`, medido em 06/10/2026). Entregar o
 * mesmo dado a qualquer logado aqui é guarda mais fraca para o mesmo dado. E
 * minimização (art. 6º III da LGPD) resolve o resto: toda ação sobre item de
 * conferência (contar, sobra, reconciliar, concluir) já exige gestor, então
 * `user` não tem ato nenhum para o qual o nome de quem contou seja funcional.
 * Base legal do tratamento continua art. 7º III + art. 23, nunca consentimento.
 *
 * O `contadoPor` cru também sai: UUID de pessoa é dado pessoal pseudonimizado,
 * e deixá-lo passar enquanto só o rótulo é removido entrega o identificador e
 * ainda imprime UUID na tela (`conferencia-ui.ts`, `autoriaDoItem`).
 *
 * `autoriaVisivel: false` existe para a tela dizer "você não vê" em vez de
 * "não há" (item 10 do padrao-ui). PENDÊNCIA DE UI, da Fernanda: hoje
 * `autoriaDoItem` cai em "Contado (autoria não registrada)" quando a autoria
 * vem nula, o que é a frase errada para recusa por escopo. Não afeta a janela
 * atual (ver abaixo), mas tem de sair antes de a autenticação individual ligar.
 *
 * ALCANCE REAL desta guarda: `podeGerenciarEstoque` devolve true para o usuário
 * institucional enquanto a janela sem identidade do ADR-0024 estiver ativa, e o
 * painel do órgão inteiro entra como aquele usuário. Nessa janela isto NÃO
 * restringe nada; passa a restringir quando a autenticação individual do órgão
 * estiver ligada. Medido por efeito em 06/10/2026 em
 * `tests/unit/api/estoque-conferencia-autoria-rota.test.ts`.
 *
 * Quem reprova o quinto caminho:
 * `tests/unit/api/projecao-de-identidade-nas-rotas.test.ts`, que varre o
 * inventário de rotas por `git ls-files` e reprova projeção de identidade atrás
 * de guarda fraca. O aparelho AST é `tests/apoio/projecao-de-identidade.ts`.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id, request);
  if (resposta) return resposta;

  const idParsed = idSchema.safeParse((await ctx.params).id);
  if (!idParsed.success) return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });

  try {
    const sp = request.nextUrl.searchParams;
    const situacaoBruta = sp.get('situacao');
    const { pagina, porPagina } = lerPaginacao(sp);
    const filtros: FiltrosItemConferencia = {
      situacao: ehSituacaoItem(situacaoBruta)
        ? (situacaoBruta as FiltrosItemConferencia['situacao'])
        : undefined,
      apenasDivergentes: sp.get('apenasDivergentes') === 'true',
      apenasPendentesRecon: sp.get('apenasPendentesRecon') === 'true',
      pagina,
      porPagina,
    };
    const { itens, total } = await estoqueConferenciasRepository.listarItens(idParsed.data, filtros);

    // Sem gestão, a autoria nem é resolvida: o identificador cru sai do corpo
    // junto com o rótulo, e a identidade não é consultada (efeito medido por
    // contagem de chamadas ao repositório de identidade, no teste citado no
    // docblock). Os CARIMBOS de tempo ficam: "contado em" é o estado do item,
    // não identificação de pessoa, e é deles que a tela precisa para mostrar o
    // andamento da conferência.
    if (!(await podeGerenciarEstoque(auth.id))) {
      const itensSemAutoria = itens.map((i) => ({
        ...i,
        contadoPor: null,
        contadoPorRotulo: null,
        reconciliadoPor: null,
        reconciliadoPorRotulo: null,
      }));
      return NextResponse.json(
        { itens: itensSemAutoria, total, pagina, porPagina, autoriaVisivel: false },
        { status: 200, headers },
      );
    }

    // Rotulo legivel de quem contou e de quem reconciliou, pela MESMA regra do
    // export e da trilha de movimentacoes (um unico SELECT em lote). Sem isso a
    // tela mostraria UUID e a trilha nao serviria para auditoria do orgao.
    const ids = itens.flatMap((i) =>
      [i.contadoPor, i.reconciliadoPor].filter((v): v is string => v !== null),
    );
    const { operadores, degradado } = await resolverOperadores(usuariosIdentidadeRepository, ids);
    if (degradado) {
      logger.warn(
        'estoque.conferencia.operador_degradado',
        { usuarioId: auth.id, conferenciaId: idParsed.data },
        'Resolucao de identidade do operador indisponivel; trilha degradada para o id',
      );
    }
    const itensComOperador = itens.map((i) => ({
      ...i,
      contadoPorRotulo: i.contadoPor ? (operadores.get(i.contadoPor) ?? i.contadoPor) : null,
      reconciliadoPorRotulo: i.reconciliadoPor
        ? (operadores.get(i.reconciliadoPor) ?? i.reconciliadoPor)
        : null,
    }));

    return NextResponse.json(
      { itens: itensComOperador, total, pagina, porPagina, autoriaVisivel: true },
      { status: 200, headers },
    );
  } catch (e) {
    return respostaDeErro('GET /api/estoque/conferencias/[id]/itens', { usuarioId: auth.id }, e);
  }
}

/**
 * POST /api/estoque/conferencias/[id]/itens — adiciona item "sobra" (alvo JA
 * cadastrado; so com a sessao aberta). Escrita: admin. Erros: 404/409/400.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirGestorEstoque();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('conferenciaEstoque', auth.id, request);
  if (resposta) return resposta;

  const idParsed = idSchema.safeParse((await ctx.params).id);
  if (!idParsed.success) return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400, headers });
  }
  const parsed = sobraItemSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }
  const d = parsed.data;
  const sobra: SobraComando =
    'unidadeId' in d
      ? { tipo: 'serializado', unidadeId: d.unidadeId, localEncontradoId: d.localEncontradoId }
      : {
          tipo: 'quantificavel',
          materialId: d.materialId,
          localId: d.localId,
          tamanho: d.tamanho ?? null,
          quantidadeContada: d.quantidadeContada,
        };

  try {
    const item = await estoqueConferenciasRepository.adicionarSobra(idParsed.data, sobra, auth.id);
    logger.info(
      'estoque.conferencias.sobra_adicionada',
      { usuarioId: auth.id, conferenciaId: idParsed.data, itemId: item.id, tipo: sobra.tipo },
      'Item sobra adicionado a conferencia',
    );
    return NextResponse.json(item, { status: 201, headers });
  } catch (e) {
    return respostaDeErro('POST /api/estoque/conferencias/[id]/itens', { usuarioId: auth.id }, e);
  }
}
