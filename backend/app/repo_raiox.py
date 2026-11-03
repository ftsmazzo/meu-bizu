"""Pedidos de Raio-X guardados (schema `app`). O dono vem da sessão, como em `provas`."""

import psycopg
from psycopg.types.json import Jsonb


def guardar(conn: psycopg.Connection, ano: int, pedido: dict) -> None:
    """Guarda o pedido do ano; gerar de novo no mesmo ano substitui o anterior."""
    conn.execute(
        "insert into app.raiox_salvo (usuario_id, ano, pedido) "
        "values (current_setting('app.usuario_id')::uuid, %s, %s) "
        "on conflict (usuario_id, ano) do update "
        "set pedido = excluded.pedido, atualizado_em = now()",
        (ano, Jsonb(pedido)),
    )


def listar(conn: psycopg.Connection) -> list[tuple[dict, object]]:
    """Os pedidos do usuário da sessão, do mais recente para o mais antigo: (pedido, quando)."""
    linhas = conn.execute(
        "select pedido, atualizado_em from app.raiox_salvo order by atualizado_em desc"
    )
    return [(pedido, quando) for pedido, quando in linhas.fetchall()]
