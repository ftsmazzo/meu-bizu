"""Acesso ao PostgreSQL: URL do ambiente e conexão por requisição (pool)."""

import os
from collections.abc import Iterator

import psycopg
from psycopg_pool import ConnectionPool

_pool: ConnectionPool | None = None


def database_url() -> str:
    """URL do dono do schema: só para migrar e carregar a referência, nunca em runtime."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("defina DATABASE_URL (veja .env.example)")
    return url


def app_database_url() -> str:
    """URL do papel de execução (`meubizu_app`, sem privilégios): a única que a API usa."""
    url = os.environ.get("APP_DATABASE_URL")
    if not url:
        raise RuntimeError("defina APP_DATABASE_URL (papel meubizu_app; veja .env.example)")
    return url


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(app_database_url(), min_size=1, max_size=5, open=True)
    return _pool


def get_conn() -> Iterator[psycopg.Connection]:
    """Dependência do FastAPI: uma conexão do pool por requisição."""
    with _get_pool().connection() as conn:
        yield conn
