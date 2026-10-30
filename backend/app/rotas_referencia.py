"""Rotas de referência: alimentam os seletores e a grade de respostas.

Nenhuma rota devolve o gabarito oficial nem o código interno do item: quem corrige é o servidor,
depois de gravar o que o aluno marcou.
"""

from typing import Annotated, Literal

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app import repositorio
from app.db import get_conn
from app.dominio import opcoes_de_caderno, ordem_do_caderno

router = APIRouter()
Area = Literal["LC", "CH", "CN", "MT"]
Conn = Annotated[psycopg.Connection, Depends(get_conn)]


class OpcaoCaderno(BaseModel):
    co_prova: int
    cor: str
    rotulo: str
    referencia: Literal["decil", "tri"]
    selecionavel: bool
    motivo: str


class Questao(BaseModel):
    numero: int
    introducao: str | None
    enunciado: str | None
    alternativas: dict[str, str | None]
    imagens: list
    tem_texto: bool


@router.get("/anos")
def listar_anos(conn: Conn) -> list[int]:
    return repositorio.anos(conn)


@router.get("/anos/{ano}/areas/{area}/cadernos")
def listar_cadernos(ano: int, area: Area, conn: Conn) -> list[OpcaoCaderno]:
    cadernos = repositorio.cadernos(conn, ano, area)
    if not cadernos:
        raise HTTPException(404, "nenhum caderno para esse ano e área")
    return [OpcaoCaderno(**o) for o in opcoes_de_caderno(cadernos)]


@router.get("/cadernos/{co_prova}/questoes")
def listar_questoes(
    co_prova: int,
    ano: int,
    area: Area,
    conn: Conn,
    lingua: Annotated[int | None, Query(ge=0, le=1)] = None,
) -> list[Questao]:
    cad = repositorio.caderno(conn, ano, area, co_prova)
    if cad is None:
        raise HTTPException(404, "caderno não encontrado")
    if cad["ambiguo"]:
        raise HTTPException(409, "caderno ambíguo: não dá para ligar posição a questão")
    if area == "LC" and lingua is None:
        raise HTTPException(422, "em Linguagens informe a língua (0 inglês, 1 espanhol)")
    ordem = ordem_do_caderno(repositorio.itens_do_caderno(conn, ano, area, co_prova), area)
    if area == "LC":
        ordem = [o for o in ordem if o["lingua"] in (None, lingua)]
    textos = repositorio.questoes(conn, ano, [o["co_item"] for o in ordem])
    saida = []
    for numero, o in enumerate(ordem, start=1):
        t = textos.get(o["co_item"])
        saida.append(
            Questao(
                numero=numero,
                introducao=t["introducao"] if t else None,
                enunciado=t["enunciado"] if t else None,
                alternativas=t["alternativas"] or {} if t else {},
                imagens=t["imagens"] or [] if t else [],
                tem_texto=t is not None,
            )
        )
    return saida
