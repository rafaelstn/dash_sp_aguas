# ADR 0022: RBAC com tres papeis (super_admin, admin, user)

Data: 2026-08-18
Status: aceita
Contexto de decisao: registro RETROATIVO. A implementacao entrou no commit 29324b4
("feat(auth): RBAC com 3 papeis (super_admin/admin/user) + pacote de login") e esta em producao
desde entao; este ADR documenta a decisao que ja governa o codigo, para fechar a lacuna de
rastreabilidade apontada na verificacao de 18/08/2026. Autoria da implementacao: Andre (Seguranca)
e Lucas (backend), orquestrados por Matheus (CTO). Cliente GOVERNO (SP Aguas): rules `governo`,
`padrao`.

## Contexto

A ADR 0004 fixou a primeira autenticacao do MVP e registrou, entre as decisoes vigentes,
**"sem RBAC"**, com a ressalva de que "evolucao pra RBAC fica para ADR futuro se necessario"
(ADR 0004, item 54). A ADR 0006 pivotou o metodo de login (email e senha, autocadastro
self-service) mantendo explicitamente a ausencia de RBAC.

Depois disso, tres necessidades operacionais tornaram a autorizacao por papel inevitavel:

1. **Triagem de fichas** (ADR 0008): alguem precisa aprovar ou devolver a ficha que o tecnico
   enviou do campo, e quem envia nao pode aprovar o proprio envio.
2. **Gestao de usuarios pelo proprio orgao**: o autocadastro publico foi desativado, e as contas
   passaram a ser criadas dentro do sistema. Isso exige distinguir quem administra usuarios comuns
   de quem pode criar outros administradores.
3. **Edicao de dado oficial**: o cadastro de postos e a base institucional, e alterar dado oficial
   nao pode ser permissao de qualquer conta autenticada.

O RBAC foi implementado para atender essas tres necessidades, mas **nenhum ADR registrou a
decisao**, e a ADR 0004 seguiu afirmando "sem RBAC" como decisao em vigor. Em projeto de orgao
publico, e principalmente com o handoff PRODESP previsto na ADR 0015, uma mudanca de modelo de
autorizacao sem registro e um problema de rastreabilidade: quem assumir a manutencao le a ADR 0004
e conclui o oposto do que o codigo faz.

## Decisao

### 1. Tres papeis, hierarquicos, numa unica fonte de verdade

`src/domain/auth/papel.ts` define `Papel = 'super_admin' | 'admin' | 'user'`, espelhando o `CHECK`
da coluna `papel` em `usuarios_papeis` (migration 0050). Tipo puro, sem I/O.

| Papel | Alcance |
|-------|---------|
| `user` | App de campo (preenche e envia fichas) e consulta. Papel padrao de quem entra sem atribuicao explicita (`PAPEL_PADRAO`). |
| `admin` | Tudo de `user`, mais aprovacao de triagem, edicao de dado oficial e gestao de usuarios comuns (criar, editar, resetar senha). |
| `super_admin` | Tudo de `admin`, mais criacao e edicao de Admins e definicao de papeis. |

### 2. A flag `aprovador` passou a ser derivada, nao armazenada

O modelo anterior tinha uma flag booleana `aprovador`. Ela deixou de existir como dado e virou
funcao do papel: `ehAdmin(papel)` e verdadeiro para `admin` e `super_admin`. Isso evita o estado
inconsistente classico de flag e papel discordando.

### 3. Autorizacao e reforcada no servidor, nunca so na tela

A tela esconde o que o papel nao alcanca, e isso e conveniencia, nao protecao. Cada rota de
`/api/admin/*` revalida o papel do ator antes de agir. As negativas sao registradas como evento de
seguranca (`seg.admin.usuarios.acao_negada`), com o motivo.

### 4. Duas travas de politica que nao dependem do papel

Independentemente de quem chama:

- **Nao se remove o ultimo Super Admin** (motivo `ultimo_super_admin`). Sem isso o sistema pode
  ficar sem ninguem capaz de administrar papeis.
- **Nao se remove a propria conta** (motivo `auto_remocao`).

### 5. Sem MFA

Mantida a decisao da ADR 0010 (remocao do MFA). O RBAC nao a altera.

## Consequencias

- A ADR 0004 tem o item "sem RBAC" **superado por este ADR**. O aviso de leitura dela foi
  atualizado na mesma data para apontar para ca.
- A hierarquia de papeis e a fonte da navegacao: `src/components/layout/nav-itens.ts` mostra
  Triagem e Usuarios apenas para quem e aprovador, e a pagina resolve super admin contra admin.
- Cobertura de teste: `tests/unit/api/admin-usuarios.test.ts` exercita as negativas por politica,
  incluindo `exige_super_admin`, `ultimo_super_admin` e `auto_remocao`.
- Debito conhecido, registrado na verificacao de 18/08/2026: o helper HTTP `exigirSuperAdmin`
  (`src/app/api/_helpers/auth.ts`) nao e chamado por nenhuma rota, porque a distincao entre admin e
  super admin e aplicada dentro da politica de gestao de usuarios. O helper e redundante, nao um
  furo: as rotas estao protegidas por `exigirAdmin` e a politica nega o que exige super admin, e
  isso esta coberto por teste. Decidir entre remover o helper ou passar a usa-lo nas rotas fica
  para quando alguem tocar a camada de autorizacao.

## Alternativas descartadas

- **Manter a flag `aprovador` e somar uma segunda flag para super admin.** Duas flags booleanas
  para tres estados hierarquicos permitem combinacao invalida (super admin que nao e aprovador) e
  exigem guarda para algo que o tipo resolve de graca.
- **Permissoes granulares por acao** em vez de papeis. Alcance maior do que a operacao pede hoje,
  e cada permissao nova viraria migration. Os tres papeis cobrem os casos reais do orgao; se a
  granularidade passar a ser necessaria, o caminho e um ADR novo, com os papeis atuais virando
  presets.
- **Autorizacao apenas na tela**, confiando no menu para esconder o que o papel nao alcanca. Nao e
  autorizacao: a rota continua respondendo para quem a chamar direto.
