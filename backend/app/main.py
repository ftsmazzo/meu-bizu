"""Meu Bizu: API."""

from fastapi import FastAPI

from app.rotas_referencia import router as rotas_referencia

app = FastAPI(title="Meu Bizu", version="0.1.0")
app.include_router(rotas_referencia)


@app.get("/saude")
def saude() -> dict[str, str]:
    """Verificação de vida usada pelo EasyPanel e pela CI."""
    return {"status": "ok"}
