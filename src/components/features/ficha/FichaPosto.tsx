import type { Posto } from '@/domain/posto';
import { formatarValor } from '@/lib/format';

interface Linha {
  rotulo: string;
  valor: unknown;
}

interface Secao {
  titulo: string;
  linhas: Linha[];
}

function montarSecoes(p: Posto): Secao[] {
  return [
    {
      titulo: 'Identificação',
      linhas: [
        { rotulo: 'Prefixo', valor: p.prefixo },
        { rotulo: 'Prefixo ANA', valor: p.prefixoAna },
        { rotulo: 'Nome da estação', valor: p.nomeEstacao },
        { rotulo: 'Tipo de posto', valor: p.tipoPosto },
        { rotulo: 'Rede', valor: p.rede },
        { rotulo: 'Proprietário', valor: p.proprietario },
        { rotulo: 'Mantenedor', valor: p.mantenedor },
      ],
    },
    {
      titulo: 'Localização',
      linhas: [
        { rotulo: 'Município', valor: p.municipio },
        { rotulo: 'Município (alternativo)', valor: p.municipioAlt },
        { rotulo: 'Latitude', valor: p.latitude },
        { rotulo: 'Longitude', valor: p.longitude },
        { rotulo: 'Altimetria (m)', valor: p.altimetria },
      ],
    },
    {
      titulo: 'Bacia e UGRHI',
      linhas: [
        { rotulo: 'Bacia hidrográfica', valor: p.baciaHidrografica },
        { rotulo: 'CoBacia', valor: p.cobacia },
        { rotulo: 'UGRHI', valor: p.ugrhiNome },
        { rotulo: 'Número UGRHI', valor: p.ugrhiNumero },
        { rotulo: 'Sub-UGRHI', valor: p.subUgrhiNome },
        { rotulo: 'Número sub-UGRHI', valor: p.subUgrhiNumero },
        { rotulo: 'Aquífero', valor: p.aquifero },
        { rotulo: 'Área (km²)', valor: p.areaKm2 },
      ],
    },
    {
      titulo: 'Operação',
      linhas: [
        { rotulo: 'Início de operação', valor: p.operacaoInicioAno },
        { rotulo: 'Fim de operação', valor: p.operacaoFimAno },
        { rotulo: 'Status PCD', valor: p.statusPcd },
        { rotulo: 'Última transmissão', valor: p.ultimaTransmissao },
        { rotulo: 'Tempo de transmissão', valor: p.tempoTransmissao },
      ],
    },
    {
      titulo: 'Equipamentos e medições',
      linhas: [
        { rotulo: 'Convencional', valor: p.convencional },
        { rotulo: 'Logger', valor: p.loggerEqp },
        { rotulo: 'Telemétrico', valor: p.telemetrico },
        { rotulo: 'Nível', valor: p.nivel },
        { rotulo: 'Vazão', valor: p.vazao },
        { rotulo: 'BTL', valor: p.btl },
        { rotulo: 'Companhia ambiental', valor: p.ciaAmbiental },
      ],
    },
    {
      titulo: 'Fichas associadas',
      linhas: [
        { rotulo: 'Ficha de inspeção', valor: p.fichaInspecao },
        { rotulo: 'Última data FI', valor: p.ultimaDataFi },
        { rotulo: 'Ficha descritiva', valor: p.fichaDescritiva },
        { rotulo: 'Última atualização FD', valor: p.ultimaAtualizacaoFd },
      ],
    },
    {
      titulo: 'Observações',
      linhas: [{ rotulo: 'Observações', valor: p.observacoes }],
    },
  ];
}

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w]+/g, '-')
    .toLowerCase();
}

export function FichaPosto({ posto }: { posto: Posto }) {
  const secoes = montarSecoes(posto);
  return (
    <article className="space-y-6">
      {secoes.map((secao) => {
        const id = `sec-${slug(secao.titulo)}`;
        return (
          <section key={secao.titulo} aria-labelledby={id}>
            <h2 id={id} className="text-lg font-semibold text-gov-texto border-b border-gov-borda pb-1 mb-3">
              {secao.titulo}
            </h2>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
              {secao.linhas.map((linha) => (
                <div key={linha.rotulo} className="flex flex-col">
                  <dt className="text-sm text-gov-muted">{linha.rotulo}</dt>
                  <dd className="text-gov-texto">{formatarValor(linha.valor)}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </article>
  );
}
