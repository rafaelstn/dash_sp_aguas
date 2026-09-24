/**
 * Guarda de catálogo: todo campo que o cadastro grava tem rótulo em português.
 *
 * Por que uma guarda e não uma revisão de lista: o histórico de alterações
 * imprime o que estiver dentro de `valores_antes` e `valores_depois`, e essas
 * colunas são preenchidas por `extrairCamposAuditados` a partir das chaves de
 * `CamposEditaveisPosto` (`src/application/ports/postos-repository.ts`). Campo
 * novo no cadastro entra no audit trail no mesmo dia em que entra no tipo, e se
 * ninguém escrever o rótulo a tela volta a mostrar `subUgrhiNumero` em cadastro
 * público. Lista conferida à mão envelhece; catálogo perguntado ao código, não.
 *
 * A leitura é por AST e do DISCO, não pelo `git ls-files`: o caso que está por
 * commitar é justamente o que precisa ser reprovado antes do commit.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  ROTULOS_CAMPO_POSTO,
  ROTULOS_CAMPO_POSTO_EXTINTO,
  rotuloCampoPosto,
} from '@/lib/rotulos-posto';

const ARQUIVO_DO_CATALOGO = 'src/application/ports/postos-repository.ts';

/**
 * As chaves de `CamposEditaveisPosto`, lidas do tipo.
 *
 * O tipo é `Partial<{ ... }>`, então o caminho é: alias com esse nome, primeiro
 * argumento de tipo, literal de tipo, nomes das propriedades.
 */
function camposEditaveisDeclarados(): string[] {
  const caminho = path.join(process.cwd(), ARQUIVO_DO_CATALOGO);
  const fonte = ts.createSourceFile(
    ARQUIVO_DO_CATALOGO,
    readFileSync(caminho, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const campos: string[] = [];
  const andar = (no: ts.Node): void => {
    if (
      ts.isTypeAliasDeclaration(no) &&
      no.name.text === 'CamposEditaveisPosto' &&
      ts.isTypeReferenceNode(no.type)
    ) {
      const dentro = no.type.typeArguments?.[0];
      if (dentro && ts.isTypeLiteralNode(dentro)) {
        for (const membro of dentro.members) {
          if (ts.isPropertySignature(membro) && ts.isIdentifier(membro.name)) {
            campos.push(membro.name.text);
          }
        }
      }
    }
    ts.forEachChild(no, andar);
  };
  andar(fonte);
  return campos;
}

describe('o catálogo de campos editáveis do posto', () => {
  const declarados = camposEditaveisDeclarados();

  it('foi lido do tipo, e não de uma lista escrita aqui', () => {
    // Piso contra extração vazia: se o parser deixar de achar o alias (nome
    // trocado, tipo reescrito de outra forma), `declarados` fica em zero e a
    // asserção seguinte aprova qualquer coisa, inclusive nenhum rótulo.
    expect(
      declarados.length,
      `nenhum campo (ou quase) foi extraído de ${ARQUIVO_DO_CATALOGO}: ` +
        `a extração leu ${declarados.length}, e o tipo tem dezenas`,
    ).toBeGreaterThan(30);
    // Âncora de presença: dois campos que existem desde o início do cadastro.
    expect(declarados).toContain('nomeEstacao');
    expect(declarados).toContain('subUgrhiNumero');
  });

  it('tem rótulo em português para cada campo gravado no audit trail', () => {
    const semRotulo = declarados.filter((campo) => rotuloCampoPosto(campo) === campo);

    expect(
      semRotulo,
      'campos de `CamposEditaveisPosto` sem rótulo em `src/lib/rotulos-posto.ts`, ' +
        'que apareceriam com o nome técnico no histórico da ficha:\n' +
        semRotulo.join('\n'),
    ).toEqual([]);
  });

  it('não guarda rótulo vivo de campo que o cadastro não grava mais', () => {
    // O inverso da guarda acima. Rótulo vivo que não corresponde a campo do
    // catálogo é rótulo órfão: ou o campo saiu e o rótulo devia ter migrado
    // para o mapa dos extintos, ou o nome foi digitado errado e o campo de
    // verdade está sem rótulo, sem ninguém notar.
    const orfaos = Object.keys(ROTULOS_CAMPO_POSTO).filter(
      (campo) => !declarados.includes(campo),
    );

    expect(
      orfaos,
      'rótulos em ROTULOS_CAMPO_POSTO que não são campo de `CamposEditaveisPosto`:\n' +
        orfaos.join('\n'),
    ).toEqual([]);
  });

  it('mantém separados os campos vivos e os que saíram em 03/09/2026', () => {
    // Chave nos dois mapas faria o rótulo depender da ordem de consulta dentro
    // de `rotuloCampoPosto`, e a tela mostraria "campo extinto" para campo
    // vivo, ou o contrário.
    const nosDois = Object.keys(ROTULOS_CAMPO_POSTO_EXTINTO).filter(
      (campo) => campo in ROTULOS_CAMPO_POSTO,
    );

    expect(nosDois, `chaves nos dois mapas: ${nosDois.join(', ')}`).toEqual([]);
    expect(Object.keys(ROTULOS_CAMPO_POSTO_EXTINTO)).toHaveLength(12);
  });
});
