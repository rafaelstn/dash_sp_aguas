'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { InputSenha } from '@/components/ui/InputSenha';
import { Button } from '@/components/ui/Button';
import {
  type Papel,
  ROTULO_PAPEL,
} from '@/domain/auth/papel';
import { validarSenha } from '@/domain/auth/politica-senha';
import { criarUsuario, ErroApi } from './api-usuarios';
import { papeisAtribuiveis } from './regras-ui';

export interface FormNovoUsuarioProps {
  aberto: boolean;
  papelAtor: Papel;
  /** Fecha o modal sem criar (cancelar, Esc, backdrop). */
  aoCancelar: () => void;
  /** Chamado após criação bem-sucedida (a tela recarrega a lista). */
  aoCriar: (nome: string) => void;
}

interface ErrosCampo {
  nome?: string;
  email?: string;
  senha?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Modal de criação de usuário. Valida nome, email e senha (política completa
 * `validarSenha`) no cliente antes de enviar; o backend revalida. O seletor de
 * papel só oferece papéis que o ator pode atribuir (`papeisAtribuiveis`).
 *
 * A11y (e-MAG / WCAG 2.1 AA): baseado em `<dialog>` nativo (focus-trap e
 * modalidade via showModal), `aria-labelledby`, foco inicial no primeiro
 * campo, Esc/backdrop fecham quando ocioso, erros com `aria-invalid` +
 * mensagem por campo, e erro geral com `role="alert"`.
 */
export function FormNovoUsuario({
  aberto,
  papelAtor,
  aoCancelar,
  aoCriar,
}: FormNovoUsuarioProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const primeiroCampoRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const tituloId = `${baseId}-titulo`;
  const erroGeralId = `${baseId}-erro`;

  const opcoesPapel = papeisAtribuiveis(papelAtor);
  const papelInicial: Papel = opcoesPapel.includes('user')
    ? 'user'
    : (opcoesPapel[0] ?? 'user');

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState<Papel>(papelInicial);
  const [erros, setErros] = useState<ErrosCampo>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Abre/fecha o <dialog> imperativamente e reseta o formulário a cada
  // abertura (showModal() é o caminho recomendado para modo modal).
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (aberto && !dlg.open) {
      dlg.showModal();
      setNome('');
      setEmail('');
      setSenha('');
      setPapel(papelInicial);
      setErros({});
      setErroGeral(null);
      setEnviando(false);
      requestAnimationFrame(() => primeiroCampoRef.current?.focus());
    } else if (!aberto && dlg.open) {
      dlg.close();
    }
  }, [aberto, papelInicial]);

  function validar(): boolean {
    const novos: ErrosCampo = {};
    if (nome.trim().length < 2) {
      novos.nome = 'Informe o nome (mínimo 2 caracteres).';
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      novos.email = 'Informe um e-mail válido.';
    }
    const erroSenha = validarSenha(senha);
    if (erroSenha) {
      novos.senha = erroSenha;
    }
    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  async function enviar() {
    if (enviando) return;
    setErroGeral(null);
    if (!validar()) return;

    setEnviando(true);
    try {
      await criarUsuario({
        nome: nome.trim(),
        email: email.trim(),
        senha,
        papel,
      });
      aoCriar(nome.trim());
    } catch (e) {
      setErroGeral(
        e instanceof ErroApi
          ? e.message
          : 'Não foi possível criar o usuário. Tente novamente em instantes.',
      );
      setEnviando(false);
    }
  }

  function cancelar() {
    if (enviando) return;
    aoCancelar();
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        if (enviando) {
          e.preventDefault();
          return;
        }
        aoCancelar();
      }}
      onClose={() => {
        if (aberto) aoCancelar();
      }}
      aria-modal="true"
      aria-labelledby={tituloId}
      className="m-0 h-full max-h-none w-full max-w-none rounded-none border-0 bg-app-surface p-0 text-app-fg shadow-gov-card-hover backdrop:bg-black/40 sm:m-auto sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-md sm:rounded-gov-card sm:border sm:border-app-border-subtle"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
        className="flex h-full flex-col"
      >
        <header className="border-b border-app-border-subtle px-5 py-3">
          <h2 id={tituloId} className="text-lg font-semibold">
            Adicionar usuário
          </h2>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Input
            ref={primeiroCampoRef}
            rotulo="Nome"
            name="nome"
            autoComplete="name"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            erro={erros.nome}
            required
          />
          <Input
            rotulo="E-mail institucional"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            erro={erros.email}
            required
          />
          <InputSenha
            rotulo="Senha"
            name="senha"
            autoComplete="new-password"
            descricao="Mínimo de 12 caracteres, combinando letras, números e ao menos um caractere especial."
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            erro={erros.senha}
            required
          />
          <SeletorPapel
            id={`${baseId}-papel`}
            rotulo="Papel"
            valor={papel}
            opcoes={opcoesPapel}
            onChange={setPapel}
          />

          {erroGeral ? (
            <div
              id={erroGeralId}
              role="alert"
              className="rounded border-l-4 border-gov-perigo bg-red-50 p-3 text-sm text-gov-perigo"
            >
              {erroGeral}
            </div>
          ) : null}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-app-border-subtle bg-app-surface-2 px-5 py-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variante="secundario"
            onClick={cancelar}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={enviando}
            aria-describedby={erroGeral ? erroGeralId : undefined}
          >
            {enviando ? 'Criando…' : 'Criar usuário'}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}

/**
 * Seletor de papel acessível (label + select nativo com os tokens do sistema).
 * Select nativo é a escolha mais robusta para teclado/leitor de tela e mobile.
 */
export function SeletorPapel({
  id,
  rotulo,
  valor,
  opcoes,
  onChange,
  disabled,
  className = '',
}: {
  id: string;
  rotulo: string;
  valor: Papel;
  opcoes: readonly Papel[];
  onChange: (papel: Papel) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-medium text-app-fg">
        {rotulo}
      </label>
      <select
        id={id}
        value={valor}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Papel)}
        className={`rounded border border-app-border-input bg-app-surface px-3 py-2 text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface focus-visible:ring-gov-azul disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        {opcoes.map((p) => (
          <option key={p} value={p}>
            {ROTULO_PAPEL[p]}
          </option>
        ))}
      </select>
    </div>
  );
}
