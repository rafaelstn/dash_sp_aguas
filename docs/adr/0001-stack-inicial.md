# ADR-0001: Stack inicial e estratégia de portabilidade de banco

**Data:** 2026-04-22
**Status:** Aceita
**Projeto:** SPÁguas — Ficha Técnica de Postos Hidrológicos
**Responsável:** Bruno — PO Engenharia (Damasceno Dev OS)
**Documentos relacionados:** `../spec.md` (Camila), `../architecture.md` (Bruno)

---

## Contexto

O cliente SPÁguas (Governo do Estado de São Paulo — programa de recursos hídricos) demandou sistema de consulta de postos hidrológicos com 2.484 registros iniciais provenientes de planilha CSV e repositório de arquivos PDF em HD de rede do governo. Restrições e fatos relevantes:

1. **Governo estadual** — LGPD obrigatória, e-MAG/WCAG 2.1 AA obrigatório por lei, auditoria de acesso a dados.
2. **Setor pequeno, poucos usuários** — autenticação federada (SSO/AD) fora do MVP.
3. **Supabase já provisionado** com `.env.local` contendo `URL`, `anon_key` e `service_role` — escolhido para acelerar a POC.
4. **Hospedagem em território nacional a confirmar** no contrato — Supabase é temporário; migração planejada após aprovação do MVP.
5. **HD de rede do governo** como repositório dos PDFs — leitura por *worker* em máquina autorizada da rede, sem direito de escrita no HD.
6. **Stack padrão do Rafael** (Next.js + Tailwind, Python/FastAPI, PostgreSQL) aderente às necessidades do projeto.
7. **Rafael autorizou** que a busca possa ser levemente mais lenta; o que não se admite é perder o histórico documental do prefixo.

A decisão precisa ser tomada agora porque impacta diretamente a estrutura de pastas, as camadas de acesso a dados, a estratégia de *schema* e a organização do *worker*.

---

## Decisão

Adotar, para a Fase 1 (MVP):

1. **Frontend e BFF**: Next.js 15 (App Router) + Tailwind CSS + TypeScript, com Server Components como padrão e API Routes como única fronteira com o banco.
2. **Banco de dados**: PostgreSQL no Supabase — **exclusivamente como POC**. A aplicação acessa o banco por conexão SQL direta (`postgres.js` **ou** `pg` + `drizzle-orm`), **não** pelo SDK `supabase-js` do lado servidor, exceto em eventual camada de autenticação (decisão detalhada pelo PO Segurança).
3. **Worker de indexação**: script Python standalone (não FastAPI) rodando em máquina autorizada da rede do governo, empacotável como executável Windows.
4. **Importação do CSV**: script Python one-shot usando `service_role` localmente e `INSERT ... ON CONFLICT` para idempotência — **não** via *dashboard* do Supabase nem `supabase db import`.
5. **Arquitetura em camadas (Clean Architecture)** com *Ports & Adapters* na fronteira de acesso a dados, de modo que a migração do Supabase para outro PostgreSQL em território nacional seja uma substituição de `DATABASE_URL` e *re-deploy*, **sem reescrita da aplicação**.
6. **Acessibilidade WCAG 2.1 AA** tratada como requisito de arquitetura desde o *scaffold*, não como ajuste posterior.

---

## Alternativas Consideradas

### Alternativa A — Next.js + Supabase SDK (`supabase-js`) acoplado

- **O que é:** Usar `supabase-js` em Server Components e Route Handlers, aproveitando RLS como camada de autorização direta do navegador ao banco.
- **Prós:**
  - Desenvolvimento inicial mais rápido.
  - RLS substitui parte da lógica de autorização.
- **Contras:**
  - **Acopla a aplicação à API proprietária do Supabase** — migração futura obrigaria refactor profundo.
  - Auditoria LGPD dispersa entre cliente e servidor, mais difícil de garantir.
  - Contraria decisão do Rafael em kickoff: “arquitetar para trocar de banco sem reescrever tudo”.
- **Descartada.**

### Alternativa B — Next.js + PostgreSQL via cliente SQL, com Supabase apenas como *host* inicial (ESCOLHIDA)

- **O que é:** Conectar ao PostgreSQL do Supabase por `DATABASE_URL` padrão, usando `postgres.js` ou `pg` no servidor. O Supabase torna-se apenas hospedagem do PG; toda lógica reside no Next.js.
- **Prós:**
  - **Portabilidade total**: qualquer PostgreSQL (Neon, RDS, instância dedicada em território nacional) serve como destino sem refactor.
  - Auditoria LGPD centralizada em uma camada.
  - Controle completo sobre queries, índices e planos de execução.
- **Contras:**
  - Perda da “conveniência” de RLS controlando o navegador — autorização fica explícita no BFF (o que, em contexto governo, é **desejável**, não negativo).
  - Um pouco mais de boilerplate inicial.
- **Escolhida.**

### Alternativa C — FastAPI como backend em vez de API Routes

