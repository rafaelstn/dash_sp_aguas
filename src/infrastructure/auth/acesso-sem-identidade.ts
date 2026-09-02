/**
 * Acesso sem identidade: janela em que o sistema roda SEM autenticação.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * O sistema foi entregue ao servidor da PRODESP, que não tem saída para a
 * internet. A autenticação da Fase 1 é Supabase Auth (ADR-0004 e ADR-0006),
 * um serviço de internet, portanto fisicamente indisponível naquele host.
 * Enquanto o órgão não fornece a API de login própria, o sistema opera sem
 * verificar identidade.
 *
 * Isto NÃO é um bypass de desenvolvimento (esse é `dev-bypass.ts`, preso a
 * NODE_ENV=development). É um modo de produção declarado, e é o motivo de ele
 * exigir motivo escrito e data de revisão: ligar por acidente tem de ser
 * impossível, e esquecer ligado tem de doer em algum lugar barato.
 *
 * O QUE ELE FAZ, E O QUE ELE NÃO FAZ
 * ----------------------------------
 * Faz: toda requisição passa a ser atribuída a um único usuário institucional,
 * `USUARIO_SEM_IDENTIDADE`, e o gate de rota do middleware para de exigir
 * sessão. A ESTRUTURA de autenticação continua inteira e no lugar: nada foi
 * removido, e ligar a autenticação de volta é desligar esta variável.
 *
 * Não faz: não finge que houve uma pessoa. O usuário atribuído se chama
 * "Acesso sem identificação" justamente para que a trilha de auditoria exigida
 * pela LGPD e pela rule de governo registre a verdade, isto é, que naquela
 * janela o ator não foi verificado. Trilha que inventa um nome é pior que
 * trilha que declara a ausência.
 *
 * QUANDO A API DO ÓRGÃO CHEGAR
 * ----------------------------
 * O ponto de plugagem é `current-user.ts` (identidade) e nada mais: a
 * autorização continua em PostgreSQL, inalterada, conforme a Decisão 3 do
 * ADR-0023, que separa autenticação (do órgão) de autorização (nossa).
 */

/**
 * Usuário institucional único desta janela.
 *
 * Reexportado do domínio, onde ele mora, porque `domain/estoque/export.ts`
 * também precisa dele como sentinela ao rotular o autor de um registro, e o
 * domínio não pode depender da infraestrutura. A linha correspondente em
 * `auth.users` é criada pela migration 0066: sem ela, toda escrita que
 * referencia o autor viola chave estrangeira.
 */
export { USUARIO_SEM_IDENTIDADE } from '@/domain/auth/usuario-sem-identidade';

/** Configuração declarada para a janela sem identidade. */
export interface ConfiguracaoAcessoSemIdentidade {
  /** Por que a autenticação está suspensa. Vai para o log e para a tela. */
  motivo: string;
  /** Data (YYYY-MM-DD) em que a suspensão deve ser reavaliada. */
  revisarEm: string;
}

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

function ligado(): boolean {
  return process.env.ACESSO_SEM_IDENTIDADE?.trim().toLowerCase() === 'sim';
}

/**
 * `true` quando o sistema está operando sem verificar identidade.
 *
 * Fail-closed por construção: qualquer valor que não seja exatamente `sim`
 * mantém a autenticação exigida, inclusive `true`, `1` e string vazia. A
 * palavra foi escolhida para que ninguém ligue isto sem saber o que digitou.
 */
export function acessoSemIdentidadeAtivo(): boolean {
  return ligado();
}

/**
 * Lê a configuração da janela, ou `null` quando ela está desligada.
 *
 * Lança quando a variável principal está ligada e falta motivo ou data. A
 * escolha é deliberada: subir sem justificativa escrita transformaria um
 * estado excepcional em estado silencioso, e é exatamente esse silêncio que
 * faz uma suspensão temporária virar permanente. O erro é de boot, alto e
 * com instrução de correção.
 */
export function configuracaoAcessoSemIdentidade(): ConfiguracaoAcessoSemIdentidade | null {
  if (!ligado()) return null;

  const motivo = process.env.ACESSO_SEM_IDENTIDADE_MOTIVO?.trim() ?? '';
  const revisarEm = process.env.ACESSO_SEM_IDENTIDADE_REVISAR_EM?.trim() ?? '';

  if (motivo.length < 10) {
    throw new Error(
      'ACESSO_SEM_IDENTIDADE=sim exige ACESSO_SEM_IDENTIDADE_MOTIVO com pelo menos ' +
        '10 caracteres, descrevendo por que a autenticação está suspensa. ' +
        'Exemplo: ACESSO_SEM_IDENTIDADE_MOTIVO="Servidor da PRODESP sem internet; ' +
        'aguardando a API de login do órgão."',
    );
  }

  if (!FORMATO_DATA.test(revisarEm)) {
    throw new Error(
      'ACESSO_SEM_IDENTIDADE=sim exige ACESSO_SEM_IDENTIDADE_REVISAR_EM no formato ' +
        `AAAA-MM-DD. Valor atual: ${JSON.stringify(process.env.ACESSO_SEM_IDENTIDADE_REVISAR_EM ?? null)}. ` +
        'É a data em que a suspensão da autenticação deve ser reavaliada com o órgão.',
    );
  }

  return { motivo, revisarEm };
}

/**
 * `true` quando a data de revisão da janela já passou.
 *
 * Função pura, com a data de referência injetada, porque guarda que depende do
 * relógio da máquina não é testável e por isso não é guarda.
 *
 * O vencimento NÃO derruba a aplicação, e a escolha é deliberada: o servidor
 * do órgão não tem internet e ninguém nosso alcança aquele host rapidamente,
 * então recusar o boot transformaria um lembrete nosso em indisponibilidade do
 * cliente. Quem quebra é a nossa cadeia de testes, onde a quebra é barata e
 * chega a quem pode agir. Em produção o vencimento vira registro severo a cada
 * boot e muda o tom do aviso na tela.
 */
export function janelaVencida(
  config: ConfiguracaoAcessoSemIdentidade,
  hoje: Date = new Date(),
): boolean {
  // Comparação por texto ISO (AAAA-MM-DD ordena lexicograficamente igual a
  // cronologicamente) evita fuso horário, que aqui só traria erro de um dia.
  const hojeIso = hoje.toISOString().slice(0, 10);
  return hojeIso > config.revisarEm;
}
