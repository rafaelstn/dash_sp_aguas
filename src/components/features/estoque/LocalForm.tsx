'use client';

import { useEffect, useState } from 'react';
import { UNIDADES_FISICAS } from '@/domain/estoque/local';
import { FormDialog, CampoSelectForm, CampoTextoForm } from './FormDialog';
import { atualizarLocal, criarLocal } from './api';
import { ROTULO_UNIDADE_FISICA } from './rotulos';
import type { LocalDTO, UnidadeFisica } from './dtos';

interface Props {
  aberto: boolean;
  local: LocalDTO | null;
  aoFechar: () => void;
  aoConcluir: (mensagem: string) => void;
}

const vazioParaNull = (s: string) => {
  const t = s.trim();
  return t === '' ? null : t;
};

/** Formulario de criar/editar local de estoque. */
export function LocalForm({ aberto, local, aoFechar, aoConcluir }: Props) {
  const editando = local !== null;
  const [unidade, setUnidade] = useState<UnidadeFisica>('PENHA');
  const [sala, setSala] = useState('');
  const [prateleira, setPrateleira] = useState('');
  const [armario, setArmario] = useState('');
  const [observacao, setObservacao] = useState('');

  useEffect(() => {
    if (!aberto) return;
    setUnidade(local?.unidade ?? 'PENHA');
    setSala(local?.sala ?? '');
    setPrateleira(local?.prateleira ?? '');
    setArmario(local?.armario ?? '');
    setObservacao(local?.observacao ?? '');
  }, [aberto, local]);

  async function salvar() {
    const dados = {
      unidade,
      sala: vazioParaNull(sala),
      prateleira: vazioParaNull(prateleira),
      armario: vazioParaNull(armario),
      observacao: vazioParaNull(observacao),
    };
    if (editando) {
      const r = await atualizarLocal(local.id, dados);
      aoConcluir(`Local "${r.rotulo}" atualizado.`);
    } else {
      const r = await criarLocal(dados);
      aoConcluir(`Local "${r.rotulo}" criado.`);
    }
  }

  return (
    <FormDialog
      aberto={aberto}
      titulo={editando ? 'Editar local' : 'Novo local'}
      aoSalvar={salvar}
      aoFechar={aoFechar}
    >
      <CampoSelectForm
        rotulo="Unidade"
        valor={unidade}
        aoMudar={(v) => setUnidade(v as UnidadeFisica)}
        opcoes={UNIDADES_FISICAS.map((u) => ({ valor: u, rotulo: ROTULO_UNIDADE_FISICA[u] }))}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <CampoTextoForm rotulo="Sala" valor={sala} aoMudar={setSala} />
        <CampoTextoForm rotulo="Prateleira" valor={prateleira} aoMudar={setPrateleira} />
        <CampoTextoForm rotulo="Armário" valor={armario} aoMudar={setArmario} />
      </div>
      <CampoTextoForm rotulo="Observação" valor={observacao} aoMudar={setObservacao} />
    </FormDialog>
  );
}
