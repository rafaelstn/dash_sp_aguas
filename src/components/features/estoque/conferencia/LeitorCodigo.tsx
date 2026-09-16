'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ScanBarcode } from 'lucide-react';
import { listarUnidades } from '../api';
import { registrarContagem } from '../conferencia-api';
import { ErroEstoque } from '../erros';
import {
  decidirLeituraCodigo,
  mensagemLeituraCodigo,
  montarContagemSerializado,
  type TomLeituraCodigo,
} from '../conferencia-ui';
import type { ConferenciaItemDTO } from '../conferencia-dtos';
import type { Resolvedores } from './resolvedores';

interface Props {
  conferenciaId: string;
  /** Itens carregados da contagem (a leitura procura a unidade aqui). */
  itens: readonly ConferenciaItemDTO[];
  listaParcial: boolean;
  resolvedores: Resolvedores;
  aoContar: (atualizado: ConferenciaItemDTO) => void;
}

type Estado =
  | { fase: 'ocioso' }
  | { fase: 'lendo'; codigo: string }
  | { fase: 'resultado'; tom: TomLeituraCodigo; texto: string };

const CLASSE_TOM: Record<TomLeituraCodigo, string> = {
  sucesso: 'text-gov-sucesso',
  aviso: 'text-amber-900',
  erro: 'text-gov-perigo',
};

/**
 * Campo de leitura para leitor de código de barras USB, que funciona como
 * teclado: digita o código e manda Enter. Cada leitura busca a unidade pelo
 * código EXATO e, se ela está no escopo, registra "Conferido". As leituras
 * entram numa fila e são processadas uma de cada vez, então o operador pode
 * bipar em sequência sem esperar a resposta; o campo é limpo e o foco volta
 * para ele a cada Enter. A decisão (nenhum, vários, fora do escopo, já
 * conferido) vive em `decidirLeituraCodigo`, testada à parte.
 */
export function LeitorCodigo({ conferenciaId, itens, listaParcial, resolvedores, aoContar }: Props) {
  const id = useId();
  const [valor, setValor] = useState('');
  const [estado, setEstado] = useState<Estado>({ fase: 'ocioso' });
  const campoRef = useRef<HTMLInputElement>(null);
  const filaRef = useRef<string[]>([]);
  const processandoRef = useRef(false);
  const montadoRef = useRef(true);
  // A fila roda fora do ciclo de render: lê sempre a lista e os rótulos atuais.
  const itensRef = useRef(itens);
  const rotuloRef = useRef(resolvedores.rotuloItem);
  const parcialRef = useRef(listaParcial);

  useEffect(() => {
    itensRef.current = itens;
    rotuloRef.current = resolvedores.rotuloItem;
    parcialRef.current = listaParcial;
  }, [itens, resolvedores.rotuloItem, listaParcial]);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  const lerUm = useCallback(
    async (codigo: string) => {
      setEstado({ fase: 'lendo', codigo });
      let etapa: 'busca' | 'registro' = 'busca';
      try {
        const resposta = await listarUnidades({ codigo, porPagina: 2 });
        const decisao = decidirLeituraCodigo({
          codigo,
          unidadesEncontradas: resposta.itens,
          totalEncontrado: resposta.total,
          itens: itensRef.current,
          listaParcial: parcialRef.current,
        });
        if (decisao.tipo === 'vazio') return;

        if (decisao.tipo === 'registrar') {
          const { payload, erro } = montarContagemSerializado('conferido', null);
          if (!payload) throw new Error(erro ?? 'Contagem inválida.');
          etapa = 'registro';
          const atualizado = await registrarContagem(conferenciaId, decisao.item.id, payload);
          // O item gravado passa a ser a verdade da lista para as próximas leituras.
          itensRef.current = itensRef.current.map((i) => (i.id === atualizado.id ? atualizado : i));
          if (montadoRef.current) aoContar(atualizado);
        }

        if (montadoRef.current) {
          setEstado({ fase: 'resultado', ...mensagemLeituraCodigo(decisao, rotuloRef.current) });
        }
      } catch (e) {
        if (!montadoRef.current) return;
        const texto =
          e instanceof ErroEstoque
            ? `Código ${codigo}: ${e.message.replace(/\.$/, '')}. Leia de novo.`
            : etapa === 'busca'
              ? `Não foi possível ler o código ${codigo}. Verifique a conexão e leia de novo.`
              : `Não foi possível registrar a contagem do código ${codigo}. Leia de novo.`;
        setEstado({ fase: 'resultado', tom: 'erro', texto });
      }
    },
    [conferenciaId, aoContar],
  );

  const processarFila = useCallback(async () => {
    if (processandoRef.current) return;
    processandoRef.current = true;
    try {
      while (filaRef.current.length > 0 && montadoRef.current) {
        const proximo = filaRef.current.shift();
        if (proximo) await lerUm(proximo);
      }
    } finally {
      processandoRef.current = false;
    }
  }, [lerUm]);

  function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const codigo = valor.trim();
    setValor('');
    campoRef.current?.focus();
    if (!codigo) return;
    filaRef.current.push(codigo);
    void processarFila();
  }

  return (
    <form
      onSubmit={aoEnviar}
      className="rounded-gov-card border border-app-border-subtle bg-app-surface p-3"
    >
      <label
        htmlFor={`${id}-codigo`}
        className="text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
      >
        Ler código
      </label>
      <div className="mt-1 flex gap-2">
        <input
          ref={campoRef}
          id={`${id}-codigo`}
          type="text"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          className="min-h-11 w-full min-w-0 flex-1 rounded border border-app-border-input bg-app-surface px-3 py-2.5 text-base text-app-fg tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
        />
        <button
          type="submit"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded bg-gov-azul px-4 py-2 text-sm font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          <ScanBarcode className="h-4 w-4" aria-hidden="true" />
          Ler
        </button>
      </div>
      <p
        aria-live="polite"
        className={[
          'mt-2 min-h-5 text-sm',
          estado.fase === 'resultado' ? CLASSE_TOM[estado.tom] : 'text-app-fg-muted',
        ].join(' ')}
      >
        {estado.fase === 'lendo'
          ? `Lendo ${estado.codigo}…`
          : estado.fase === 'resultado'
            ? estado.texto
            : ''}
      </p>
    </form>
  );
}
