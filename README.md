# Meu Bizu

> Nome comercial de trabalho, provisório (pendente de busca de marca no INPI).

Ferramenta para vestibulandos descobrirem, com dados de 10 anos do Enem, **onde focar**: o aluno
informa o que marcou em uma prova, e o sistema mostra o desempenho por habilidade comparado ao
de quem tem a mesma nota. Os números vêm de dados oficiais do INEP; a IA só redige o texto.

**Estado:** desenvolvimento (sem produção). Direitos reservados enquanto a licença não é definida.

## Documentos

- [Plano de ação e pilha](docs/plano-de-acao.md)
- [API e tela de inclusão de resultados](docs/api-e-tela.md)

## Rodar localmente

```bash
cd backend
pip install -r requirements-dev.txt
pytest
ruff check . && ruff format --check .
uvicorn app.main:app --reload
```

Segredos ficam em `.env` (copie de `.env.example`); nunca no repositório.
