'use client';

import { useEffect, useState } from 'react';
import { FormDialog, CampoTextoForm } from './FormDialog';
import { atualizarCategoria, criarCategoria } from './api';
import type { CategoriaDTO } from './dtos';

interface Props {
  aberto: boolean;
  categoria: CategoriaDTO | null;
  aoFechar: () => void;
  aoConcluir: (mensagem: string) => void;
}

/** Formulario de criar/editar categoria do catalogo. */
export function CategoriaForm({ aberto, categoria, aoFechar, aoConcluir }: Props) {
  const editando = categoria !== null;
  const [nome, setNome] = useState('');

  useEffect(() => {
    if (!aberto) return;
    setNome(categoria?.nome ?? '');
  }, [aberto, categoria]);

  async function salvar() {
    if (nome.trim().length < 1) {
      throw new Error('Informe o nome da categoria.');
    }
    if (editando) {
      await atualizarCategoria(categoria.id, nome.trim());
      aoConcluir(`Categoria "${nome.trim()}" atualizada.`);
    } else {
      await criarCategoria(nome.trim());
      aoConcluir(`Categoria "${nome.trim()}" criada.`);
    }
  }

  return (
    <FormDialog
      aberto={aberto}
      titulo={editando ? 'Editar categoria' : 'Nova categoria'}
      aoSalvar={salvar}
      aoFechar={aoFechar}
    >
      <CampoTextoForm rotulo="Nome" valor={nome} aoMudar={setNome} obrigatorio />
    </FormDialog>
  );
}
