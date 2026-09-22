'use client';

import { useEffect, useId, useState } from 'react';
import type { ResumoSerie } from '@/application/ports/series-medicao-repository';
import {
  MAX_DIAS_JANELA_TELA,
  diasNaJanela,
  extensaoDaSerie,
  fimComValor,
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
 * inteira, quando a série é maior que isso, aparece IMPEDIDO com o motivo
 * junto, em vez de estar clicável para devolver erro. Impedido por regra é
 * `aria-disabled` e não `disabled`: o botão continua na ordem de foco, porque
 * saber POR QUE não dá para clicar é parte da informação, e quem navega por
 * teclado não tem como passar o mouse para ler um `title`.
 *
 * A mesma ideia vale para o período digitado. A régua de envio recusa antes da
 * requisição o que a tela já sabe que não existe: período inteiro fora da
 * extensão da série, além da janela maior que o teto. A validação de borda
 * continua do lado do servidor: a daqui existe para não fazer a pessoa
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
  const idMotivoSerieInteira = `${idBase}-motivo-serie-inteira`;

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

  // Fim útil: o último dia com valor. Linhas vazias no fim da série não são
  // período consultável, e mostrar a data delas promete dado que não existe.
  const fim = resumo.ultimaData ? fimComValor(resumo) : null;
  const extensao = extensaoDaSerie(resumo);
  const serieInteiraCabe = extensao !== null && extensao <= MAX_DIAS_JANELA_TELA;

  // A frase de apoio diz a extensão da série e o teto por consulta, e só existe
  // quando há série com começo e fim. Fora disso o parágrafo sairia vazio, e um
  // `aria-describedby` apontando para parágrafo vazio é descrição que não
  // descreve nada.
  const inicio = resumo.primeiraData;
  const temAjuda = inicio !== null && fim !== null;

  // Erro e apoio convivem: quem pede um período fora da série recebe a recusa E
  // continua vendo qual é a série, que é exatamente o que ele precisa para
  // corrigir o período. Enquanto a ajuda era o ramo `else` do erro, a recusa
  // apagava a única frase da tela que dizia o intervalo disponível e o teto de
  // dias, e o motivo do atalho impedido perdia a versão visual dele.
  // Sem erro e sem série, o `aria-describedby` sai do campo em vez de apontar
  // para lugar nenhum: atributo vazio é referência quebrada, não ausência.
  const descricaoDosCampos =
    [erro ? idErro : null, temAjuda ? idAjuda : null].filter(Boolean).join(' ') || undefined;

  function aplicarAtalho(dias: number) {
    const proposta = janelaPadrao(resumo, dias);
    if (!proposta) return;
    setErro(null);
    setDesde(proposta.desde);
    setAte(proposta.ate);
    onAplicar(proposta);
  }

  function aplicarSerieInteira() {
    if (!resumo.primeiraData || !fim) return;
    const proposta = { desde: resumo.primeiraData, ate: fim };
    setErro(null);
    setDesde(proposta.desde);
    setAte(proposta.ate);
    onAplicar(proposta);
  }

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const motivo = validar(desde, ate, { primeira: resumo.primeiraData, fim });
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
          max={fim ?? undefined}
          invalido={erro !== null}
          descritoPor={descricaoDosCampos}
          onChange={setDesde}
        />
        <CampoData
          id={idAte}
          rotulo="Até"
          valor={ate}
          min={resumo.primeiraData ?? undefined}
          max={fim ?? undefined}
          invalido={erro !== null}
          descritoPor={descricaoDosCampos}
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
          desabilitado={carregando}
          idMotivo={idMotivoSerieInteira}
          motivo={
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
      ) : null}
      {temAjuda ? (
        <p id={idAjuda} className="text-xs text-app-fg-muted tabular">
          Série de {fmtDia(inicio)} a {fmtDia(fim)}
          {extensao !== null ? ` (${fmtInteiro(extensao)} dias)` : ''}.
          {serieInteiraCabe
            ? ''
            : ` Máximo de ${fmtInteiro(MAX_DIAS_JANELA_TELA)} dias por consulta.`}
        </p>
      ) : null}
    </form>
  );
}

