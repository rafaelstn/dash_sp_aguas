'use client';

import { useEffect, useState } from 'react';
import { NATUREZAS } from '@/domain/estoque/material';
import { FormDialog, CampoSelectForm, CampoTextoForm } from './FormDialog';
import { atualizarMaterial, criarMaterial } from './api';
import { ROTULO_NATUREZA } from './rotulos';
import type { CategoriaDTO, MaterialDTO, Natureza } from './dtos';

interface Props {
  aberto: boolean;
  /** null = criar; preenchido = editar. */
  material: MaterialDTO | null;
  /** Natureza fixada ao criar a partir de uma aba. */
  naturezaInicial?: Natureza;
  categorias: readonly CategoriaDTO[];
  aoFechar: () => void;
  aoConcluir: (mensagem: string) => void;
}

const vazioParaNull = (s: string) => {
  const t = s.trim();
  return t === '' ? null : t;
};

/** Formulario de criar/editar material do catalogo. */
export function MaterialForm({
  aberto,
  material,
  naturezaInicial = 'quantificavel',
  categorias,
  aoFechar,
  aoConcluir,
}: Props) {
  const editando = material !== null;
  const [descricao, setDescricao] = useState('');
  const [natureza, setNatureza] = useState<Natureza>(naturezaInicial);
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [unidadeMedida, setUnidadeMedida] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    if (!aberto) return;
    setDescricao(material?.descricao ?? '');
    setNatureza(material?.natureza ?? naturezaInicial);
    setMarca(material?.marca ?? '');
    setModelo(material?.modelo ?? '');
    setUnidadeMedida(material?.unidadeMedida ?? '');
    setCategoriaId(material?.categoriaId ?? '');
    setAtivo(material?.ativo ?? true);
  }, [aberto, material, naturezaInicial]);

  async function salvar() {
    if (descricao.trim().length < 1) {
      throw new Error('Informe a descrição do material.');
    }
    const dados = {
      descricao: descricao.trim(),
      natureza,
      marca: vazioParaNull(marca),
      modelo: vazioParaNull(modelo),
      unidadeMedida: vazioParaNull(unidadeMedida),
      categoriaId: categoriaId || null,
    };
    if (editando) {
      await atualizarMaterial(material.id, { ...dados, ativo });
      aoConcluir(`Material "${dados.descricao}" atualizado.`);
    } else {
      await criarMaterial(dados);
      aoConcluir(`Material "${dados.descricao}" criado.`);
    }
  }

  const opcoesCategoria = categorias.map((c) => ({ valor: c.id, rotulo: c.nome }));

  return (
    <FormDialog
      aberto={aberto}
      titulo={editando ? 'Editar material' : 'Novo material'}
      aoSalvar={salvar}
      aoFechar={aoFechar}
    >
      <CampoTextoForm rotulo="Descrição" valor={descricao} aoMudar={setDescricao} obrigatorio />
      {editando ? (
        <p className="text-2xs text-app-fg-muted">
          Natureza: <span className="font-medium">{ROTULO_NATUREZA[natureza]}</span> (não pode ser
          alterada após a criação).
        </p>
      ) : (
        <CampoSelectForm
          rotulo="Natureza"
          valor={natureza}
          aoMudar={(v) => setNatureza(v as Natureza)}
          opcoes={NATUREZAS.map((n) => ({ valor: n, rotulo: ROTULO_NATUREZA[n] }))}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoTextoForm rotulo="Marca" valor={marca} aoMudar={setMarca} />
        <CampoTextoForm rotulo="Modelo" valor={modelo} aoMudar={setModelo} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoTextoForm
          rotulo="Unidade de medida"
          valor={unidadeMedida}
          aoMudar={setUnidadeMedida}
          placeholder="un, m, par"
        />
        <CampoSelectForm
          rotulo="Categoria"
          valor={categoriaId}
          aoMudar={setCategoriaId}
          opcoes={opcoesCategoria}
          placeholder="Sem categoria"
        />
      </div>
      {editando ? (
        <label className="flex items-center gap-2 text-sm text-app-fg">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="h-4 w-4 rounded border-app-border-input text-gov-azul focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          />
          Material ativo (desmarque para inativar sem excluir)
        </label>
      ) : null}
    </FormDialog>
  );
}
