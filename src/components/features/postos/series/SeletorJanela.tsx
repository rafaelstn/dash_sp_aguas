'use client';

import { useEffect, useId, useState } from 'react';
import type { ResumoSerie } from '@/application/ports/series-medicao-repository';
import {
  MAX_DIAS_JANELA_TELA,
  diasNaJanela,
  extensaoDaSerie,
  fmtDia,
  fmtInteiro,
  janelaPadrao,
  type Janela,
} from './formato';

/**
 * Escolha do período consultado.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O PERÍODO NASCE ÚTIL, E ELE SE ANCORA NA SÉRIE, NÃO NO RELÓGIO
 * ─────────────────────────────────────────────────────────────────────────
 * A API exige `desde` e `ate` e não tem padrão, por um motivo medido: as séries
 * do órgão pararam entre 2001 e 2004 nos postos consultados em 03/09/2026, e um
 * padrão de "últimos 30 dias" devolveria vazio para toda a base.
 *
 * A tela não pode devolver a decisão crua para quem abriu: pedir que a pessoa
 * adivinhe um período dentro de uma série que vai de 1888 a 2004 é o mesmo
 * defeito com outro dono. Então os atalhos e o valor inicial contam a partir do
 * FIM DA SÉRIE, e o texto de apoio diz de quando até quando ela existe, que é a
 * informação sem a qual nenhuma escolha aqui é informada.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O TETO É MOSTRADO ANTES DE SER COBRADO
 * ─────────────────────────────────────────────────────────────────────────
 * A API recusa janela maior que `MAX_DIAS_JANELA` com 400. O atalho de série
 * inteira, quando a série é maior que isso, aparece DESABILITADO com o motivo
 * escrito ao lado, em vez de estar clicável para devolver erro. A validação de
 * borda continua do lado do servidor: a daqui existe para não fazer a pessoa
 * descobrir o limite errando.
 */

interface SeletorJanelaProps {
  resumo: ResumoSerie;
  janela: Janela;
  carregando: boolean;
  onAplicar: (janela: Janela) => void;
}

interface Atalho {
  rotulo: string;
  dias: number;
}

const ATALHOS: readonly Atalho[] = [
  { rotulo: '90 dias', dias: 90 },
  { rotulo: '1 ano', dias: 365 },
  { rotulo: '10 anos', dias: 3653 },
];

