# Meu Bizu: plano de ação

Nome comercial de trabalho (provisório, pendente de busca de marca no INPI). Este documento fixa a
estratégia inicial, a pilha e as fases. Estado: **desenvolvimento**, sem produção.

## 1. Produto e escopo

- **Para quem:** vestibulandos, em maioria maiores de 18 anos, que operam a ferramenta **sozinhos**.
  Mentores entram em uma fase posterior, para refinar o produto antes de produção.
- **O que faz:** o aluno informa o que marcou numa prova do Enem (do Enem real ou de um simulado
  em prova antiga). O sistema corrige, compara com quem tem a mesma nota e mostra, por habilidade,
  onde focar. Histórico mostra a evolução.
- **Regra de ouro:** números vêm de SQL e código determinísticos; a IA só redige o texto.
- **Fora do escopo agora:** resolver questões dentro do app (o aluno faz a prova no papel ou no
  PDF do INEP), visão do mentor, cadernos adaptados, pagamento.

## 2. Estratégia

1. **Dois repositórios com papéis distintos.**
   - `enem-simulador` (privado, local): laboratório de dados. Carga dos microdados do INEP
     2016-2025, textos das questões, agregados por decil, validação. Os dados brutos ficam fora do
     git.
   - `meu-bizu` (público, este): o produto. API, tela e implantação. Consome uma **base de
     referência** exportada do laboratório.
2. **Base de referência pequena e publicável:** itens, textos das questões, habilidades, estatística
   por item e agregados por decil (~230 mil linhas). São dados públicos do INEP e agregados, sem
   pessoa. Os microdados brutos nunca entram no produto nem no repositório.
3. **Fundação primeiro:** repositório, CI, imagem Docker, projeto no EasyPanel e domínio no ar com
   um `/saude` antes de qualquer funcionalidade. Assim o caminho até o servidor está provado cedo.
4. **Fatias verticais pequenas**, com teste antes (TDD no backend) e PR pequeno para `main`.

## 3. Pilha

| Camada | Escolha | Motivo |
|---|---|---|
| Backend | Python 3.12, FastAPI, Pydantic v2 | Mesma pilha da Fábrica; reaproveita o código do laboratório de dados (perfil, TRI, histórico). |
| Acesso a dados | SQLAlchemy 2 + Alembic, psycopg 3 | Migrations versionadas; SQL explícito onde importa. |
| Banco | PostgreSQL 16 (serviço no EasyPanel) | Schema `ref` (referência, só leitura) e `app` (alunos e provas, com RLS por usuário). |
| Fila e cache | **Sem Redis no MVP** | Simplicidade. Entra quando houver rate limit de login ou fila do relatório por IA. |
| Frontend | React 18, Vite, TypeScript, TanStack Query, Tailwind | Mesma base dos outros projetos. Mobile-first e instalável (PWA), pois o aluno usa o celular. |
| Testes | pytest (backend), Vitest + Testing Library (frontend) | |
| Login | E-mail e senha (argon2), cookie httpOnly | Login com Google depois, por reduzir atrito para o jovem. |
| IA | Claude por trás de um adaptador | Só redige o relatório a partir de números; nenhum dado pessoal vai à IA. |
| Entrega | Dockerfile multi-estágio (o build do front é servido pela API) | Um único serviço. |
| Hospedagem | EasyPanel na VPS `46.62.130.249`: serviço App + serviço PostgreSQL, projeto `meu-bizu` | Domínio `meubizu.fabricadosdados.com.br`, TLS pelo EasyPanel. |
| CI | GitHub Actions: ruff, pytest, depois vitest e build | |
| Observabilidade | Depois (GlitchTip e Uptime Kuma, já existentes na infra) | |

## 4. Ambientes

- **dev** (agora): EasyPanel, domínio `meubizu.fabricadosdados.com.br`. Dados de teste. Sem backup
  obrigatório nem alta disponibilidade.
- **produção** (depois): separada, com backup, rate limit, observabilidade, termos de uso e política
  de privacidade. Só depois da fase com mentores.

## 5. Fases

| Fase | Entrega | Pronto quando |
|---|---|---|
| F0 Fundação | Repositório, CI, Dockerfile, `/saude`, projeto e PostgreSQL no EasyPanel, domínio com TLS | `https://meubizu.fabricadosdados.com.br/saude` responde ok |
| F1 Referência (feita) | Base de referência carregada no PostgreSQL; rotas `anos`, `cadernos`, `questoes` (sem gabarito) | Seletores devolvem os dados reais, com testes (PostgreSQL real, também com a exportação real) |
| F2 Conta e provas | Cadastro e login; gravar prova; corrigir; perfil por habilidade; RLS | Teste negativo: um aluno não lê a prova de outro |
| F3 Tela | Incluir resultado em 4 passos e tela de resultado | Fluxo completo no celular |
| F4 Histórico | Histórico, perfil por área e `nota_estimada` | Comparação entre provas de anos diferentes |
| F5 Relatório | Texto do relatório por IA, linguagem Meu Bizu | Texto só com números do perfil |
| F6 Mentores e produção | Papel de mentor, backup, rate limit, observabilidade, termos e privacidade | Piloto com mentores |

Detalhe do fluxo, da API e da tela: [`api-e-tela.md`](api-e-tela.md).

## 6. Segurança (repositório público)

- Nenhum segredo, dado de aluno, microdado ou arquivo de dados no repositório: só `.env.example` com
  placeholders. `.gitignore` bloqueia `.env`, `*.parquet`, `*.sqlite` e `data/`.
- Segredos ficam nas variáveis de ambiente do EasyPanel.
- Entrada validada com Pydantic; nada de SQL por concatenação.
- Dados do aluno com RLS no PostgreSQL; o escopo vem do token, nunca do corpo da requisição.
- A API nunca devolve o gabarito oficial nas rotas de entrada.
- A aplicação usa um papel sem privilégios no banco; o dono do schema é só para migrations.
- Senhas com argon2; sem senha em log.
- Idade: termo de uso com declaração de ter 18 anos ou mais; revisar antes de produção.

## 7. Decisões em aberto

1. **Licença do repositório** público (enquanto não houver, todos os direitos reservados).
2. **Nome final** e busca de marca no INPI (classes 9, 41 e 42).
3. **Cadernos adaptados:** há dados de referência próprios? Hoje ficam fora.
4. ~~Como a base de referência chega ao servidor~~ **Resolvido na F1:** o laboratório exporta CSVs
   (`python -m enem_simulador.exportar_ref`, fora do git) e `python -m app.carga_ref PASTA` carrega
   no schema `ref`, numa transação, de uma máquina com acesso ao banco.
5. **Login com Google** já no MVP ou depois.

## 8. Riscos

- A base de referência depende da validação já feita no laboratório; mudar a base muda o perfil
  (por isso a folha é gravada e o perfil recalculado).
- Poucos itens por habilidade em cada prova: o `z` e os selos existem para não vender ruído como
  diagnóstico.
- Nome de marca possivelmente em conflito (`bizu.com.br` é uma plataforma de cursos).
- A VPS é compartilhada com vários projetos: limitar CPU e memória do serviço.
