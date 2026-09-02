import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Vigia o PRAZO da janela sem identidade declarada para a entrega do órgão.
 *
 * A decisão registrada é que a janela vencida NÃO derruba a aplicação do
 * cliente: aquele servidor não tem internet e ninguém nosso o alcança depressa,
 * então recusar o boot lá transformaria um lembrete nosso em indisponibilidade
 * deles. Quem reprova é esta cadeia, onde a quebra é barata e chega a quem pode
 * agir.
 *
 * A data é lida do modelo de ambiente que vai para o servidor, e não de uma
 * constante daqui, de propósito: valor escrito duas vezes é uma divergência
 * agendada, e a cópia que importa é a que o Rodrigo instala em
 * /etc/spaguas-dmo/app.env.
 *
 * QUANDO ESTE TESTE FICAR VERMELHO, a correção não é empurrar a data. É
 * perguntar ao órgão se a API de login chegou. Se chegou, a janela sai; se não
 * chegou, a nova data entra com o acordo registrado.
 */

const MODELO = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'ops',
  'producao',
  'ambiente-producao.exemplo',
);

function lerVariavel(conteudo: string, chave: string): string | null {
  // Ancorado em início de linha para não casar com as muitas menções da chave
  // nos comentários explicativos do próprio arquivo.
  const linha = conteudo
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${chave}=`));
  return linha ? linha.slice(chave.length + 1).trim() : null;
}

describe('janela sem identidade declarada para a entrega do órgão', () => {
  const conteudo = readFileSync(MODELO, 'utf8');
  const ligada = lerVariavel(conteudo, 'ACESSO_SEM_IDENTIDADE');
  const revisarEm = lerVariavel(conteudo, 'ACESSO_SEM_IDENTIDADE_REVISAR_EM');
  const motivo = lerVariavel(conteudo, 'ACESSO_SEM_IDENTIDADE_MOTIVO');

  it('o modelo de produção declara a janela de forma completa ou não a declara', () => {
    if (ligada !== 'sim') {
      // Janela encerrada no modelo: as três variáveis devem ter saído juntas.
      expect(revisarEm, 'sobrou data de revisão sem a janela ligada').toBeNull();
      expect(motivo, 'sobrou motivo sem a janela ligada').toBeNull();
      return;
    }
    expect(motivo, 'janela ligada sem motivo escrito').toBeTruthy();
    expect(motivo!.length).toBeGreaterThanOrEqual(10);
    expect(revisarEm, 'janela ligada sem data de revisão').toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('o prazo acordado com o órgão ainda não venceu', () => {
    if (ligada !== 'sim') return;
    const hoje = new Date().toISOString().slice(0, 10);
    expect(
      hoje <= revisarEm!,
      `A janela sem identidade venceu em ${revisarEm}. O sistema do órgão está no ar SEM ` +
        'autenticação desde então. Confirme com o órgão se a API de login já foi fornecida: ' +
        'se foi, remova as três variáveis ACESSO_SEM_IDENTIDADE* do modelo e do servidor; ' +
        'se não foi, registre o novo prazo acordado. Não empurre a data sem esse acordo.',
    ).toBe(true);
  });
});
