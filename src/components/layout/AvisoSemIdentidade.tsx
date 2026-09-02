import { UserX } from 'lucide-react';

/**
 * Faixa de topo do painel web para a janela em que o sistema opera sem
 * verificar identidade (ver `infrastructure/auth/acesso-sem-identidade.ts`).
 *
 * ONDE ELA MORA, E POR QUE NAO E NO ROOT LAYOUT
 * ---------------------------------------------
 * Renderizada dentro do `ChromeDashboard`, na coluna de conteudo, logo acima
 * do `<header>` e em fluxo normal. Duas consequencias medidas:
 *
 *  1. O header e `sticky top-0`. Em fluxo normal acima dele, a faixa rola para
 *     fora na primeira rolagem e o header assume o topo. Ou seja, ela custa
 *     altura so no topo da pagina e zero durante o trabalho. E por isso que ela
 *     NAO tem botao de fechar: aviso que se fecha some para sempre e deixa de
 *     avisar, e aqui nao ha o que fechar.
 *  2. A barra lateral e `lg:sticky lg:top-0 lg:h-screen`. Uma faixa no root
 *     layout, irma acima do flex externo, empurraria a lateral para baixo
 *     mantendo `h-screen`, jogando o gatilho de recolher do rodape dela para
 *     fora da tela. Dentro da coluna de conteudo isso nao acontece.
 *
 * O aviso permanente de verdade nao e esta faixa: e o selo no lugar do avatar
 * (`MenuUsuario` com `semIdentidade`), que custa o espaco que o avatar ja
 * custava e fica onde a pessoa olha para saber quem ela e.
 *
 * ACESSIBILIDADE
 * --------------
 * `role="status"` (que ja implica `aria-live="polite"`, entao escrever os dois
 * seria redundante). Nao e `alert`: isto e um estado declarado, nao uma falha,
 * e `assertive` interromperia a leitura a cada navegacao.
 *
 * Live region NAO anuncia conteudo presente na carga inicial, ela anuncia
 * mudanca. Por isso o fato tambem viaja no nome acessivel do selo e em texto
 * corrido em `/perfil`: a faixa e reforco, nao e o canal.
 *
 * A cor nao e o unico canal (WCAG 1.4.1): o icone e decorativo e quem carrega a
 * informacao e a frase. Valores vem de token (`gov-alerta` = `--status-warn`,
 * medido em 7.4:1 sobre branco), nunca de literal da paleta do Tailwind.
 */
export function AvisoSemIdentidade() {
  return (
    <div
      role="status"
      className="border-b border-app-border-subtle bg-app-surface-2"
    >
      {/* `px-4` puro, sem `sm:px-6` e sem `max-w`, para casar com a régua do
          `<header>` logo abaixo (que é `px-4` em largura cheia). O `main` e o
          rodapé usam outra régua; quem manda aqui é o vizinho imediato, senão
          o ícone desalinha 8px da assinatura institucional a partir de `sm`. */}
      <div className="flex items-start gap-2 px-4 py-1.5">
        <UserX
          className="mt-0.5 h-4 w-4 shrink-0 text-gov-alerta"
          aria-hidden="true"
        />
        <p className="text-xs leading-5 text-app-fg">
          <strong className="font-semibold text-gov-alerta">
            Acesso sem identificação.
          </strong>{' '}
          Nenhuma ação desta sessão é atribuída a um usuário.
        </p>
      </div>
    </div>
  );
}