/** Extensão da série consultada, para a régua saber o que existe. */
interface LimitesDaSerie {
  readonly primeira: string | null;
  readonly fim: string | null;
}

/**
 * Mesma régua da API, aplicada antes do envio, mais a que só a tela tem como
 * aplicar.
 *
 * Não substitui a validação do servidor, que continua sendo a que vale: existe
 * para que o erro apareça no campo, ao lado do que a pessoa digitou, em vez de
 * voltar como falha de requisição.
 *
 * O limite da SÉRIE é o caso que só daqui se enxerga. Os campos declaram `min`
 * e `max`, e o formulário é `noValidate` (o navegador não cobra nada), então
 * pedir 2010 numa série que parou em 2004 passava direto: a consulta ia até o
 * banco do órgão, voltava vazia e a tela respondia "a origem não tem nenhuma
 * linha", que descreve buraco no dado e não o que de fato houve. Dias de
 * calendário se comparam como texto porque `AAAA-MM-DD` ordena assim, que é a
 * mesma aritmética que o resto deste arquivo usa.
 *
 * Período que encosta na série, ainda que só em parte, PASSA: ali existe dado,
 * e recusar seria a tela negar uma consulta que responde.
 */
function validar(desde: string, ate: string, serie: LimitesDaSerie): string | null {
  if (!desde || !ate) return 'Informe as duas datas do período.';
  if (desde > ate) return 'O início do período não pode ser depois do fim.';
  if (serie.primeira && serie.fim && (ate < serie.primeira || desde > serie.fim)) {
    return `O período pedido está fora da série, que vai de ${fmtDia(serie.primeira)} a ${fmtDia(serie.fim)}.`;
  }
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
  descritoPor?: string;
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

/**
 * Atalho de período.
 *
 * `desabilitado` é a espera da consulta em curso, e passa ela some sozinha.
 * `motivo` é impedimento por REGRA, e aí o botão continua alcançável pelo
 * teclado com `aria-disabled`, em vez de sair da ordem de foco: o motivo viaja
 * no `aria-describedby` e é anunciado ao chegar no botão.
 *
 * Antes ele morava só no atributo `title`, que aparece ao passar o mouse e mais
 * nada: quem navega por teclado ou por leitor de tela via um botão apagado sem
 * nenhuma explicação (WCAG 1.3.1 e 3.3.2 / e-MAG 6.5, e o cliente é órgão
 * público). A frase fica `sr-only` porque na tela ela já está escrita logo
 * abaixo, no texto de apoio do formulário, que é mostrado sempre que existe
 * série: enquanto esse texto era o ramo alternativo do erro, qualquer recusa no
 * formulário apagava a versão visual deste motivo, e este comentário passava a
 * mentir. O caso "o motivo visual não some quando o formulário recusa" guarda
 * essa dependência.
 */
function BotaoAtalho({
  onClick,
  desabilitado,
  motivo,
  idMotivo,
  children,
}: {
  onClick: () => void;
  desabilitado: boolean;
  motivo?: string;
  idMotivo?: string;
  children: React.ReactNode;
}) {
  const impedido = motivo !== undefined;
  return (
    <>
      <button
        type="button"
        onClick={impedido ? undefined : onClick}
        disabled={!impedido && desabilitado}
        aria-disabled={impedido || undefined}
        aria-describedby={impedido ? idMotivo : undefined}
        className={[
          'rounded bg-app-surface-2 px-2 py-1 text-xs font-medium text-app-fg-muted transition-colors',
          'hover:bg-app-surface-3 hover:text-app-fg',
          'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-app-surface-2 disabled:hover:text-app-fg-muted',
          'aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-app-surface-2 aria-disabled:hover:text-app-fg-muted',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul',
        ].join(' ')}
      >
        {children}
      </button>
      {impedido ? (
        <span id={idMotivo} className="sr-only">
          {motivo}
        </span>
      ) : null}
    </>
  );
}
