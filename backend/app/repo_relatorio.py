"""Relatórios por IA já gerados (schema `app`). O dono vem da sessão, como em `provas`."""

import psycopg


def obter(conn: psycopg.Connection, chave: str, impressao: str) -> str | None:
    """O texto guardado, só se foi gerado com exatamente estes fatos."""
    linha = conn.execute(
        "select texto from app.relatorio where chave = %s and impressao = %s", (chave, impressao)
    ).fetchone()
    return linha[0] if linha else None


def guardar(conn: psycopg.Connection, chave: str, impressao: str, texto: str) -> None:
    conn.execute(
        "insert into app.relatorio (usuario_id, chave, impressao, texto) "
        "values (current_setting('app.usuario_id')::uuid, %s, %s, %s) "
        "on conflict (usuario_id, chave) do update "
        "set impressao = excluded.impressao, texto = excluded.texto, criado_em = now()",
        (chave, impressao, texto),
    )
