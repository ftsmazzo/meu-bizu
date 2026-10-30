"""Provas do aluno logado e o perfil por habilidade.

Todas as rotas exigem login e valem só para o usuário da sessão (RLS no banco). Prova de outra
pessoa responde 404, igual a prova que não existe. O gabarito nunca sai daqui: a resposta traz
acertos, referência e o perfil, que são recalculados a cada leitura a partir da folha gravada.
"""

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator

from app import auth, provas, repositorio
from app.correcao import ProvaInvalida, avaliar_prova
from app.perfil import Avaliacao, perfil_do_aluno

router = APIRouter()
Sessao = Annotated[auth.Sessao, Depends(auth.sessao_atual)]
Area = Literal["LC", "CH", "CN", "MT"]


class ProvaEntrada(BaseModel):
    ano: int = Field(ge=2009, le=2100)
    area: Area
    co_prova: int
    lingua: int | None = Field(default=None, ge=0, le=1)
    tipo: Literal["enem", "simulado"]
    feita_em: date | None = None
    nota: float | None = Field(default=None, ge=0, le=1000)
    folha: str = Field(min_length=1, max_length=100)

    @field_validator("folha")
    @classmethod
    def _folha_valida(cls, v: str) -> str:
        v = v.upper()
        if any(letra not in "ABCDE.*" for letra in v):
            raise ValueError("a folha só aceita A-E, '.' (em branco) e '*' (dupla marcação)")
        return v

    @model_validator(mode="after")
    def _data_do_simulado(self):
        if self.tipo == "simulado" and self.feita_em is None:
            raise ValueError("informe a data em que você fez o simulado")
        if self.feita_em is not None and self.feita_em > date.today():
            raise ValueError("a data não pode estar no futuro")
        return self


class LinhaPerfil(BaseModel):
    area: str
    habilidade: int
    descricao: str | None
    n: int
    acertos: int
    taxa: float
    esperado: float
    lacuna: float
    z: float | None
    selo: str
    armadilhas: int


class Resumo(BaseModel):
    id: UUID
    ano: int
    area: str
    co_prova: int
    lingua: int | None
    tipo: str
    feita_em: date | None
    nota: float | None
    nota_estimada: float | None = None
    acertos: int | None = None
    avaliadas: int | None = None
    anuladas: int | None = None
    referencia: str | None = None
    origem: str | None = None
    decil: int | None = None


class Resultado(Resumo):
    folha: str  # o que o aluno marcou (nunca o gabarito): serve para ele corrigir a prova
    habilidades: list[LinhaPerfil]


class ResumoArea(BaseModel):
    area: str
    provas: int
    ultima: float | None  # nota estimada da prova mais recente com nota
    anterior: float | None
    variacao: float | None  # ultima - anterior; vazia com menos de duas provas com nota


class Perfil(BaseModel):
    provas: list[Resumo]
    areas: list[ResumoArea]
    habilidades: list[LinhaPerfil]


def _avaliar(conn, p: dict) -> Avaliacao:
    return avaliar_prova(
        conn,
        ano=p["ano"],
        area=p["area"],
        co_prova=p["co_prova"],
        lingua=p["lingua"],
        folha=p["folha"],
        nota=p["nota"],
    )


def _resumo(p: dict, av: Avaliacao | None) -> Resumo:
    dados = {k: p[k] for k in ("id", "ano", "area", "co_prova", "lingua", "tipo", "feita_em")}
    dados["nota"] = p["nota"]
    if av is not None:
        dados |= {k: getattr(av, k) for k in ("acertos", "avaliadas", "anuladas", "referencia")}
        dados |= {"origem": av.origem, "decil": av.decil, "nota_estimada": av.nota_estimada}
    return Resumo(**dados)


def _resultado(conn, p: dict, av: Avaliacao | None) -> Resultado:
    habilidades = _linhas(conn, [av]) if av else []
    return Resultado(**_resumo(p, av).model_dump(), folha=p["folha"], habilidades=habilidades)


