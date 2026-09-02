/**
 * Texto exibido quando a operação exige papel de aprovador e o usuário não tem.
 *
 * Existe como fonte única porque a mesma frase aparece em quatro telas, e
 * porque ela precisa mudar por completo durante a janela sem identidade
 * (ADR-0024). Texto igual repetido em quatro arquivos é uma divergência
 * agendada: a próxima pessoa corrige três.
 *
 * O caso que motivou: a frase padrão manda "solicitar ao gestor", e na janela
 * sem identidade NÃO EXISTE gestor a quem solicitar, porque ninguém se
 * identifica e não há atribuição de papel. Para quem opera, aquilo vira um beco
 * sem saída: uma instrução que não pode ser cumprida é pior que a recusa seca,
 * porque manda a pessoa procurar uma porta que não existe.
 *
 * Função pura, sem I/O, com o estado da janela injetado por quem chama.
 */
export function mensagemAcessoRestrito(semIdentidade: boolean): string {
  if (semIdentidade) {
    return (
      'Esta operação exige identificação do responsável, e esta instalação ' +
      'está operando sem autenticação. A operação volta a ficar disponível ' +
      'quando o acesso identificado for ativado. A consulta permanece liberada.'
    );
  }
  return (
    'Acesso restrito ao papel de aprovador. Solicite ao gestor a atribuição ' +
    'do papel para concluir esta operação.'
  );
}

/** Título do bloco de recusa, que também muda de sentido durante a janela. */
export function tituloAcessoRestrito(semIdentidade: boolean): string {
  return semIdentidade ? 'Operação indisponível sem identificação' : 'Acesso restrito';
}
