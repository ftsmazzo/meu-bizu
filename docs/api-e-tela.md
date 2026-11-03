# API e tela de inclusão de resultados (desenho)

Desenho da camada que fica entre o módulo `historico.py` e o aluno. Ainda não é código: serve para
aprovar fluxo, contratos e regras antes de implementar. A pilha sugerida segue a da Fábrica
(FastAPI + React + PostgreSQL com RLS); é suposição a confirmar, o desenho vale para outra.

## 1. Princípios

1. **O aluno informa o que marcou, nunca o gabarito.** A API não devolve o gabarito oficial em
   nenhuma rota de entrada: quem corrige é o servidor, depois de gravar.
2. **Tudo selecionável.** Ano, área, língua, caderno e cada resposta são escolhas, não texto livre.
   O servidor valida de novo (a tela não é fronteira de segurança).
3. **Gravar a folha, recalcular o resto.** O perfil nunca é gravado; muda se a base for corrigida.
4. **Números vêm de SQL/código; a IA só redige.** O texto do relatório recebe o perfil pronto.
5. **Dado de aluno é dado pessoal** (muitos são menores): isolamento por escritório com RLS,
   consentimento do responsável quando menor, e nenhum dado pessoal vai para a IA (só números).

## 2. Fluxo da tela "Incluir resultado"

```
1 Prova        2 Respostas             3 Conferir          4 Resultado
ano -> área    grade com 1 linha       resumo: marcadas,   acertos, referência,
-> (língua)    por questão (A-E,       brancos, duplas.    lacunas por habilidade,
-> caderno     branco, dupla)          Voltar ou gravar.   comparação com provas
-> tipo/nota                                               anteriores.
```

**Passo 1 – Prova.** Quatro seletores em cascata; cada um só oferece o que existe:

- *Ano*: os anos da base (2023 em diante em destaque, pois é onde está a maioria dos alunos).
- *Área*: LC, CH, CN, MT. Em LC aparece *Língua* (inglês ou espanhol).
- *Caderno*: "AZUL (código 1211)". A cor sozinha não basta: repete no mesmo ano. Cadernos
  adaptados e ambíguos aparecem desabilitados com o motivo. Ajuda: "o código está impresso na capa".
- *Tipo*: "Fiz no Enem" (usa o ano da prova) ou "Refiz como simulado" (pede a data). *Nota*
  opcional, com a explicação "melhora a comparação; sem ela estimamos pelos acertos".

**Colar em vez de selecionar (feito).** No topo do passo 1 há um campo para colar um cartão como
`2023 · LC · Inglês · AZUL 1201 · B.AADC…` (ou só a sequência de respostas). A tela lê ano, área
(`LC`, `CH`, `CN`, `MT` ou o nome), língua, código do caderno e a sequência (`A`–`E`, `.` branco,
`*` dupla), escolhe tudo e abre a grade já preenchida. O que protege de erro: o código só vale se
existir no ano e na área (senão avisa e não avança) e a sequência precisa ter o tamanho da prova.
É só texto no navegador; nada novo na API. Próximo passo, a foto da folha: ler as marcações com
visão computacional e **sempre** mostrar a grade preenchida para o aluno conferir antes de gravar.

**Passo 2 – Respostas.** Grade com uma linha por questão, na ordem do caderno (45; em LC são as 5 da
língua mais as 40 comuns). Cada linha tem as opções A B C D E, "em branco" e "dupla marcação".

- Teclado primeiro: tecla A–E marca e avança; `.` branco; `*` dupla; seta volta.
- O enunciado da questão aparece recolhido ao lado (`questao_texto`, só as de texto confiável),
  para o aluno conferir que está na questão certa; figuras aparecem como "[Imagem]" por ora.
- Salva rascunho no navegador enquanto preenche; só grava no servidor no passo 3.
- Sem pré-marcação e sem gabarito à vista.

**Passo 3 – Conferir.** "43 marcadas, 2 em branco, 0 duplas." Avisa se a folha está quase toda
igual (provável erro) ou toda em branco. Botão "Gravar".

**Passo 4 – Resultado.** Mostra de imediato: acertos / itens avaliados, a referência usada (decil
ou "esperado por TRI"), as habilidades com maior lacuna e quedas em itens-armadilha. Itens
anulados não contam e a tela diz quantos foram.

## 3. Outras telas

