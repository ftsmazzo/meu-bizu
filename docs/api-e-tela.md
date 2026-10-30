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
`GET /perfil?area=&desde=`. Prova de outra pessoa responde 404, igual a prova inexistente. A edição
(`PUT`) e o `nota_estimada` ficam para a F4; o relatório por IA, para a F5.

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
