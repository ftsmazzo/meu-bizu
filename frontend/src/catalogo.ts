import iniciais from "./catalogo-inicial.json";
import type { Oferta } from "./estrategia";

export interface OrigemCatalogo {
  id: string; sigla: string; codigoCurso: string; modalidadeCodigo: string; municipio: string;
  anoRegras: number; vagas: number; fonteRegras: string; paginaRegras: number;
  fonteReferencia: string; paginaReferencia: number | null; coletadoEm: string; personalizada: boolean;
}
interface CursoCatalogo {
  id: string; nome: string; instituicao: string; campus: string; uf: string; turno: string;
  pesos: Oferta["pesos"]; minimos: Oferta["minimos"]; mediaMinima: number; anoReferencia: number;
  sigla: string; codigoCurso: string; municipio: string; paginaRegras: number;
  fonteRegras: number; fonteReferencia: number;
  modalidades: [string, number, number | null, number | null][];
}
export interface CatalogoArquivo {
  versao: number; atualizadoEm: string; cobertura: string;
  fontes: { id: string; url: string; sha256: string }[];
  modalidades: Record<string, string>; cursos: CursoCatalogo[];
}
export const ofertasIniciais = (): Oferta[] => structuredClone(iniciais) as Oferta[];
export const notaPublicada = (n: number) => n.toFixed(2).replace(".", ",");
export const normalizarBusca = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
export function expandirCatalogo(d: CatalogoArquivo): Oferta[] {
  if(d.versao!==1 || !Array.isArray(d.cursos) || d.cursos.length>20000) throw new Error("Catálogo indisponível. Tente novamente.");
  return d.cursos.flatMap(c => c.modalidades.map(([modalidade,vagas,referencia,paginaReferencia]) => {
    const id=`${c.id}-${modalidade.toLowerCase()}`;
    const fonteRegras=d.fontes[c.fonteRegras].url;
    const fonteReferencia=paginaReferencia===null?"":d.fontes[c.fonteReferencia].url;
    return {
      id,nome:c.nome,instituicao:c.instituicao,campus:c.campus,uf:c.uf,turno:c.turno,
      modalidade:`${modalidade} · ${d.modalidades[modalidade]}`,pesos:{...c.pesos},minimos:{...c.minimos},
      mediaMinima:c.mediaMinima,bonus:0,referencia,anoReferencia:c.anoReferencia,
      tipoReferencia:"historico" as const,fonte:fonteReferencia||fonteRegras,exemplo:false,
      catalogo:{id,sigla:c.sigla,codigoCurso:c.codigoCurso,modalidadeCodigo:modalidade,municipio:c.municipio,
        anoRegras:2026,vagas,fonteRegras,paginaRegras:c.paginaRegras,fonteReferencia,paginaReferencia,
        coletadoEm:d.atualizadoEm,personalizada:false},
    };
  }));
}
export async function carregarCatalogo() {
  const r=await fetch("/catalogo-sisu.json");
  if(!r.ok) throw new Error("Não foi possível carregar o catálogo. Tente novamente.");
  const dados=await r.json() as CatalogoArquivo;
  return {...dados,ofertas:expandirCatalogo(dados)};
}
export function rotuloOrigem(o: Oferta) {
  return o.exemplo?"Fictícia · demonstração":o.catalogo?.personalizada?"Personalizada a partir do catálogo":o.catalogo?`Catálogo · ${o.catalogo.sigla} · regras ${o.catalogo.anoRegras}`:"Informada · conferir edital";
}

export function descricaoOferta(o: Oferta) {
  return [o.nome,o.catalogo?.sigla??o.instituicao,o.campus,o.turno,o.catalogo?.modalidadeCodigo??o.modalidade,o.exemplo?"fictícia":""].filter(Boolean).join(" · ");
}