- **O que é:** Backend Python/FastAPI separado, consumido pelo Next.js por HTTP.
- **Prós:**
  - Stack homogênea com o *worker* e o *importer* (tudo Python).
  - Estrutura de camadas explícita, fácil de testar.
- **Contras:**
  - **Dois *deploys*** para manter (frontend + backend) em um MVP de baixa complexidade de lógica.
  - Overhead de infraestrutura desproporcional ao volume de usuários e à carga do sistema.
  - Tempo de desenvolvimento significativamente maior.
- **Descartada para o MVP.** Avaliar na Fase 2 caso o backend cresça em complexidade (geração de fichas, *upload* de arquivos).

### Alternativa D — Crawler em Node.js em vez de Python para o *worker*

- **O que é:** *Worker* de indexação também em TypeScript, reaproveitando o ecossistema Next.js.
- **Prós:**
  - Uma só linguagem no projeto.
- **Contras:**
  - Rafael já tem Python como stack principal para *scripts* e automação.
  - Bibliotecas de travessia e metadados de arquivos são mais maduras em Python no contexto Windows.
  - Empacotar executável Windows é mais consolidado em Python (PyInstaller).
- **Descartada.**

### Alternativa E — Importação do CSV via *dashboard* do Supabase ou `supabase db import`

- **O que é:** Carregar o CSV diretamente pela UI do Supabase ou pela CLI oficial.
- **Prós:**
  - Zero código.
- **Contras:**
  - Sem idempotência controlada — reexecução duplica ou exige *truncate*.
  - Sem relatório detalhado de rejeições.
  - Sem normalização de acentuação e campos nulos.
  - Acopla o procedimento à UI proprietária do Supabase — não sobrevive à migração de banco.
- **Descartada.** Fica apenas como alternativa de emergência manual.

---

## Consequências

### O que muda
- A equipe adota `postgres.js` (ou `pg`) como cliente SQL no servidor desde o *scaffold*.
- Toda a lógica de acesso a dados passa por *repositories* que implementam interfaces em `application/ports/`.
- Script de importação é versionado em `ops/importer/` e executado via CLI controlada.
- *Worker* é versionado em `ops/indexer/` e empacotado para Windows.

### O que fica mais fácil
- Migrar o banco para território nacional: *dump*/restore + troca de `DATABASE_URL`.
- Reproduzir o ambiente em outra máquina — tudo está em código versionado.
- Auditar a aplicação: uma única fronteira com o banco, um único lugar onde a trilha LGPD é gravada.
- Testar casos de uso isoladamente, sem depender de cliente HTTP nem de Supabase real.

### O que fica mais difícil
- Aproveitar *features* proprietárias do Supabase (Edge Functions, Realtime). Aceitável — não fazem parte do escopo.
- Autorização fina por usuário fica explícita no servidor, exigindo cuidado do André na modelagem de roles. Esse custo é desejável em contexto governo.

### Riscos aceitos
- **Risco A —** Supabase pode impor limites de conexão no plano gratuito; mitigação via *connection pool* e, se necessário, PgBouncer/Supavisor.
- **Risco B —** A migração futura do banco ainda envolve trabalho de *ops* (DNS, *backup*, *restore*, janela de indisponibilidade). A decisão minimiza o custo de código, não o de infraestrutura. Planejamento operacional fica com o Rodrigo.
- **Risco C —** Autenticação do MVP ainda não está definida. Assumido que o André escolhe a estratégia mínima (Supabase Auth ou solução equivalente) **sem** contaminar o restante da arquitetura — auth fica isolada em `infrastructure/auth/`.

---

## Não fazer

1. Usar `supabase-js` em Server Components, Route Handlers ou *use cases*. A única exceção tolerada é a camada de autenticação, isolada em `infrastructure/auth/` — e mesmo essa deve ser questionada pelo André antes de ser adotada.
2. Expor `SUPABASE_SERVICE_ROLE_KEY` em variáveis `NEXT_PUBLIC_*`. O CI deve falhar caso detecte.
3. Permitir que o navegador se conecte diretamente ao PostgreSQL. Toda consulta passa pela API Route.
4. Usar `FLOAT` para latitude, longitude, área ou altimetria. `NUMERIC` com escala adequada.
5. Construir SQL por concatenação de *strings*. Queries sempre parametrizadas.
6. Escrever no HD de rede a partir do *worker*. Leitura exclusivamente.
7. Tratar acessibilidade como ajuste final. Nasce no *scaffold*.
8. Reexecutar a importação do CSV sem antes inspecionar `import_log`. Cada execução precisa ser rastreável.

---

## Revisão e Substituição

- Revisar esta ADR antes do início da Fase 2 — o escopo de *upload* de arquivos e geração de ficha persistida pode justificar promover o backend Python para FastAPI.
- Em caso de mudança de provedor de banco (migração para território nacional), registrar ADR complementar (por exemplo, `0002-migracao-banco-territorio-nacional.md`) sem alterar esta.
