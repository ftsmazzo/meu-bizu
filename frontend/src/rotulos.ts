/** Textos que o aluno vê. Sem jargão estatístico (decil, TRI, z) na frente dele. */

import type { Area, Resumo } from "./api";

export const AREAS: { valor: Area; nome: string }[] = [
  { valor: "LC", nome: "Linguagens" },
  { valor: "CH", nome: "Ciências Humanas" },
  { valor: "CN", nome: "Ciências da Natureza" },
  { valor: "MT", nome: "Matemática" },
];

export const nomeDaArea = (area: string) => AREAS.find((a) => a.valor === area)?.nome ?? area;

export const SELOS: Record<string, { texto: string; classe: string }> = {
  firme: { texto: "Foque aqui", classe: "selo foco" },
  indicativo: { texto: "Vale olhar", classe: "selo olhar" },
  "sem sinal": { texto: "Sem sinal de lacuna", classe: "selo ok" },
  "poucos itens": { texto: "Poucas questões", classe: "selo poucos" },
};

export function dataCurta(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function tituloDaProva(p: Pick<Resumo, "area" | "ano" | "tipo" | "feita_em">): string {
  const onde = p.tipo === "enem" ? `Enem ${p.ano}` : `Simulado com a prova de ${p.ano}`;
  return `${nomeDaArea(p.area)} · ${onde}`;
}

export function explicarReferencia(p: Pick<Resumo, "referencia" | "nota">): string {
  if (p.referencia === "tri") {
    return "Para esta prova usamos a dificuldade das questões como referência.";
  }
  return p.nota !== null
    ? "Comparamos você com quem tirou uma nota parecida com a sua."
    : "Sem a nota, comparamos pelos seus acertos com quem teve desempenho parecido.";
}

/** Uma casa decimal, vírgula. */
export const decimal = (n: number) => n.toFixed(1).replace(".", ",");
