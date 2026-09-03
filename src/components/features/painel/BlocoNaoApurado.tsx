import { CircleCheck, CircleDashed } from 'lucide-react';

export interface BlocoNaoApuradoProps {
  /**
   * A frase que responde "por que não tem número aqui". Vem nomeada de
   * `@/lib/painel-apuracao`, e é a MESMA que o cartão do indicador exibe: a
   * seção e o cartão discordarem sobre o motivo seria pior que os dois calados.
   */
  motivo: string;
}

/**
 * O lugar de uma seção que ainda não pode dizer a verdade.
 *
 * A alternativa era sumir com a seção, e ela é pior: quem conhece o painel
 * conclui que a funcionalidade foi removida, e quem não conhece nunca fica
 * sabendo que ela existe. O bloco mantém o título da seção de pé e diz, em uma
 * linha, o que falta para o número aparecer.
 *
 * Tracejado e sem cor de estado de propósito, igual ao cartão: vermelho leria
 * como problema da rede e verde como problema resolvido, e não é nem um nem
 * outro.
 */
export function BlocoNaoApurado({ motivo }: BlocoNaoApuradoProps) {
  return (
    <div className="flex items-start gap-3 rounded-gov-card border border-dashed border-app-border-strong bg-app-surface p-4">
      <CircleDashed
        className="mt-0.5 h-4 w-4 shrink-0 text-app-fg-subtle"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-app-fg">Não apurado</p>
        <p className="mt-0.5 text-xs text-app-fg-muted">{motivo}</p>
      </div>
    </div>
  );
}

export interface BlocoSemOcorrenciaProps {
  /** O que foi procurado e não foi encontrado, em uma frase. */
  texto: string;
}

/**
 * O par do bloco acima, e a razão de os dois existirem: "medimos e deu zero" e
 * "não temos como medir" ocupam o mesmo espaço vazio na tela e significam o
 * oposto. Este aqui é o primeiro, e é uma BOA notícia — borda contínua, marca
 * de confirmação, e nenhuma pergunta pendente para quem lê.
 */
export function BlocoSemOcorrencia({ texto }: BlocoSemOcorrenciaProps) {
  return (
    <div className="flex items-start gap-3 rounded-gov-card border border-app-border-subtle bg-app-surface p-4">
      <CircleCheck
        className="mt-0.5 h-4 w-4 shrink-0 text-gov-sucesso"
        aria-hidden="true"
      />
      <p className="min-w-0 text-sm text-app-fg-muted">{texto}</p>
    </div>
  );
}
