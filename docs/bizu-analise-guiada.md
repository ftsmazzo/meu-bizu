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

Ofertas, Redação, hipóteses, disponibilidade e marcações do plano ficam no navegador, com chave separada por usuário, e podem ser exportadas/importadas. Os dados não substituem provas e notas guardadas no servidor. O cadastro de ofertas começa vazio; os quatro exemplos fictícios exigem ação explícita e permanecem identificados.

Não existe uma carga validada do catálogo oficial Sisu nesta entrega. O portal `https://dadosabertos.mec.gov.br/sisu` foi localizado como fonte histórica; seus recursos ainda precisam ser ingeridos e conferidos antes de alimentar ofertas e cortes automaticamente. O campo de fonte de uma oferta é informativo, não uma certificação automática.

## Limites preservados

O método analítico é o mesmo do backend atual. Esta entrega torna o produto operável e integrado, sem apresentar o protótipo com cenários fictícios como análise de um aluno. Validação estatística adicional, tratamento de amostras pequenas, ingestão da referência oficial Sisu e gestão multiusuário de mentores continuam sendo evoluções distintas.

