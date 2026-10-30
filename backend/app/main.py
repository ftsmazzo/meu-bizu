"""Meu Bizu: API."""

from fastapi import FastAPI

app = FastAPI(title="Meu Bizu", version="0.1.0")


@app.get("/saude")
def saude() -> dict[str, str]:
    """Verificação de vida usada pelo EasyPanel e pela CI."""
    return {"status": "ok"}
