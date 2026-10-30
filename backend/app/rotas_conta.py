"""Conta do aluno: cadastro, entrada, saída e quem sou eu.

Cadastro só para maiores de 18 anos (declaração no corpo; o banco recusa `false`). Login e
cadastro respondem com o cookie de sessão. Mensagem de login errado é uma só, para não revelar
quais e-mails existem.
"""

from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator

from app import auth
from app.db import get_conn

router = APIRouter(prefix="/conta")
Conn = Annotated[psycopg.Connection, Depends(get_conn)]
EMAIL = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class Cadastro(BaseModel):
    email: str = Field(pattern=EMAIL, max_length=254)
    nome: str = Field(min_length=1, max_length=80)
    senha: str = Field(min_length=8, max_length=128)
    maior_de_18: bool

    @field_validator("nome")
    @classmethod
    def _nome_sem_bordas(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("informe o nome")
        return v

    @field_validator("maior_de_18")
    @classmethod
    def _so_maiores(cls, v: bool) -> bool:
        if not v:
            raise ValueError("o Meu Bizu é para maiores de 18 anos")
        return v


class Entrada(BaseModel):
    email: str = Field(max_length=254)
    senha: str = Field(max_length=128)


@router.post("/cadastro", status_code=201)
def cadastrar(corpo: Cadastro, conn: Conn, resposta: Response) -> auth.Usuario:
    try:
        with conn.transaction():
            usuario_id = conn.execute(
                "select app.cadastrar(%s, %s, %s)",
                (corpo.email, corpo.nome, auth.hash_da_senha(corpo.senha)),
            ).fetchone()[0]
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, "já existe uma conta com esse e-mail") from None
    auth.abrir_sessao(conn, usuario_id, resposta)
    return auth.Usuario(id=usuario_id, nome=corpo.nome, email=corpo.email.lower())


@router.post("/entrar")
def entrar(corpo: Entrada, conn: Conn, resposta: Response) -> auth.Usuario:
    achou = conn.execute(
        "select id, nome, senha_hash from app.credencial(%s)", (corpo.email,)
    ).fetchone()
    if not auth.senha_confere(achou[2] if achou else None, corpo.senha) or achou is None:
        raise HTTPException(401, "e-mail ou senha incorretos")
    auth.abrir_sessao(conn, achou[0], resposta)
    return auth.Usuario(id=achou[0], nome=achou[1], email=corpo.email.lower())


@router.post("/sair", status_code=204)
def sair(request: Request, conn: Conn, resposta: Response) -> None:
    auth.fechar_sessao(conn, request, resposta)


@router.get("/eu")
def eu(sessao: Annotated[auth.Sessao, Depends(auth.sessao_atual)]) -> auth.Usuario:
    return sessao.usuario
