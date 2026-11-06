# Bizu: análise guiada com a API e a referência reais

## Comportamento

A entrada do produto é uma conta real, sem perfis ou notas pré-preenchidos. A mesma conta do Meu Bizu pode ser usada porque o serviço Bizu reutiliza o backend e o banco existentes, com a sessão e o RLS já implementados.

Na opção **Nova análise**, o estudante:

1. Escolhe uma edição disponível na API, informa as notas das áreas objetivas e seleciona estado e município de aplicação da prova.
2. Opcionalmente inclui respostas por área: escolhe o caderno real e a língua de Linguagens, cola a sequência ou marca as alternativas individualmente.
3. Confere o resumo e pede a análise. O servidor grava e corrige cada prova antes de executar `/raio-x`, preservando o fluxo de segurança original.
4. Vê acertos, habilidades, comparação com o grupo de nota e os comparativos geográficos disponíveis. Pode imprimir o resultado, abrir o diagnóstico individual e iniciar outra análise.

Sem respostas, a análise continua sendo apenas pela nota, sem inventar quais itens o estudante acertou. Sem nota, a estimativa já existente no backend pode ser usada quando disponível; a interface identifica as áreas estimadas. Uma referência geográfica ausente é mostrada como ausente, nunca zero.

Se o Raio-X falhar depois que uma prova foi gravada, uma nova tentativa na mesma tela reutiliza as provas cuja resposta de gravação já chegou. A confirmação de uma gravação que falhou na rede continua sujeita ao comportamento da API atual; esta mudança não introduz uma chave de idempotência no servidor.

## Implantação

O projeto EasyPanel `bizu` recebe um serviço de aplicação com o Dockerfile do repositório. Ele usa o papel de runtime do banco, por variável de ambiente. A entrada HTTPS `bizu-app` encaminha para essa aplicação. Nenhuma credencial integra o Git ou este documento.

A branch de implementação é separada de `main`; a publicação no projeto Bizu não depende de merge em produção no Meu Bizu. Não há novas migrações ou mudança nas políticas de acesso.

## Verificação

Novos testes verificam sequência e completude das respostas; ordem de gravação/correção antes do Raio-X; notas oficiais versus estimadas; retomada após falha; localização; validação de entrada; e os passos da interface. A suíte existente continua cobrindo conta, acesso entre usuários, provas, perfil e comparativos.

## Módulos de estratégia mantidos na mesma aplicação

A navegação também inclui mapa de habilidades, cenários Sisu, meta por curso, plano da semana e base/método. A conclusão da análise oferece um caminho direto para os cenários e para o plano.

O mapa e o plano leem `/perfil`. Os cenários importam as quatro notas de `/raio-x/salvos`, sem inventar a Redação, e usam um conjunto completo por edição para comparar pesos, mínimos e referências. O cálculo permite configurar bônus e calcula uma nota condicional por área para alcançar a referência. Não decide direito a cotas ou bônus e não garante aprovação.

Ofertas, Redação, hipóteses, disponibilidade e marcações do plano ficam no navegador, com chave separada por usuário, e podem ser exportadas/importadas. Os dados não substituem provas e notas guardadas no servidor. A comparação inicia com seis ofertas reais preenchidas do catálogo. A escolha de curso alvo e as notas do aluno permanecem vazias. Ofertas existentes são preservadas; estratégias antigas vazias recebem a seleção inicial apenas na migração. Os quatro exemplos fictícios continuam opcionais e identificados.

O catálogo agregado foi extraído de quatro PDFs oficiais publicados pela UFC e pela UFMG: termos de adesão de 2026 e referências da chamada regular UFC 2025 / UFMG 2026. A cobertura inicial contém 204 cursos/turnos e 1.634 modalidades com vagas nos termos; 1.375 têm referência numérica vinculada. Curso, turno e modalidade são ligados separadamente; vínculos ausentes e valores “não se aplica” ficam nulos. Não há cobertura nacional completa, inscrição no Sisu, acompanhamento de vagas abertas ou atualização automática. A busca filtra curso/cidade/campus, UF, instituição e modalidade, e adiciona os critérios à estratégia sem exigir digitação. Os PDFs de regras e de referência são ligados com página e ano por oferta. Alterações são identificadas como personalizadas.

A entrada também oferece exploração dos cenários sem conta para apresentações. Nessa opção as notas do aluno começam vazias e as seis ofertas públicas iniciais já estão disponíveis, as rotas privadas de perfil e notas ficam desativadas e nenhum estado é persistido automaticamente. A exportação é explícita. Correção, histórico e diagnóstico pessoal continuam exigindo autenticação.

## Limites preservados

O método analítico é o mesmo do backend atual. Esta entrega torna o produto operável e integrado, sem apresentar o protótipo com cenários fictícios como análise de um aluno. Validação estatística adicional, tratamento de amostras pequenas, expansão nacional e atualização do catálogo Sisu e gestão multiusuário de mentores continuam sendo evoluções distintas.

## Reproduzir e conferir o catálogo

`frontend/public/catalogo-sisu.json` guarda o catálogo compacto, fontes e hashes SHA-256. `frontend/src/catalogo-inicial.json` é a seleção de seis ofertas, produzida da mesma carga. Os PDFs são documentos de cursos e agregados, sem nomes de candidatos; não são versionados no repositório. A coleta foi feita em 05/11/2026. O termo não comprova existência de vagas remanescentes hoje.

Baixe os quatro PDFs das URLs no campo `fontes`, salve cada um como `<id>.pdf` em um diretório de trabalho e execute `python scripts/catalogo_sisu.py CAMINHO_DO_DIRETORIO` (requer PyMuPDF). O script confere os hashes antes de extrair, lê os pesos e mínimos por área e as vagas por modalidade. As tabelas de referência são extraídas em colunas; o mínimo da chamada regular é usado, nunca o máximo. A junção da UFC exige código de curso, turno (Integral inclui a descrição dos períodos) e modalidade. A UFMG exige nome normalizado, turno e modalidade; o prefixo ABI é retirado para corresponder ao relatório e o campus Montes Claros é distinguido pelo sufixo oficial. Não há correspondência aproximada. Cursos e modalidades sem correspondência continuam visíveis com referência ausente. As contagens esperadas impedem uma republicação silenciosa com extração incompleta. O relatório de ausência fica apenas no diretório de trabalho.

As seis ofertas iniciais são UFC Computação/Fortaleza, Psicologia/Fortaleza e Ciência de Dados/Itapajé; UFMG Medicina, Administração/Noturno e Engenharia Civil, todas em ampla concorrência. Não representam indicação de curso para o aluno. Ele escolhe o alvo para orientar as metas e o plano. A busca do catálogo permite outras modalidades e campi. Até 100 ofertas podem ser guardadas por estratégia; excluir uma oferta não a remove do catálogo público.
