"""Meu Bizu: API."""

from fastapi import FastAPI

from app.rotas_conta import router as rotas_conta
from app.rotas_provas import router as rotas_provas
from app.rotas_referencia import router as rotas_referencia

app = FastAPI(title="Meu Bizu", version="0.2.0")
app.include_router(rotas_referencia)
app.include_router(rotas_conta)
app.include_router(rotas_provas)


@app.get("/saude")
def saude() -> dict[str, str]:
    """Verificação de vida usada pelo EasyPanel e pela CI."""
    return {"status": "ok"}
