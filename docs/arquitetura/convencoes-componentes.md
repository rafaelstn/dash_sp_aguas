# Convenção de componente máximo e extração de hooks (BASE-4)

Previne a reincidência dos componentes gigantes que a auditoria de arquitetura
(25/06/2026) apontou (`FormularioFichaMobile` com 977 linhas, `EditorDiagrama`
com 724). Componente grande mistura render, estado e regra, e fica intestável.

## Regra

- **Componente React deve ficar abaixo de ~400 linhas.** Acima disso, é sinal de
  que há lógica a extrair — não é limite burocrático, é gatilho de refatoração.
- O que se extrai, em ordem de preferência:
  1. **Regra pura → `domain/`**: validação, normalização, cálculo, máscara,
     parsing. Sem React, testável isoladamente (ex.: `domain/fichas/validacao-ficha.ts`,
     `lib/numero-pt-br.ts`, `lib/mascara-campos.ts`).
  2. **Estado/efeito com coesão → hook `useX`**: GPS, submissão, histórico
     undo/redo, auto-save (ex.: `useGpsFicha`, `useSubmissaoFicha`,
     `useHistoricoDiagrama`, `useAutoSave`). O hook recebe callbacks para o
     componente persistir o estado dono (não duplica a fonte da verdade).
  3. **Sub-render coeso → subcomponente**: uma seção de formulário, um painel, um
     card. Mantém o componente-pai como orquestrador.

## Como aplicar

- Ao criar um componente novo, já separar regra pura e estado complexo de saída.
- Ao tocar um componente existente acima do limite, extrair a parte que você está
  mexendo (regra do escoteiro) em vez de engordar mais.
- Hooks de um componente moram em `components/<area>/hooks/` ou ao lado do
  componente; regra pura mora em `domain/` ou `lib/`.
- Toda regra pura extraída ganha teste (a extração é a oportunidade de testar o
  que antes estava preso no componente).

## Exceção aceita

Componentes cujo tamanho é só JSX de render (formulário longo com muitos campos)
podem passar do limite quando a lógica já foi extraída e o que resta é marcação.
Nesse caso, considerar quebrar em subcomponentes de seção, mas não é bloqueante.
