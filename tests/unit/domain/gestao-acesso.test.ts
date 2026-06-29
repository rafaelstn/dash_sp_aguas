import { describe, expect, it } from 'vitest';
import { podeCriar, podeGerenciar } from '@/domain/auth/gestao-acesso';

const ATOR = 'ator-id';
const ALVO = 'alvo-id';

describe('domain/auth/gestao-acesso — podeCriar', () => {
  it('super_admin cria qualquer papel', () => {
    expect(podeCriar('super_admin', 'user').permitido).toBe(true);
    expect(podeCriar('super_admin', 'admin').permitido).toBe(true);
    expect(podeCriar('super_admin', 'super_admin').permitido).toBe(true);
  });

  it('admin cria user, mas não admin nem super_admin', () => {
    expect(podeCriar('admin', 'user').permitido).toBe(true);

    const criarAdmin = podeCriar('admin', 'admin');
    expect(criarAdmin.permitido).toBe(false);
    if (!criarAdmin.permitido) expect(criarAdmin.motivo).toBe('exige_super_admin');

    const criarSuper = podeCriar('admin', 'super_admin');
    expect(criarSuper.permitido).toBe(false);
    if (!criarSuper.permitido) expect(criarSuper.motivo).toBe('exige_super_admin');
  });
});

describe('domain/auth/gestao-acesso — podeGerenciar (edição de papel)', () => {
  it('super_admin gerencia user, admin e super', () => {
    expect(podeGerenciar('super_admin', 'user', 'admin', ATOR, ALVO).permitido).toBe(true);
    expect(podeGerenciar('super_admin', 'admin', 'user', ATOR, ALVO).permitido).toBe(true);
    expect(podeGerenciar('super_admin', 'super_admin', 'admin', ATOR, ALVO).permitido).toBe(true);
  });

  it('admin edita user para user (sem promoção)', () => {
    expect(podeGerenciar('admin', 'user', 'user', ATOR, ALVO).permitido).toBe(true);
  });

  it('admin não promove user a admin', () => {
    const r = podeGerenciar('admin', 'user', 'admin', ATOR, ALVO);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toBe('exige_super_admin');
  });

  it('admin não promove user a super_admin', () => {
    const r = podeGerenciar('admin', 'user', 'super_admin', ATOR, ALVO);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toBe('exige_super_admin');
  });

  it('admin não mexe em alvo que já é admin', () => {
    const r = podeGerenciar('admin', 'admin', 'user', ATOR, ALVO);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toBe('exige_super_admin');
  });

  it('admin não mexe em alvo que já é super_admin', () => {
    const r = podeGerenciar('admin', 'super_admin', 'user', ATOR, ALVO);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toBe('exige_super_admin');
  });
});

describe('domain/auth/gestao-acesso — anti auto-alteração/lockout', () => {
  it('ator não altera o próprio papel (mesmo super_admin)', () => {
    const r = podeGerenciar('super_admin', 'super_admin', 'admin', ATOR, ATOR);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toBe('auto_alteracao_papel');
  });

  it('admin não promove a si mesmo', () => {
    const r = podeGerenciar('admin', 'admin', 'super_admin', ATOR, ATOR);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toBe('auto_alteracao_papel');
  });

  it('ator pode resetar a própria senha (papel inalterado, não remoção)', () => {
    // papelDesejado == papelAtual e removendo=false: operação permitida.
    expect(podeGerenciar('admin', 'admin', 'admin', ATOR, ATOR).permitido).toBe(true);
    expect(podeGerenciar('super_admin', 'super_admin', 'super_admin', ATOR, ATOR, true).permitido).toBe(true);
  });

  it('ator não se auto-remove', () => {
    const r = podeGerenciar('super_admin', 'super_admin', 'super_admin', ATOR, ATOR, false, true);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toBe('auto_remocao');
  });

  it('auto-remoção tem precedência sobre último-super (motivo auto_remocao)', () => {
    const r = podeGerenciar('super_admin', 'super_admin', 'super_admin', ATOR, ATOR, true, true);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toBe('auto_remocao');
  });
});

describe('domain/auth/gestao-acesso — proteção do último super_admin', () => {
  it('não rebaixa o último super_admin', () => {
    const r = podeGerenciar('super_admin', 'super_admin', 'admin', ATOR, ALVO, true);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toBe('ultimo_super_admin');
  });

  it('não remove o último super_admin', () => {
    const r = podeGerenciar('super_admin', 'super_admin', 'super_admin', ATOR, ALVO, true, true);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toBe('ultimo_super_admin');
  });

  it('rebaixa super quando NÃO é o último', () => {
    expect(podeGerenciar('super_admin', 'super_admin', 'admin', ATOR, ALVO, false).permitido).toBe(true);
  });

  it('remove super quando NÃO é o último', () => {
    expect(podeGerenciar('super_admin', 'super_admin', 'super_admin', ATOR, ALVO, false, true).permitido).toBe(true);
  });

  it('mantém o último super como super (sem mudança) é permitido', () => {
    // reset de senha do último super por outro super: papelDesejado == super.
    expect(podeGerenciar('super_admin', 'super_admin', 'super_admin', ATOR, ALVO, true, false).permitido).toBe(true);
  });
});

describe('domain/auth/gestao-acesso — precedência das regras', () => {
  it('alvo privilegiado bloqueia admin antes de checar promoção', () => {
    // admin tentando rebaixar super: cai em exige_super_admin (regra 2).
    const r = podeGerenciar('admin', 'super_admin', 'user', ATOR, ALVO, true);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toBe('exige_super_admin');
  });

  it('admin removendo user comum é permitido', () => {
    expect(podeGerenciar('admin', 'user', 'user', ATOR, ALVO, false, true).permitido).toBe(true);
  });

  it('admin não remove admin', () => {
    const r = podeGerenciar('admin', 'admin', 'admin', ATOR, ALVO, false, true);
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.motivo).toBe('exige_super_admin');
  });
});
