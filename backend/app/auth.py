"""Conta e sessão: senha com argon2, sessão por cookie httpOnly, escopo por usuário no banco.

O cookie leva um token aleatório; o banco guarda só o hash dele (`app.sessao`). A cada requisição
autenticada, a dependência `sessao_atual` descobre o usuário e o grava em `app.usuario_id` (só
para a transação). É isso que as políticas de RLS leem: o usuário nunca vem do corpo da requisição.
"""

import hashlib
import secrets
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

import psycopg
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request, Response
from pydantic import BaseModel

from app.db import get_conn

COOKIE = "sessao"
DIAS_DE_SESSAO = 30

_hasher = PasswordHasher()
# Senha que ninguém usa: "e-mail não existe" gasta o mesmo tempo de "senha errada".
_HASH_FALSO = _hasher.hash("senha-que-ninguem-usa")


class Usuario(BaseModel):
    id: UUID
    nome: str
    email: str


@dataclass
class Sessao:
    conn: psycopg.Connection
    usuario: Usuario


def hash_da_senha(senha: str) -> str:
    return _hasher.hash(senha)


def senha_confere(hash_guardado: str | None, senha: str) -> bool:
    try:
        confere = _hasher.verify(hash_guardado or _HASH_FALSO, senha)
    except (VerificationError, InvalidHashError):
        return False
    return confere and hash_guardado is not None


def _hash_do_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def abrir_sessao(conn: psycopg.Connection, usuario_id: UUID, resposta: Response) -> None:
    token = secrets.token_urlsafe(32)
    conn.execute(
        "select app.abrir_sessao(%s, %s, %s)", (usuario_id, _hash_do_token(token), DIAS_DE_SESSAO)
    )
    resposta.set_cookie(
        COOKIE,
        token,
        max_age=DIAS_DE_SESSAO * 86400,
        httponly=True,
        secure=True,
        samesite="lax",
        path="/",
    )


def fechar_sessao(conn: psycopg.Connection, request: Request, resposta: Response) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        conn.execute("select app.fechar_sessao(%s)", (_hash_do_token(token),))
    resposta.delete_cookie(COOKIE, path="/")


def sessao_atual(
    request: Request, conn: Annotated[psycopg.Connection, Depends(get_conn)]
) -> Iterator[Sessao]:
    """Exige login. Escopa a transação ao usuário da sessão para o RLS."""
    token = request.cookies.get(COOKIE)
    linha = None
    if token:
        linha = conn.execute(
            "select id, nome, email from app.sessao_usuario(%s)", (_hash_do_token(token),)
        ).fetchone()
    if linha is None:
        raise HTTPException(401, "entre na sua conta para continuar")
    conn.execute("select set_config('app.usuario_id', %s, true)", (str(linha[0]),))
    yield Sessao(conn=conn, usuario=Usuario(id=linha[0], nome=linha[1], email=linha[2]))
