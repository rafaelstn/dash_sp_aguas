import { describe, expect, it } from 'vitest';
import {
  calcularLimites,
  dataHoraPtBr,
  importarJson,
  montarExportacaoJson,
  nomeArquivo,
  nomeBaseArquivo,
  orientacaoPdf,
  serializarJson,
} from '@/components/features/diagramas/editor/exportar-diagrama';
import type {
  ElementoLinha,
  ElementoNivel,
  ElementoReservatorio,
} from '@/domain/diagramas/tipos';

/**
 * Helpers de exportação/importação de diagramas (Fase A4).
 *
 * O foco é o parser/validador de import (caminho válido e inválido), que é a
 * fronteira de confiança do editor: um JSON quebrado nunca pode derrubar a
 * tela. Cobre também a normalização do nome de arquivo e a orientação do PDF.
 */

const reservatorio: ElementoReservatorio = {
  id: 'r1',
  tipo: 'reservatorio',
  posicao: { x: 100, y: 200 },
  nome: 'Represa Jaguari',
};

const nivel: ElementoNivel = {
  id: 'n1',
  tipo: 'nivel',
  posicao: { x: 400, y: 250 },
  codigo: 'PN-001',
  nome: 'Posto Foz',
  valor: 3.2,
  unidade: 'm',
  limiares: { alerta: 4, emergencia: 5 },
};

const linha: ElementoLinha = {
  id: 'l1',
  tipo: 'linha',
  posicao: { x: 0, y: 0 },
  pontos: [
    { x: 100, y: 200 },
    { x: 400, y: 250 },
  ],
  label: 'Rio Atibaia',
  direcaoSeta: 'direta',
};

describe('nomeBaseArquivo', () => {
  it('remove acentos, baixa caixa e troca espaços por hífen', () => {
    expect(nomeBaseArquivo('Bacia do Tietê Médio')).toBe('bacia-do-tiete-medio');
  });

  it('descarta caracteres inválidos de sistema de arquivos', () => {
    expect(nomeBaseArquivo('Rede: PCJ / 2026 *rascunho*')).toBe(
      'rede-pcj-2026-rascunho',
    );
  });

  it('cai para "diagrama" quando o nome fica vazio', () => {
    expect(nomeBaseArquivo('   ')).toBe('diagrama');
    expect(nomeBaseArquivo('@#$%')).toBe('diagrama');
  });

  it('monta o nome com extensão', () => {
    expect(nomeArquivo('Bacia PCJ', 'png')).toBe('bacia-pcj.png');
    expect(nomeArquivo('Bacia PCJ', 'pdf')).toBe('bacia-pcj.pdf');
  });
});

describe('montarExportacaoJson / serializarJson', () => {
  it('inclui só nome, bacia, descricao e elementos (sem metadados internos)', () => {
    const exportado = montarExportacaoJson(
      { nome: 'Bacia PCJ', bacia: 'PCJ', descricao: 'Esquema oficial' },
      [reservatorio, nivel, linha],
    );
    expect(exportado).toEqual({
      nome: 'Bacia PCJ',
      bacia: 'PCJ',
      descricao: 'Esquema oficial',
      elementos: [reservatorio, nivel, linha],
    });
    expect(serializarJson(exportado)).toContain('"nome": "Bacia PCJ"');
  });

  it('faz round-trip: exportar e reimportar preserva os elementos', () => {
    const json = serializarJson(
      montarExportacaoJson(
        { nome: 'Bacia PCJ', bacia: null, descricao: null },
        [reservatorio, nivel, linha],
      ),
    );
    const resultado = importarJson(json);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.elementos).toEqual([reservatorio, nivel, linha]);
    }
  });
});

describe('importarJson — caminho válido', () => {
  it('aceita JSON com elementos válidos e devolve os elementos', () => {
    const texto = JSON.stringify({
      nome: 'Importado',
      bacia: 'PCJ',
      elementos: [reservatorio, nivel],
    });
    const resultado = importarJson(texto);
    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.elementos).toHaveLength(2);
      expect(resultado.elementos[0]?.tipo).toBe('reservatorio');
    }
  });

  it('aceita arquivo sem nome/bacia/descricao (só elementos)', () => {
    const texto = JSON.stringify({ elementos: [reservatorio] });
    const resultado = importarJson(texto);
    expect(resultado.ok).toBe(true);
  });

  it('aceita lista de elementos vazia (diagrama em branco)', () => {
    const resultado = importarJson(JSON.stringify({ elementos: [] }));
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.elementos).toEqual([]);
  });
});

describe('importarJson — caminho inválido', () => {
  it('rejeita texto que não é JSON', () => {
    const resultado = importarJson('isto não é json {');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).toMatch(/JSON válido/);
  });

  it('rejeita objeto sem o campo elementos', () => {
    const resultado = importarJson(JSON.stringify({ nome: 'Sem elementos' }));
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.erro).toMatch(/formato esperado/);
  });

  it('rejeita elemento com tipo desconhecido', () => {
    const resultado = importarJson(
      JSON.stringify({
        elementos: [{ id: 'x', tipo: 'bomba', posicao: { x: 0, y: 0 } }],
      }),
    );
    expect(resultado.ok).toBe(false);
  });

  it('rejeita posto de nível sem o campo obrigatório valor', () => {
    const resultado = importarJson(
      JSON.stringify({
        elementos: [
          {
            id: 'n2',
            tipo: 'nivel',
            posicao: { x: 0, y: 0 },
            codigo: 'PN-9',
            nome: 'Incompleto',
            limiares: {},
          },
        ],
      }),
    );
    expect(resultado.ok).toBe(false);
  });

  it('rejeita linha com menos de 2 pontos', () => {
    const resultado = importarJson(
      JSON.stringify({
        elementos: [
          {
            id: 'l2',
            tipo: 'linha',
            posicao: { x: 0, y: 0 },
            pontos: [{ x: 0, y: 0 }],
            direcaoSeta: 'nenhuma',
          },
        ],
      }),
    );
    expect(resultado.ok).toBe(false);
  });

  it('rejeita quando elementos não é um array', () => {
    const resultado = importarJson(JSON.stringify({ elementos: 'nenhum' }));
    expect(resultado.ok).toBe(false);
  });
});

describe('calcularLimites', () => {
  it('considera posições e pontos de linha', () => {
    const limites = calcularLimites([reservatorio, nivel, linha]);
    expect(limites).toEqual({ largura: 300, altura: 50 });
  });

  it('devolve null para diagrama vazio', () => {
    expect(calcularLimites([])).toBeNull();
  });
});

describe('orientacaoPdf', () => {
  it('usa paisagem quando o diagrama é mais largo que alto', () => {
    expect(orientacaoPdf([reservatorio, nivel])).toBe('paisagem');
  });

  it('usa retrato quando mais alto que largo', () => {
    const a: ElementoReservatorio = {
      ...reservatorio,
      id: 'a',
      posicao: { x: 0, y: 0 },
    };
    const b: ElementoReservatorio = {
      ...reservatorio,
      id: 'b',
      posicao: { x: 10, y: 500 },
    };
    expect(orientacaoPdf([a, b])).toBe('retrato');
  });

  it('usa retrato por padrão quando vazio', () => {
    expect(orientacaoPdf([])).toBe('retrato');
  });
});

describe('dataHoraPtBr', () => {
  it('formata data e hora no padrão PT-BR (dd/mm/aaaa hh:mm)', () => {
    const data = new Date(2026, 5, 23, 9, 5);
    expect(dataHoraPtBr(data)).toMatch(/^23\/06\/2026,?\s+09:05$/);
  });
});