def _areas(resumos: list[Resumo]) -> list[ResumoArea]:
    """Uma linha por área, com a variação da nota estimada entre as duas provas mais recentes.
    `resumos` já vêm da mais antiga para a mais nova."""
    saida = []
    for area in ("LC", "CH", "CN", "MT"):
        da_area = [r for r in resumos if r.area == area]
        if not da_area:
            continue
        notas = [r.nota_estimada for r in da_area if r.nota_estimada is not None]
        ultima = notas[-1] if notas else None
        anterior = notas[-2] if len(notas) > 1 else None
        variacao = ultima - anterior if ultima is not None and anterior is not None else None
        saida.append(
            ResumoArea(
                area=area,
                provas=len(da_area),
                ultima=ultima,
                anterior=anterior,
                variacao=variacao,
            )
        )
    return saida


def _linhas(conn, avaliacoes: list[Avaliacao]) -> list[LinhaPerfil]:
    descricoes = repositorio.habilidades(conn)
    return [
        LinhaPerfil(**linha, descricao=descricoes.get((linha["area"], linha["habilidade"])))
        for linha in perfil_do_aluno(avaliacoes)
    ]


def _corrigir(conn, p: dict) -> Avaliacao | None:
    try:
        return _avaliar(conn, p)
    except ProvaInvalida:
        return None  # a base de referência mudou e esta prova já não se corrige: some do perfil


@router.post("/provas", status_code=201)
def gravar_prova(corpo: ProvaEntrada, sessao: Sessao) -> Resultado:
    conn = sessao.conn
    dados = corpo.model_dump()
    if corpo.area != "LC":
        dados["lingua"] = None
    try:
        av = _avaliar(conn, dados)
    except ProvaInvalida as erro:
        raise HTTPException(erro.status, str(erro)) from None
    p = provas.inserir(conn, **dados)
    provas.auditar(conn, "criar_prova", p["id"], {"ano": p["ano"], "area": p["area"]})
    return _resultado(conn, p, av)


@router.get("/provas")
def listar_provas(sessao: Sessao) -> list[Resumo]:
    return [_resumo(p, _corrigir(sessao.conn, p)) for p in provas.listar(sessao.conn)]


@router.get("/provas/{prova_id}")
def ver_prova(prova_id: UUID, sessao: Sessao) -> Resultado:
    p = provas.obter(sessao.conn, prova_id)
    if p is None:
        raise HTTPException(404, "prova não encontrada")
    return _resultado(sessao.conn, p, _corrigir(sessao.conn, p))


def _instantaneo(p: dict) -> dict:
    """O que a auditoria guarda de uma prova: tudo o que o aluno informou, com a data em texto."""
    campos = ("ano", "area", "co_prova", "lingua", "tipo", "feita_em", "nota", "folha")
    return {k: p[k].isoformat() if isinstance(p[k], date) else p[k] for k in campos}


@router.put("/provas/{prova_id}")
def editar_prova(prova_id: UUID, corpo: ProvaEntrada, sessao: Sessao) -> Resultado:
    conn = sessao.conn
    antes = provas.obter(conn, prova_id)
    if antes is None:
        raise HTTPException(404, "prova não encontrada")
    dados = corpo.model_dump()
    if corpo.area != "LC":
        dados["lingua"] = None
    try:
        av = _avaliar(conn, dados)
    except ProvaInvalida as erro:
        raise HTTPException(erro.status, str(erro)) from None
    p = provas.atualizar(conn, prova_id, **dados)
    provas.auditar(
        conn, "editar_prova", prova_id, {"antes": _instantaneo(antes), "depois": _instantaneo(p)}
    )
    return _resultado(conn, p, av)


@router.delete("/provas/{prova_id}", status_code=204)
def excluir_prova(prova_id: UUID, sessao: Sessao) -> None:
    if not provas.excluir(sessao.conn, prova_id):
        raise HTTPException(404, "prova não encontrada")
    provas.auditar(sessao.conn, "excluir_prova", prova_id)


@router.get("/perfil")
def perfil(
    sessao: Sessao,
    area: Annotated[Area | None, Query()] = None,
    desde: Annotated[date | None, Query()] = None,
) -> Perfil:
    conn = sessao.conn
    corrigidas = [(p, _corrigir(conn, p)) for p in provas.listar(conn, area, desde)]
    avaliacoes = [av for _, av in corrigidas if av is not None]
    resumos = [_resumo(p, av) for p, av in corrigidas]
    return Perfil(provas=resumos, areas=_areas(resumos), habilidades=_linhas(conn, avaliacoes))
