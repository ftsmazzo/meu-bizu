"""Folha de respostas lida de uma foto, para o aluno logado conferir antes de gravar."""

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app import auth, provas
from app.leitor_foto import Leitor, leitor_do_ambiente, limpar_respostas

router = APIRouter()
Sessao = Annotated[auth.Sessao, Depends(auth.sessao_atual)]
registro = logging.getLogger(__name__)

LIMITE_DIARIO = 20  # cada leitura é uma chamada paga à IA


def get_leitor() -> Leitor | None:
    """`None` quando não há chave da IA configurada: a leitura por foto fica indisponível."""
    return leitor_do_ambiente()


class FotoEntrada(BaseModel):
    imagem: str = Field(min_length=100, max_length=7_000_000, pattern=r"^[A-Za-z0-9+/]+={0,2}$")
    tipo: Literal["image/jpeg", "image/png", "image/webp"]
    questoes: int = Field(ge=1, le=100)


class FotoSaida(BaseModel):
    respostas: str  # '?' marca a questão que a IA não conseguiu ler


@router.post("/folha/foto")
def ler_foto(
    corpo: FotoEntrada,
    sessao: Sessao,
    leitor: Annotated[Leitor | None, Depends(get_leitor)],
) -> FotoSaida:
    if leitor is None:
        raise HTTPException(
            503, "A leitura por foto não está disponível agora. Cole o texto ou use a grade."
        )
    conn = sessao.conn
    (usadas,) = conn.execute(
        "select count(*) from app.auditoria "
        "where acao = 'ler_foto' and em > now() - interval '1 day'"
    ).fetchone()
    if usadas >= LIMITE_DIARIO:
        raise HTTPException(
            429, "Você chegou ao limite de fotos de hoje. Use a grade ou volte amanhã."
        )
    provas.auditar(conn, "ler_foto", None, {"questoes": corpo.questoes})
    try:
        bruto = leitor.ler(corpo.imagem, corpo.tipo, corpo.questoes)
    except Exception:  # IA fora do ar, limite ou chave inválida
        registro.warning("leitor de foto falhou", exc_info=True)
        raise HTTPException(
            502, "Não consegui ler a foto agora. Tente de novo ou preencha na grade."
        ) from None
    try:
        return FotoSaida(respostas=limpar_respostas(bruto, corpo.questoes))
    except ValueError:
        raise HTTPException(
            422,
            "Não consegui ler todas as questões. Tire outra foto com a folha inteira, "
            "reta e bem iluminada.",
        ) from None
