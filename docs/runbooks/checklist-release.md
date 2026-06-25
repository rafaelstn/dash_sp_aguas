# Checklist de release bloqueante (BASE-5)

Porta de qualidade antes de cada deploy em órgão público. Todo item é
**bloqueante**: se algum falhar, o deploy não sai até resolver ou registrar
exceção aprovada. Combina as exigências de `padrao.md`, `governo.md` e do plano de
remediação 2026-06-25.

## 1. Qualidade de código

- [ ] `npm run typecheck` verde (sem erro de tipo).
- [ ] `npm run lint` verde (`--max-warnings 0`).
- [ ] `npm run test` verde (toda a suíte).
- [ ] `npm run build` conclui sem erro.

## 2. Segurança e segredos

- [ ] `git log`/diff sem secret (chave, token, senha, `.env`). `.gitignore` cobre
      todo `.env.*` exceto `*.example`.
- [ ] Allowlist de domínio **sem wildcard** em produção (`env.ts`, verificado por teste).
- [ ] CORS restritivo; `debug=false`; sem `console.log` de PII/segredo.
- [ ] Dependências sem CVE crítica conhecida (`npm audit` revisado).

## 3. Banco e migrations

- [ ] Migrations novas **aplicadas e confirmadas no banco** (não basta commitar):
      checar `information_schema` ou rodar o migrate idempotente.
- [ ] Sem migration pendente acumulada (sinal de deploy de backend que não rodou).

## 4. LGPD e governo

- [ ] Backup de produção cifrado e com ACL restrita (`BACKUP_ENCRYPTION_KEY` setada).
- [ ] Job de anonimização da trilha (LGPD-4) agendado/funcionando.
- [ ] Audit trail registrando acesso a dado de cidadão (quem, quando, o quê).
- [ ] Mudança com impacto em dado pessoal revisada quanto a finalidade/minimização.

## 5. Acessibilidade (e-MAG / WCAG 2.1 AA)

- [ ] Telas novas/alteradas passaram pelo checklist de a11y (foco visível, labels,
      contraste, navegação por teclado). Ver `docs/acessibilidade/`.
- [ ] Sem regressão de contraste de token (a paleta passa AA).

## 6. Observabilidade e rollback

- [ ] Logs estruturados em operação crítica; alertas SIEM ativos.
- [ ] Plano de rollback claro para a mudança (migration reversível ou compensável).

## 7. Documentação

- [ ] Changelog/handoff atualizado quando a mudança é relevante.
- [ ] ADR registrado para decisão de arquitetura, auth ou contrato de API.

---

Exceção a qualquer item exige registro explícito (motivo + aprovação do Rafael)
antes do deploy. Em governo, "passou no meu ambiente" não substitui o checklist.
