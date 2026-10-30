# CLAUDE.md: Meu Bizu

Regras do projeto para agentes e desenvolvedores. Plano e pilha: `docs/plano-de-acao.md`. API e
tela: `docs/api-e-tela.md`.

## O que é

Produto para vestibulandos (maioria 18+) que operam sozinhos: informam o que marcaram numa prova do
Enem e veem, por habilidade, onde focar. Mentores só em fase posterior. Estado: desenvolvimento.

## Pilha

Python 3.12 + FastAPI, PostgreSQL 16 (schemas `ref` e `app`, RLS por usuário), React + Vite +
TypeScript (fase F3), Claude para redigir o relatório. Sem Redis no MVP. Deploy: Dockerfile na raiz
no EasyPanel (projeto `meu-bizu`, domínio `meubizu.fabricadosdados.com.br`).

## Princípios

1. Números vêm de SQL e código; a IA só redige, e recebe apenas números, nunca dado pessoal.
2. Gravar a folha de respostas; recalcular o perfil sempre.
3. A API não devolve o gabarito oficial nas rotas de entrada; o servidor corrige depois de gravar.
4. Tudo selecionável na tela e validado de novo no servidor.
5. Simplicidade vence sofisticação: o que é de fase futura não entra.

## Segurança (repositório PÚBLICO)

- Nunca commitar segredo, `.env`, dado de aluno, microdado do INEP, parquet ou sqlite.
- Só `.env.example` com placeholders.
- Entrada validada com Pydantic; nada de SQL por concatenação.
- Tabela de aluno com RLS e teste negativo de vazamento entre usuários.
- Runtime usa papel sem privilégios no banco; o dono do schema só para migrations.

## Fluxo de trabalho

- Uma branch por tarefa, PR pequeno para `main`; TDD no backend (teste primeiro).
- Revisão antes de mergear. Decisões estruturais viram doc em `docs/`.

## Comandos

```bash
cd backend
pip install -r requirements-dev.txt
pytest
ruff check . && ruff format --check .
uvicorn app.main:app --reload
```

## Linguagem (UI e textos)

Segunda pessoa ("você"), frases curtas, sem punição. Gíria só em microcopy e selos; botões com o
verbo literal. Sem jargão (decil, TRI, z) na frente do aluno. Nunca "bizutagem" (significa trote).
Visual clean e amigável. Nada de "análise preditiva": a base é descritiva.
