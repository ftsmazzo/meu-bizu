"""Migrações SQL versionadas: aplica `migracoes/*.sql` em ordem, uma vez cada.

Uso: `python -m app.migrar` (lê `DATABASE_URL`, que deve ser o dono do schema: só para migrar).
"""

import sys
from pathlib import Path

import psycopg

MIGRACOES = Path(__file__).resolve().parent.parent / "migracoes"


def migrar(conn: psycopg.Connection, pasta: Path = MIGRACOES) -> list[str]:
    """Aplica as migrações ainda não aplicadas; devolve os nomes aplicados agora."""
    conn.execute(
        "create table if not exists public.schema_migracoes ("
        "versao text primary key, aplicada_em timestamptz not null default now())"
    )
    conn.commit()
    aplicadas = {r[0] for r in conn.execute("select versao from public.schema_migracoes")}
    novas = []
    for arquivo in sorted(pasta.glob("*.sql")):
        if arquivo.name in aplicadas:
            continue
        with conn.transaction():
            conn.execute(arquivo.read_text(encoding="utf-8"))
            conn.execute(
                "insert into public.schema_migracoes (versao) values (%s)", (arquivo.name,)
            )
        novas.append(arquivo.name)
    conn.commit()
    return novas


def main() -> int:
    from app.db import database_url

    with psycopg.connect(database_url()) as conn:
        novas = migrar(conn)
    print("migrações aplicadas:", ", ".join(novas) if novas else "nenhuma (já em dia)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
