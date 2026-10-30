"""Meu Bizu: API e, quando existir o build, a interface."""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.rotas_conta import router as rotas_conta
from app.rotas_provas import router as rotas_provas
from app.rotas_referencia import router as rotas_referencia
from app.rotas_relatorio import router as rotas_relatorio

app = FastAPI(title="Meu Bizu", version="0.5.0")
app.include_router(rotas_referencia)
app.include_router(rotas_conta)
app.include_router(rotas_provas)
app.include_router(rotas_relatorio)


@app.get("/saude")
def saude() -> dict[str, str]:
    """Verificação de vida usada pelo EasyPanel e pela CI."""
    return {"status": "ok"}


def montar_interface(aplicacao: FastAPI, pasta: Path) -> None:
    """Serve o build do front em `/`. Vem depois das rotas da API, que têm prioridade.

    A interface troca de tela por estado (sem rotas no navegador), então não há fallback de página.
    """
    if pasta.is_dir():
        aplicacao.mount("/", StaticFiles(directory=pasta, html=True), name="interface")


montar_interface(app, Path(os.environ.get("STATIC_DIR", "/app/static")))
