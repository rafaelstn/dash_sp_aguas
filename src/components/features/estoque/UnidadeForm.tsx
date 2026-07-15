'use client';

import { useEffect, useState } from 'react';
import { ESTADOS } from '@/domain/estoque/estado';
import { STATUS } from '@/domain/estoque/status-unidade';
import { FormDialog, CampoSelectForm, CampoTextoForm } from './FormDialog';
import { atualizarUnidade, criarUnidade } from './api';
import { ROTULO_ESTADO, ROTULO_STATUS } from './rotulos';
import type { Estado, LocalDTO, Status, UnidadeDTO } from './dtos';

interface Props {
  aberto: boolean;
  /** null = criar; preenchido = editar. */
  unidade: UnidadeDTO | null;
  locais: readonly LocalDTO[];
  aoFechar: () => void;
  aoConcluir: (mensagem: string) => void;
}

const vazioParaNull = (s: string) => {
  const t = s.trim();
  return t === '' ? null : t;
};

/** Formulario de criar/editar um item serializado. */
export function UnidadeForm({ aberto, unidade, locais, aoFechar, aoConcluir }: Props) {
  const editando = unidade !== null;
  const [descricao, setDescricao] = useState('');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [patDaee, setPatDaee] = useState('');
  const [codigoSpaguas, setCodigoSpaguas] = useState('');
  const [numeroSerie, setNumeroSerie] = useState('');
  const [estado, setEstado] = useState<'' | Estado>('');
  const [status, setStatus] = useState<Status>('ativo');
  const [localId, setLocalId] = useState('');
  const [dataAquisicao, setDataAquisicao] = useState('');
  const [observacao, setObservacao] = useState('');

  useEffect(() => {
    if (!aberto) return;
    setDescricao(unidade?.descricao ?? '');
    setMarca(unidade?.marca ?? '');
    setModelo(unidade?.modelo ?? '');
    setPatDaee(unidade?.patDaee ?? '');
    setCodigoSpaguas(unidade?.codigoSpaguas ?? '');
    setNumeroSerie(unidade?.numeroSerie ?? '');
    setEstado(unidade?.estado ?? '');
    setStatus(unidade?.status ?? 'ativo');
    setLocalId(unidade?.localId ?? '');
    setDataAquisicao(unidade?.dataAquisicao ?? '');
    setObservacao(unidade?.observacao ?? '');
  }, [aberto, unidade]);

  async function salvar() {
    if (descricao.trim().length < 1) {
      throw new Error('Informe a descrição do item.');
    }
    const dados = {
      descricao: descricao.trim(),
      marca: vazioParaNull(marca),
      modelo: vazioParaNull(modelo),
      patDaee: vazioParaNull(patDaee),
      codigoSpaguas: vazioParaNull(codigoSpaguas),
      numeroSerie: vazioParaNull(numeroSerie),
      estado: estado === '' ? null : estado,
      status,
      localId: localId || null,
      dataAquisicao: vazioParaNull(dataAquisicao),
      observacao: vazioParaNull(observacao),
    };
    if (editando) {
      await atualizarUnidade(unidade.id, dados);
      aoConcluir(`Item "${dados.descricao}" atualizado.`);
    } else {
      await criarUnidade(dados);
      aoConcluir(`Item "${dados.descricao}" criado.`);
    }
  }

  const opcoesLocal = locais.map((l) => ({ valor: l.id, rotulo: l.rotulo }));

  return (
    <FormDialog
      aberto={aberto}
      titulo={editando ? 'Editar item serializado' : 'Novo item serializado'}
      aoSalvar={salvar}
      aoFechar={aoFechar}
    >
      <CampoTextoForm rotulo="Descrição" valor={descricao} aoMudar={setDescricao} obrigatorio />
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoTextoForm rotulo="Marca" valor={marca} aoMudar={setMarca} />
        <CampoTextoForm rotulo="Modelo" valor={modelo} aoMudar={setModelo} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoTextoForm rotulo="Patrimônio PAT.DAEE" valor={patDaee} aoMudar={setPatDaee} />
        <CampoTextoForm rotulo="Código SP Águas" valor={codigoSpaguas} aoMudar={setCodigoSpaguas} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoTextoForm rotulo="Número de série / IMEI" valor={numeroSerie} aoMudar={setNumeroSerie} />
        <CampoTextoForm
          rotulo="Data de aquisição"
          valor={dataAquisicao}
          aoMudar={setDataAquisicao}
          placeholder="AAAA-MM-DD"
          descricao="Formato AAAA-MM-DD."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <CampoSelectForm
          rotulo="Estado físico"
          valor={estado}
          aoMudar={(v) => setEstado(v as '' | Estado)}
          opcoes={ESTADOS.map((e) => ({ valor: e, rotulo: ROTULO_ESTADO[e] }))}
          placeholder="Não informado"
        />
        <CampoSelectForm
          rotulo="Situação"
          valor={status}
          aoMudar={(v) => setStatus(v as Status)}
          opcoes={STATUS.map((s) => ({ valor: s, rotulo: ROTULO_STATUS[s] }))}
        />
        <CampoSelectForm
          rotulo="Local"
          valor={localId}
          aoMudar={setLocalId}
          opcoes={opcoesLocal}
          placeholder="Sem local"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="unidade-obs" className="text-sm font-medium text-app-fg">
          Observação
        </label>
        <textarea
          id="unidade-obs"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          className="rounded border border-app-border-input bg-app-surface px-3 py-2 text-sm text-app-fg placeholder:text-app-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface"
        />
      </div>
    </FormDialog>
  );
}
