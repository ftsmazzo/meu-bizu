"""Raio-X pela nota do aluno logado. Só lê a base de referência: nada é gravado."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app import auth, repositorio
from app.raiox import a_frente_de, analisar_area
from app.rotas_provas import Area

router = APIRouter()
Sessao = Annotated[auth.Sessao, Depends(auth.sessao_atual)]
ORDEM = ("LC", "CH", "CN", "MT")
LETRAS = tuple("ABCDE")


class RaioXEntrada(BaseModel):
    ano: int = Field(ge=2009, le=2100)
    notas: dict[Area, float]
    lingua: int | None = Field(default=None, ge=0, le=1)
    uf: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    municipio: str | None = Field(default=None, pattern=r"^\d{7}$")  # código IBGE

    @field_validator("notas")
    @classmethod
    def _notas_validas(cls, v: dict[Area, float]) -> dict[Area, float]:
        if not v:
            raise ValueError("informe a nota de pelo menos uma área")
        if any(not 0 <= n <= 1000 for n in v.values()):
            raise ValueError("a nota vai de 0 a 1000")
        return v


class Enunciado(BaseModel):
    introducao: str | None
    enunciado: str | None
    alternativas: dict[str, str | None]
    imagens: list


class QuestaoAoAlcance(BaseModel):
    habilidade: int
    descricao: str | None
    chance: int
    questao: Enunciado | None


class Foco(BaseModel):
    habilidade: int
    descricao: str | None
    n: int
    esperado: float
    alvo: float
    ganho: float


class Faixas(BaseModel):
    seguras: int
    alcance: int
    dificeis: int


class Posicao(BaseModel):
    """Onde a nota fica num local: supera pelo menos `a_frente_de`% de `n` participantes."""

    nome: str
    a_frente_de: int
    n: int


class AreaRaioX(BaseModel):
    area: Area
    nota: float
    brasil: Posicao | None
    uf: Posicao | None
    municipio: Posicao | None
    decil: int | None
    a_frente_de: int | None
    alvo: float | None
    total: int
    esperado: float
    faixas: Faixas
    foco: list[Foco]
    alcance: list[QuestaoAoAlcance]


class RaioX(BaseModel):
    ano: int
    areas: list[AreaRaioX]


def _itens_da_prova(conn, ano: int, area: str, lingua: int | None) -> list[dict]:
    """Os itens da prova do ano (um caderno representa todos, pois mudam só de ordem)."""
    co_prova = repositorio.caderno_de_referencia(conn, ano, area)
    if co_prova is None:
        return []
    parametros = repositorio.parametros_tri(conn, ano, area)
    vistos: dict[int, dict] = {}
    for i in repositorio.itens_do_caderno(conn, ano, area, co_prova):
        if area == "LC" and i["tp_lingua"] not in (None, lingua):
            continue
        p = parametros.get(i["co_item"])
        if p is None or i["gabarito"] not in LETRAS:
            continue  # anulado ou sem parâmetro: não conta
        vistos[i["co_item"]] = p
    return list(vistos.values())


def _posicao(conn, ano: int, area: str, nivel: str, codigo: str | None, nota: float):
    """Posição da nota num local, ou None se não foi pedido ou o local não tem dado suficiente."""
    if codigo is None:
        return None
    g = repositorio.nota_geo(conn, ano, area, nivel, codigo)
    if g is None:
        return None
    return Posicao(nome=g["nome"] or "Brasil", a_frente_de=a_frente_de(nota, g["pontos"]), n=g["n"])


def _enunciado(t: dict | None) -> Enunciado | None:
    if t is None:
        return None
    return Enunciado(
        introducao=t["introducao"],
        enunciado=t["enunciado"],
        alternativas=t["alternativas"] or {},
        imagens=t["imagens"] or [],
    )


@router.post("/raio-x")
def raio_x(corpo: RaioXEntrada, sessao: Sessao) -> RaioX:
    conn = sessao.conn
    if "LC" in corpo.notas and corpo.lingua is None:
        raise HTTPException(422, "em Linguagens informe a língua (0 inglês, 1 espanhol)")
    descricoes = repositorio.habilidades(conn)
    areas = []
    for area in (a for a in ORDEM if a in corpo.notas):
        itens = _itens_da_prova(conn, corpo.ano, area, corpo.lingua)
        if not itens:
            raise HTTPException(404, "ainda não temos dados desta área neste ano")
        nota = corpo.notas[area]
        observado = repositorio.esperado_por_decil(conn, corpo.ano, [i["co_item"] for i in itens])
        r = analisar_area(nota, itens, repositorio.cortes(conn, corpo.ano, area), observado)
        textos = repositorio.questoes(conn, corpo.ano, [q["co_item"] for q in r["alcance"]])
        areas.append(
            AreaRaioX(
                area=area,
                nota=nota,
                brasil=_posicao(conn, corpo.ano, area, "BR", "0", nota),
                uf=_posicao(conn, corpo.ano, area, "UF", corpo.uf, nota),
                municipio=_posicao(conn, corpo.ano, area, "MUN", corpo.municipio, nota),
                **{k: r[k] for k in ("decil", "a_frente_de", "alvo", "total", "esperado")},
                faixas=Faixas(**r["faixas"]),
                foco=[
                    Foco(**h, descricao=descricoes.get((area, h["habilidade"]))) for h in r["foco"]
                ],
                alcance=[
                    QuestaoAoAlcance(
                        habilidade=q["habilidade"],
                        descricao=descricoes.get((area, q["habilidade"])),
                        chance=q["chance"],
                        questao=_enunciado(textos.get(q["co_item"])),
                    )
                    for q in r["alcance"]
                ],
            )
        )
    return RaioX(ano=corpo.ano, areas=areas)
