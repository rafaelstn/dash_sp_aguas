'use client';

import { useEffect, useState } from 'react';
import { CampoSelectForm, CampoTextoForm, ErroDeCampo, FormDialog } from '../FormDialog';
import { atualizarDesconformidade, criarUnidade, listarUnidades } from '../api';
import type { DesconformidadeDTO, LocalDTO } from '../dtos';
import {
  localCorrespondente,
  localizacaoPlanilha,
  valoresIniciaisCadastro,
  type ValoresCadastroItem,
} from './desconformidades-ui';
import {
  cadastrarEResolver,
  mesmoCodigo,
  type DepsCadastro,
  type UnidadeVinculada,
} from './cadastro-item-fluxo';

interface Props {
  item: DesconformidadeDTO | null;
  locais: readonly LocalDTO[];
  /**
   * Unidade já criada para esta desconformidade numa tentativa anterior. Vem da
   * seção (e não de estado deste diálogo) para sobreviver a fechar e reabrir.
   */
  criada: UnidadeVinculada | null;
  /** A unidade passou a existir: a seção guarda o vínculo antes da marcação. */
  aoCriar: (desconformidadeId: string, unidade: UnidadeVinculada) => void;
  /** A unidade do vínculo foi excluída no servidor: a seção esquece o vínculo. */
  aoPerderVinculo: (desconformidadeId: string) => void;
  /** `avisoPendente` vem preenchido quando o item foi criado e a pendência não fechou. */
  aoFechar: (avisoPendente?: string) => void;
  aoConcluir: (mensagem: string) => void;
  /** 409 `desconformidade_alterada`: a seção fecha, avisa e recarrega a lista. */
  aoAlterada: (mensagem: string) => void;
}

const VAZIO: ValoresCadastroItem = valoresIniciaisCadastro({});

/**
 * Cadastra o item que a importação pulou por falta de descrição e fecha a
 * pendência. Formulário próprio porque o UnidadeForm não expõe o código da
 * etiqueta nem devolve a unidade criada. A regra de nunca criar a segunda
 * unidade mora em `cadastro-item-fluxo.ts`.
 */
export function CadastrarItemDialog({
  item,
  locais,
  criada,
  aoCriar,
  aoPerderVinculo,
  aoFechar,
  aoConcluir,
  aoAlterada,
}: Props) {
  const aberto = item !== null;
  const [v, setV] = useState<ValoresCadastroItem>(VAZIO);
  const [localId, setLocalId] = useState('');
  const [existente, setExistente] = useState<UnidadeVinculada | null>(null);

  useEffect(() => {
    if (!item) return;
    setV(valoresIniciaisCadastro(item.dados));
    setLocalId(localCorrespondente(item.dados, locais));
    setExistente(null);
    // `locais` fora de propósito: recarregar a lista não pode apagar o que foi digitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  const campo = (chave: keyof ValoresCadastroItem) => (valor: string) =>
    setV((atual) => ({ ...atual, [chave]: valor }));

  // A oferta de vincular vale só enquanto o código digitado é o do item achado.
  const existenteValido = existente && mesmoCodigo(existente.codigo, v.codigo) ? existente : null;
  const vinculo = criada ?? existenteValido;

  async function salvar() {
    if (!item) return;
    const deps: DepsCadastro = {
      criarUnidade,
      buscarPorCodigo: async (codigo) =>
        (await listarUnidades({ codigo, pagina: 1, porPagina: 2 })).itens,
      atualizarDesconformidade,
      aoCriar: (u) => aoCriar(item.id, u),
      aoPerderVinculo: () => {
        setExistente(null);
        aoPerderVinculo(item.id);
      },
    };
    const r = await cadastrarEResolver({ desconformidade: item, valores: v, localId, vinculo }, deps);
    switch (r.tipo) {
      case 'resolvida':
        aoConcluir(r.mensagem);
        return;
      case 'alterada':
        aoAlterada(r.mensagem);
        return;
      case 'codigoDuplicado':
        setExistente(r.existente);
        throw new Error(r.mensagem);
      case 'invalido':
        throw new ErroDeCampo(r.campo, r.mensagem);
      default:
        throw new Error(r.mensagem);
    }
  }

  function fechar() {
    aoFechar(
      criada
        ? `O item "${criada.descricao}" foi cadastrado, mas a desconformidade continua aberta. Marque como resolvida.`
        : undefined,
    );
  }

  const opcoesLocal = locais.map((l) => ({ valor: l.id, rotulo: l.rotulo }));
  const rotuloConfirmar = criada
    ? 'Marcar como resolvida'
    : existenteValido
      ? 'Vincular ao item existente'
      : 'Cadastrar';

  return (
    <FormDialog
      aberto={aberto}
      titulo="Cadastrar item"
      rotuloConfirmar={rotuloConfirmar}
      aoSalvar={salvar}
      aoFechar={fechar}
    >
      {item ? (
        <p className="text-sm text-app-fg-muted">{localizacaoPlanilha(item.aba, item.linha)}</p>
      ) : null}
      {criada ? (
        <p className="rounded bg-app-surface-2 px-3 py-2 text-sm text-app-fg">
          O item <strong className="font-semibold">&ldquo;{criada.descricao}&rdquo;</strong> já foi
          cadastrado. Falta marcar a desconformidade como resolvida.
        </p>
      ) : null}
      <fieldset disabled={criada !== null} className="space-y-4 disabled:opacity-70">
        <legend className="sr-only">Dados do item</legend>
        <CampoTextoForm
          rotulo="Descrição"
          campo="descricao"
          valor={v.descricao}
          aoMudar={campo('descricao')}
          obrigatorio
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTextoForm rotulo="Código da etiqueta" valor={v.codigo} aoMudar={campo('codigo')} />
          <CampoTextoForm rotulo="Patrimônio PAT.DAEE" valor={v.patDaee} aoMudar={campo('patDaee')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTextoForm rotulo="Marca" campo="marca" valor={v.marca} aoMudar={campo('marca')} />
          <CampoTextoForm rotulo="Modelo" campo="modelo" valor={v.modelo} aoMudar={campo('modelo')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTextoForm
            rotulo="Número de série / IMEI"
            valor={v.numeroSerie}
            aoMudar={campo('numeroSerie')}
          />
          <CampoSelectForm
            rotulo="Local"
            valor={localId}
            aoMudar={setLocalId}
            opcoes={opcoesLocal}
            placeholder="Sem local"
          />
        </div>
      </fieldset>
    </FormDialog>
  );
}