export function SeletorJanela({
  resumo,
  janela,
  carregando,
  onAplicar,
}: SeletorJanelaProps) {
  const idBase = useId();
  const idDesde = `${idBase}-desde`;
  const idAte = `${idBase}-ate`;
  const idAjuda = `${idBase}-ajuda`;
  const idErro = `${idBase}-erro`;

  const [desde, setDesde] = useState(janela.desde);
  const [ate, setAte] = useState(janela.ate);
  const [erro, setErro] = useState<string | null>(null);

  // Trocar de série troca a janela por fora deste componente (cada série tem a
  // sua extensão). Os campos seguem a janela vigente para não exibirem o
  // período da série anterior ao lado dos números da nova.
  useEffect(() => {
    setDesde(janela.desde);
    setAte(janela.ate);
    setErro(null);
  }, [janela.desde, janela.ate]);

  const extensao = extensaoDaSerie(resumo);
  const serieInteiraCabe = extensao !== null && extensao <= MAX_DIAS_JANELA_TELA;

  function aplicarAtalho(dias: number) {
    const proposta = janelaPadrao(resumo, dias);
    if (!proposta) return;
    setErro(null);
    setDesde(proposta.desde);
    setAte(proposta.ate);
    onAplicar(proposta);
  }

  function aplicarSerieInteira() {
    if (!resumo.primeiraData || !resumo.ultimaData) return;
    const proposta = { desde: resumo.primeiraData, ate: resumo.ultimaData };
    setErro(null);
    setDesde(proposta.desde);
    setAte(proposta.ate);
    onAplicar(proposta);
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const motivo = validar(desde, ate);
    if (motivo) {
      setErro(motivo);
      return;
    }
    setErro(null);
    onAplicar({ desde, ate });
  }

  return (
    <form onSubmit={enviar} className="space-y-2.5" noValidate>
      <div className="flex flex-wrap items-end gap-2.5">
        <CampoData
          id={idDesde}
          rotulo="De"
          valor={desde}
          min={resumo.primeiraData ?? undefined}
          max={resumo.ultimaData ?? undefined}
          invalido={erro !== null}
          descritoPor={erro ? idErro : idAjuda}
          onChange={setDesde}
        />
        <CampoData
          id={idAte}
          rotulo="Até"
          valor={ate}
          min={resumo.primeiraData ?? undefined}
          max={resumo.ultimaData ?? undefined}
          invalido={erro !== null}
          descritoPor={erro ? idErro : idAjuda}
          onChange={setAte}
        />
        <button
          type="submit"
          disabled={carregando}
          className="h-9 rounded bg-gov-azul px-4 text-xs font-medium text-white transition-colors hover:bg-gov-azul-escuro disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          {carregando ? 'Carregando…' : 'Ver período'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-app-fg-muted">Fim da série:</span>
        {ATALHOS.map((atalho) => (
          <BotaoAtalho
            key={atalho.dias}
            onClick={() => aplicarAtalho(atalho.dias)}
            desabilitado={carregando}
          >
            {atalho.rotulo}
          </BotaoAtalho>
        ))}
        <BotaoAtalho
          onClick={aplicarSerieInteira}
          desabilitado={carregando || !serieInteiraCabe}
          titulo={
            serieInteiraCabe
              ? undefined
              : `A série tem ${fmtInteiro(extensao ?? 0)} dias e o máximo por consulta é ${fmtInteiro(MAX_DIAS_JANELA_TELA)}.`
          }
        >
          série inteira
        </BotaoAtalho>
      </div>

      {erro ? (
        <p id={idErro} role="alert" className="text-xs font-medium text-gov-perigo">
          {erro}
        </p>
      ) : (
        <p id={idAjuda} className="text-xs text-app-fg-muted tabular">
          {resumo.primeiraData && resumo.ultimaData ? (
            <>
              Série de {fmtDia(resumo.primeiraData)} a {fmtDia(resumo.ultimaData)}
              {extensao !== null ? ` (${fmtInteiro(extensao)} dias)` : ''}.
              {serieInteiraCabe
                ? ''
                : ` Máximo de ${fmtInteiro(MAX_DIAS_JANELA_TELA)} dias por consulta.`}
            </>
          ) : null}
        </p>
      )}
    </form>
  );
}

/**
 * Mesma régua da API, aplicada antes do envio.
 *
 * Não substitui a validação do servidor, que continua sendo a que vale: existe
 * para que o erro apareça no campo, ao lado do que a pessoa digitou, em vez de
 * voltar como falha de requisição.
 */
function validar(desde: string, ate: string): string | null {
  if (!desde || !ate) return 'Informe as duas datas do período.';
  if (desde > ate) return 'O início do período não pode ser depois do fim.';
  const dias = diasNaJanela(desde, ate);
  if (dias > MAX_DIAS_JANELA_TELA) {
    return `O período tem ${fmtInteiro(dias)} dias e o máximo por consulta é ${fmtInteiro(MAX_DIAS_JANELA_TELA)}.`;
  }
  return null;
}

function CampoData({
  id,
  rotulo,
  valor,
  min,
  max,
  invalido,
  descritoPor,
  onChange,
}: {
  id: string;
  rotulo: string;
  valor: string;
  min?: string;
  max?: string;
  invalido: boolean;
  descritoPor: string;
  onChange: (valor: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-app-fg">
        {rotulo}
      </label>
      <input
        type="date"
        id={id}
        value={valor}
        min={min}
        max={max}
        aria-invalid={invalido || undefined}
        aria-describedby={descritoPor}
        onChange={(e) => onChange(e.target.value)}
        className={[
          'h-9 rounded border bg-app-surface px-2 text-xs text-app-fg tabular',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface',
          invalido ? 'border-gov-perigo' : 'border-app-border-input',
        ].join(' ')}
      />
    </div>
  );
}

function BotaoAtalho({
  onClick,
  desabilitado,
  titulo,
  children,
}: {
  onClick: () => void;
  desabilitado: boolean;
  titulo?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      title={titulo}
      className="rounded bg-app-surface-2 px-2 py-1 text-xs font-medium text-app-fg-muted transition-colors hover:bg-app-surface-3 hover:text-app-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-app-surface-2 disabled:hover:text-app-fg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
    >
      {children}
    </button>
  );
}
