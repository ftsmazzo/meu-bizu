"""Carrega a base de referência (CSVs da exportação do laboratório) no schema `ref`.

Uso: `python -m app.carga_ref PASTA_COM_OS_CSV` (lê `DATABASE_URL`, o dono do schema).
Substitui todo o conteúdo de `ref` numa única transação; se faltar arquivo, nada é alterado.
"""

import csv
import sys
from pathlib import Path

import psycopg

TABELAS = (
    "habilidade",
    "caderno",
    "item",
    "item_caderno",
    "questao",
    "item_estatistica",
    "item_esperado",
    "decil_nota",
    "nota_geo",
)


def carregar_ref(conn: psycopg.Connection, pasta: Path) -> dict[str, int]:
    """Substitui as tabelas de `ref` pelo conteúdo dos CSVs. Devolve linhas por tabela."""
    pasta = Path(pasta)
    faltam = [t for t in TABELAS if not (pasta / f"{t}.csv").exists()]
    if faltam:
        raise FileNotFoundError("faltam CSV de referência: " + ", ".join(faltam))
    totais = {}
    with conn.transaction():
        conn.execute("truncate " + ", ".join(f"ref.{t}" for t in TABELAS))
        for tabela in TABELAS:
            arquivo = pasta / f"{tabela}.csv"
            with open(arquivo, encoding="utf-8", newline="") as f:
                colunas = next(csv.reader([f.readline()]))
                f.seek(0)
                lista = ", ".join(colunas)
                comando = f"copy ref.{tabela} ({lista}) from stdin with (format csv, header true)"
                with conn.cursor() as cur, cur.copy(comando) as copia:
                    while bloco := f.read(1 << 16):
                        copia.write(bloco)
            totais[tabela] = conn.execute(f"select count(*) from ref.{tabela}").fetchone()[0]
    conn.commit()
    return totais


def main(argv: list[str]) -> int:
    from app.db import database_url

    if len(argv) != 1:
        print("uso: python -m app.carga_ref PASTA_COM_OS_CSV")
        return 2
    with psycopg.connect(database_url()) as conn:
        for tabela, n in carregar_ref(conn, Path(argv[0])).items():
            print(f"{tabela:18s} {n:>8,} linhas")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
