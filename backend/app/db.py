"""Acesso ao PostgreSQL: URL do ambiente e conexão por requisição (pool)."""

import os
from collections.abc import Iterator

import psycopg
from psycopg_pool import ConnectionPool

_pool: ConnectionPool | None = None


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("defina DATABASE_URL (veja .env.example)")
    return url


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(database_url(), min_size=1, max_size=5, open=True)
    return _pool


def get_conn() -> Iterator[psycopg.Connection]:
    """Dependência do FastAPI: uma conexão do pool por requisição."""
    with _get_pool().connection() as conn:
        yield conn