- **Histórico**: linha do tempo das provas (data, tipo, área, acertos, referência). Eixo de
  comparação entre provas: `nota_estimada` (campo novo, calculado para todas as provas pela TRI a
  partir dos acertos, igual para decil e TRI), não o acerto bruto, porque as provas variam de
  dificuldade.
- **Perfil**: por área, habilidades em ordem de lacuna. Cada linha mostra n, acerto, esperado e um
  selo: *firme* (z <= -2), *indicativo* (-2 < z <= -1), *sem sinal*, *poucos itens* (n < 3).
  Armadilhas aparecem como "caiu na pegadinha em X itens".
- **Corrigir prova**: editar a folha ou excluir uma prova (com registro de quem e quando).
- **Visão do mentor/escritório** (fase seguinte): lista de alunos e perfil de cada um.

## 4. Contratos da API (REST, JSON)

Todas as rotas exigem login; o escopo (aluno ou escritório) vem do token, nunca do corpo.

| Rota | Faz | Observações |
|---|---|---|
| `GET /anos` | anos disponíveis | `anos_disponiveis()` |
| `GET /anos/{ano}/areas/{area}/cadernos` | opções de caderno | `cadernos_do_ano`; traz `selecionavel`, `motivo`, `referencia` |
| `GET /cadernos/{co_prova}/questoes?ano&area&lingua` | questões na ordem para a grade | posição, enunciado, alternativas; **sem gabarito** |
| `POST /alunos/{id}/provas` | grava uma prova | corpo abaixo; 201 com o resultado já calculado |
| `GET /alunos/{id}/provas` | histórico | ordenado por data |
| `PUT/DELETE /alunos/{id}/provas/{prova_id}` | corrige/exclui | auditado |
| `GET /alunos/{id}/perfil?area=&desde=` | resumo por prova + perfil | `perfil_gravado` |
| `GET /alunos/{id}/relatorio?area=` | texto do relatório | IA redige sobre o perfil, só números |

Corpo de `POST /alunos/{id}/provas`:

```json
{
  "ano": 2024, "area": "CH", "co_prova": 1343, "lingua": null,
  "tipo": "simulado", "feita_em": "2026-03-10", "nota": null,
  "folha": "ABCDE.ABCD..."
}
```

Erros: `422` com a mensagem de `respostas_da_folha` (tamanho errado, letra inválida, caderno
ambíguo, língua faltando); `404` caderno inexistente; `403` fora do escopo. Nada é gravado em erro.

**Como ficou na F2** (o aluno opera sozinho, então o escopo é sempre o usuário da sessão e nenhum
caminho leva id de aluno): `POST /conta/cadastro`, `POST /conta/entrar`, `POST /conta/sair`,
`GET /conta/eu`, `POST /provas`, `GET /provas`, `GET /provas/{id}`, `DELETE /provas/{id}` e
`GET /perfil?area=&desde=`. Prova de outra pessoa responde 404, igual a prova inexistente. O
relatório por IA fica para a F5.

**Raio-X pela nota (feito):** `POST /raio-x` com `{ano, notas: {LC?, CH?, CN?, MT?}, lingua?}`
(login exigido; nada é gravado). Para cada área devolve o grupo de 10% em que a nota cai e a
frente de quantos participantes ela está (`a_frente_de`), o próximo degrau (meio do grupo
seguinte), o total esperado de acertos, as questões da prova do ano separadas em seguras, ao
alcance e difíceis, as habilidades em que mais se ganha ao subir um degrau (`foco`) e até 5
questões ao alcance, com o texto (nunca o gabarito). A chance de cada questão é o acerto
**observado** do grupo do aluno; sem dado observado cai na TRI. Itens anulados ou sem parâmetro não
contam. É uma leitura descritiva ("o que costuma acontecer com quem tem a sua nota"), não um
diagnóstico das respostas. Link do INEP para consultar a nota:
`https://enem.inep.gov.br/participante/` (o produto nunca pede a senha do gov.br). Falta a
coerência por resposta (exige as marcações).

