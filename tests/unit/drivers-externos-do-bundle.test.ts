/**
 * Todo driver de banco importado pela camada de infraestrutura precisa estar
 * declarado em `serverExternalPackages` no `next.config.ts`.
 *
 * POR QUE ISTO É GUARDA, E NÃO CONVENÇÃO. `mssql` e `tedious` resolvem módulo
 * por EXPRESSÃO em tempo de execução (o `mssql` escolhe o driver assim), e o
 * webpack não consegue seguir isso. Se o pacote entrar no bundle, o build
 * termina VERDE e o driver quebra na PRIMEIRA consulta, dentro do container do
 * órgão, que não tem internet e onde ninguém nosso chega depressa. Ou seja: o
 * defeito não aparece em exit code nenhum, e aparece no pior lugar possível.
 *
 * O `postgres` já estava declarado lá e entra aqui junto, porque a próxima
 * pessoa a mexer no `next.config.ts` precisa que a lista tenha um dono.
 *
 * Esta guarda mede a DECLARAÇÃO. A prova de que a declaração produz o efeito é
 * outra e foi feita à parte, olhando `.next/standalone/node_modules` depois de
 * um build com `DOCKER_BUILD=1`, porque exit code de build não responde sobre
 * conteúdo de diretório.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = path.resolve(__dirname, '..', '..');

/**
 * Pacotes que falam com banco por protocolo próprio. A lista cresce quando um
 * driver novo entrar no projeto, e é isso que o caso "a lista cobre o que o
 * código realmente importa" abaixo cobra: ele não confia nesta constante, ele
 * a confere contra os imports de verdade.
 */
const DRIVERS_CONHECIDOS = ['postgres', 'mssql', 'tedious'] as const;

function configDoNext(): string {
  return readFileSync(path.join(RAIZ, 'next.config.ts'), 'utf8');
}

function externos(): string[] {
  const texto = configDoNext();
  const bloco = /serverExternalPackages\s*:\s*\[([^\]]*)\]/.exec(texto);
  if (!bloco) return [];
  return [...bloco[1]!.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]!);
}

/** Dependências de produção declaradas no package.json. */
function dependencias(): string[] {
  const pkg = JSON.parse(readFileSync(path.join(RAIZ, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  return Object.keys(pkg.dependencies ?? {});
}

describe('empacotamento: driver de banco fica fora do bundle', () => {
  it('o next.config declara serverExternalPackages de forma legível', () => {
    // Se alguém trocar o array literal por uma variável, esta guarda passaria a
    // medir vazio e ficaria verde sem conferir nada. O caso existe para que
    // essa mudança apareça como falha, e não como silêncio.
    expect(externos().length).toBeGreaterThan(0);
  });

  it.each(DRIVERS_CONHECIDOS)('%s está declarado como externo', (driver) => {
    expect(externos()).toContain(driver);
  });

  it('todo driver conhecido que o projeto usa é dependência de produção', () => {
    // `tedious` entra como dependência transitiva do `mssql`, então só os que
    // o código importa direto precisam estar declarados.
    const deps = dependencias();
    expect(deps).toContain('mssql');
    expect(deps).toContain('postgres');
  });
});
