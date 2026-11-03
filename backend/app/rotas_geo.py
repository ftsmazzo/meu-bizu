"""Listas de estados e municípios com ranking no ano (dados públicos da base de referência)."""

from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app import repositorio
from app.db import get_conn

router = APIRouter()
Conn = Annotated[psycopg.Connection, Depends(get_conn)]


class UF(BaseModel):
    uf: str
    n: int


class Municipio(BaseModel):
    codigo: str
    nome: str
    n: int


@router.get("/geo/ufs")
def listar_ufs(ano: int, conn: Conn) -> list[UF]:
    return [UF(**u) for u in repositorio.ufs_com_dados(conn, ano)]


@router.get("/geo/municipios")
def listar_municipios(
    ano: int, uf: Annotated[str, Query(pattern=r"^[A-Z]{2}$")], conn: Conn
) -> list[Municipio]:
    return [Municipio(**m) for m in repositorio.municipios_com_dados(conn, ano, uf)]