**Ranking por estado e município:** `POST /raio-x` aceita `uf` (sigla) e `municipio` (código IBGE de
7 dígitos) e devolve, por área, `brasil`, `uf` e `municipio` como `{nome, a_frente_de, n}`:
a nota supera **pelo menos** `a_frente_de`% de `n` participantes (o maior marco de 5 em 5 que ela
já alcançou; nunca arredonda para cima; 0 abaixo do percentil 5 e 95 acima do 95). Local sem dado
suficiente vem `null`. As listas para o formulário são `GET /geo/ufs?ano=` e
`GET /geo/municipios?ano=&uf=`. Os dados vêm de `ref.nota_geo` (migração 004): 19 percentis por
(ano, área, Brasil/UF/município), exportados pelo laboratório com
`python -m enem_simulador.exportar_geo` (arquivo `nota_geo.csv` da exportação), com a mesma população
do `decil_nota`. Só agregados; estado com menos de 30 e município com menos de 50 participantes não
são exportados. UF e município são os do **local da prova**: os microdados do INEP não trazem o de
residência. A carga no servidor é `python -m app.carga_ref` (substitui toda a base `ref`) depois de
`python -m app.migrar`.

**F5 (código pronto):** `POST /relatorio?area=` (sem `area` = todas). Fluxo: monta os fatos do
perfil (áreas, nota estimada, variação e até 3 habilidades com sinal de lacuna por área, com
contagens; sem nome, e-mail ou id), pede o texto à IA e só o aceita se todo número do texto estiver
nos fatos. Sem chave (`ANTHROPIC_API_KEY`), com erro da IA ou com número fora dos fatos, devolve o
texto padrão escrito por código (`origem: "padrao"`). Textos da IA ficam guardados em
`app.relatorio` (migração 003, RLS) com o hash dos fatos: o mesmo perfil não paga duas vezes. Modelo
em `RELATORIO_MODELO` (padrão `claude-haiku-5-5`). Gerar é auditado (`gerar_relatorio`). A tela só
chama quando o aluno clica, pois a IA tem custo; ainda não há limite de pedidos por aluno (fase 6).

**F4 (feita):**

- `nota_estimada` em toda prova corrigida: nota pela TRI a partir dos acertos, a mesma conta para
  provas com decil e sem ele, e independente da nota informada (é o eixo de comparação entre
  provas de anos diferentes). Vem vazia quando o aluno acerta tudo ou nada, pois a TRI só daria
  piso ou teto.
- `PUT /provas/{id}` troca todos os dados da prova (mesmo corpo do `POST`), revalida e recalcula;
  nada muda se a validação falhar. A auditoria `editar_prova` guarda `antes` e `depois`.
- `GET /provas/{id}` e as respostas de `POST`/`PUT` trazem `folha` (o que o aluno marcou, nunca o
  gabarito) para a tela de correção; a lista `GET /provas` não traz.
- `GET /perfil` ganhou `areas`: por área, o número de provas, a nota estimada da mais recente
  (`ultima`), a da anterior e a `variacao`. Os números vêm do servidor; a tela só os escreve.
- Tela: "Sua evolução" e a linha do tempo com nota estimada no início, "Onde focar" por área
  (habilidades juntando todas as provas da área) e "Corrigir respostas" na tela do resultado.

## 5. Dados e segurança na integração

- Trocar o SQLite do protótipo por tabelas no PostgreSQL com `tenant_id` + RLS (mesmo padrão do
  projeto Demanda): `aluno`, `prova_feita` (e `auditoria`). A base de referência (itens, textos,
  agregados) é pública e fica fora do RLS, só leitura.
- A base silver (parquet) vira tabelas ou continua em DuckDB somente leitura; as rotas de
  referência usam as funções de `historico.py`/`aluno.py`.
- Auditar criação, correção e exclusão de prova. Teste negativo: aluno de um escritório não lê
  prova de outro.
- Dados mínimos do aluno (nome ou apelido, vínculo ao escritório). Para menores, registrar o
  consentimento do responsável (LGPD).

## 6. Decisões em aberto

1. ~~Código do caderno visível ao aluno?~~ **Resolvido: sim, aparece na prova impressa.** O
   seletor de caderno fica como está (cor + código) e a ajuda diz onde achar o código; não há
   caminho "não sei qual é" no MVP.
2. Cadernos adaptados (Libras, braile, ledor): há dados de referência próprios? Hoje ficam fora.
3. O aluno se cadastra sozinho ou o mentor cadastra? Muda o login e o escopo das rotas.
4. Onde roda: dentro do sistema Demanda ou serviço próprio?

## 7. Ordem sugerida de implementação

1. Rotas de referência (`anos`, `cadernos`, `questoes`) + testes.
2. `POST/GET provas` sobre PostgreSQL com RLS + teste de vazamento entre escritórios.
3. `perfil` e `nota_estimada`.
4. Tela: passos 1-3, depois resultado, histórico e perfil.
5. Relatório por IA sobre o perfil.
