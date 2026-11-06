import { ofertasIniciais, type OrigemCatalogo } from "./catalogo";
import type { LinhaPerfil, PedidoSalvo } from "./api";

export const AREAS_INGRESSO = ["LC", "CH", "CN", "MT", "RED"] as const;
export type AreaIngresso = typeof AREAS_INGRESSO[number];
export const NOMES_INGRESSO: Record<AreaIngresso, string> = { LC: "Linguagens", CH: "Humanas", CN: "Natureza", MT: "Matemática", RED: "Redação" };
export type CincoNotas = Record<AreaIngresso, number>;
export interface ConjuntoNotas { ano: number; notas: Partial<CincoNotas>; origem: string }
export interface Oferta {
  id: string; nome: string; instituicao: string; campus: string; uf: string; modalidade: string; turno: string;
  pesos: CincoNotas; minimos: CincoNotas; mediaMinima: number; bonus: number;
  referencia: number | null; anoReferencia: number; tipoReferencia: "meta" | "historico" | "parcial";
  fonte: string; exemplo: boolean; catalogo?: OrigemCatalogo;
}
export interface EstrategiaSalva {
  versao: 1; catalogoVersao?: number; selecao: number; conjuntos: ConjuntoNotas[]; ofertas: Oferta[];
  alvo: string; horas: number; concluidas: Record<string, boolean>;
}
export const vazioEstrategia = (): EstrategiaSalva => ({ versao: 1, catalogoVersao: 1, selecao: 2026, conjuntos: [], ofertas: ofertasIniciais(), alvo: "", horas: 3, concluidas: {} });
export function cinco(valor: number): CincoNotas { return { LC: valor, CH: valor, CN: valor, MT: valor, RED: valor }; }
function limitado(n: unknown, de: number, ate: number, nome: string): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < de || n > ate) throw new Error(`${nome}: informe um número entre ${de} e ${ate}.`);
  return n;
}
export function completas(c: ConjuntoNotas): CincoNotas | null {
  if (AREAS_INGRESSO.some(a => typeof c.notas[a] !== "number" || !Number.isFinite(c.notas[a]) || c.notas[a]! < 0 || c.notas[a]! > 1000)) return null;
  return c.notas as CincoNotas;
}
export function validarOferta(o: Oferta): Oferta {
  if (!o.nome?.trim() || o.nome.length > 160) throw new Error("Informe o curso (até 160 caracteres).");
  for (const a of AREAS_INGRESSO) {
    limitado(o.pesos[a], 0, 10, `Peso de ${NOMES_INGRESSO[a]}`);
    limitado(o.minimos[a], 0, 1000, `Mínimo de ${NOMES_INGRESSO[a]}`);
  }
  if (!AREAS_INGRESSO.some(a => o.pesos[a] > 0)) throw new Error("Pelo menos um peso deve ser maior que zero.");
  limitado(o.mediaMinima, 0, 1000, "Média mínima antes do bônus");
  limitado(o.bonus, 0, 100, "Bônus aplicável");
  if (o.referencia !== null) limitado(o.referencia, 0, 2000, "Referência do cenário");
  limitado(o.anoReferencia, 2009, 2100, "Ano da referência");
  if (!["meta", "historico", "parcial"].includes(o.tipoReferencia)) throw new Error("Escolha o tipo da referência.");
  if (o.fonte) { const u = new URL(o.fonte); if (!["https:", "http:"].includes(u.protocol)) throw new Error("Use uma URL http ou https para a fonte."); }
  if(o.catalogo) {
    const c=o.catalogo;
    for(const url of [c.fonteRegras,c.fonteReferencia].filter(Boolean)) if(new URL(url).protocol!=="https:") throw new Error("A fonte do catálogo precisa usar https.");
    limitado(c.anoRegras,2009,2100,"Ano das regras"); limitado(c.paginaRegras,1,5000,"Página das regras"); limitado(c.vagas,1,100000,"Vagas da edição");
    if(c.paginaReferencia!==null) limitado(c.paginaReferencia,1,5000,"Página da referência");
    if(typeof c.id!=="string" || typeof c.sigla!=="string" || !c.fonteRegras) throw new Error("Origem do catálogo inválida.");
  }
  return o;
}
export function avaliarOferta(notas: CincoNotas, oferta: Oferta) {
  validarOferta(oferta);
  for (const a of AREAS_INGRESSO) limitado(notas[a], 0, 1000, NOMES_INGRESSO[a]);
  const pesoTotal = AREAS_INGRESSO.reduce((s,a) => s+oferta.pesos[a],0);
  const mediaBase = AREAS_INGRESSO.reduce((s,a) => s+notas[a]*oferta.pesos[a],0)/pesoTotal;
  const media = mediaBase*(1+oferta.bonus/100);
  const motivos = AREAS_INGRESSO.filter(a => notas[a] < oferta.minimos[a]).map(a => `Mínimo de ${NOMES_INGRESSO[a]}`);
  if (notas.RED <= 0) motivos.push("Redação precisa ser maior que zero");
  if (mediaBase < oferta.mediaMinima) motivos.push("Média mínima antes do bônus");
  return { media, mediaBase, motivos, atendeMinimos: motivos.length === 0, diferenca: oferta.referencia === null ? null : media-oferta.referencia };
}
export function melhorConjunto(conjuntos: ConjuntoNotas[], oferta: Oferta, selecao: number) {
  return conjuntos.filter(c => c.ano >= selecao-3 && c.ano < selecao).flatMap(c => {
    const notas = completas(c); if (!notas) return [];
    const resultado = avaliarOferta(notas,oferta);
    return resultado.atendeMinimos ? [{ ...resultado, ano: c.ano, notas }] : [];
  }).sort((a,b) => b.media-a.media || b.ano-a.ano)[0] ?? null;
}
export function simularNotas(notas: CincoNotas, acrescimos: Partial<CincoNotas>): CincoNotas {
  return Object.fromEntries(AREAS_INGRESSO.map(a => [a,Math.min(1000,limitado(notas[a],0,1000,NOMES_INGRESSO[a])+limitado(acrescimos[a]??0,0,200,`Acréscimo de ${NOMES_INGRESSO[a]}`))])) as CincoNotas;
}
export function metaInversa(notas: CincoNotas, o: Oferta, area: AreaIngresso) {
  const r = avaliarOferta(notas,o);
  if (o.referencia === null) return { tipo: "sem-referencia", nota: null } as const;
  if (!o.pesos[area]) return { tipo: "peso-zero", nota: null } as const;
  if (AREAS_INGRESSO.some(a => a !== area && (notas[a]<o.minimos[a] || a === "RED" && notas[a]<=0))) return { tipo: "outro-minimo", nota: null } as const;
  const somaPesos=AREAS_INGRESSO.reduce((s,a)=>s+o.pesos[a],0);
  const outras=AREAS_INGRESSO.filter(a=>a!==area).reduce((s,a)=>s+notas[a]*o.pesos[a],0);
  const alvoBase=Math.max(o.mediaMinima,o.referencia/(1+o.bonus/100));
  const nota=Math.max(area === "RED" ? .1 : 0,o.minimos[area],(alvoBase*somaPesos-outras)/o.pesos[area]);
  return { tipo: nota>1000 ? "impossivel" : nota<=notas[area] && r.atendeMinimos ? "atingida" : "necessaria", nota } as const;
}
export function unirRaiox(conjuntos: ConjuntoNotas[], salvos: PedidoSalvo[]): ConjuntoNotas[] {
  const mapa=new Map(conjuntos.map(c=>[c.ano,c]));
  for (const salvo of salvos) {
    const atual=mapa.get(salvo.ano);
    mapa.set(salvo.ano,{ ano: salvo.ano, notas:{...salvo.notas,...atual?.notas},origem:atual?.origem??"Raio-X salvo na sua conta" });
  }
  return [...mapa.values()].sort((a,b)=>b.ano-a.ano);
}
export function prioridadesReais(habilidades: LinhaPerfil[], oferta?: Oferta) {
  return habilidades.map(h=>({ ...h, prioridade: h.n>=3 ? Math.max(0,-h.lacuna)*Math.min(h.n/12,1)*(oferta?.pesos[h.area as AreaIngresso]??1) : 0 })).sort((a,b)=>b.prioridade-a.prioridade || b.n-a.n);
}
export function planoReal(habilidades: LinhaPerfil[], horas: number, oferta?: Oferta) {
  limitado(horas,1,20,"Horas disponíveis");
  const prioridades=prioridadesReais(habilidades,oferta);
  const candidatas: { id: string; area: string; habilidade: number; titulo: string; descricao: string; minutos: number; tipo: string }[]=[];
  for (const h of prioridades.filter(h=>h.prioridade>0).slice(0,2)) {
    const chave=`${h.area}-H${h.habilidade}`;
    for (const [tipo,minutos,descricao] of [["Revisar",30,"Releia um exemplo resolvido e explique o raciocínio com suas palavras."],["Praticar",45,"Resolva novos itens dessa habilidade e registre o motivo de cada erro."],["Verificar",15,"Faça outra lista sem consulta para conferir o que mudou."]] as const) candidatas.push({id:`${chave}-${tipo}`,area:h.area,habilidade:h.habilidade,titulo:`${tipo} · ${h.area} H${h.habilidade}`,descricao,minutos,tipo});
  }
  const investigar=prioridades.find(h=>h.n<3);
  if(investigar)candidatas.push({id:`${investigar.area}-H${investigar.habilidade}-Investigar`,area:investigar.area,habilidade:investigar.habilidade,titulo:`Investigar · ${investigar.area} H${investigar.habilidade}`,descricao:"Responda itens novos antes de concluir que existe uma dificuldade nesta habilidade.",minutos:20,tipo:"Investigar"});
  let minutos=0;
  const tarefas=candidatas.filter(t=>{if(minutos+t.minutos>horas*60)return false;minutos+=t.minutos;return true;});
  return { tarefas,minutos,livres:horas*60-minutos };
}
export function validarEstrategia(raw: unknown): EstrategiaSalva {
  if(!raw||typeof raw!=="object")throw new Error("Arquivo de estratégia inválido.");
  const d=raw as EstrategiaSalva;
  if(d.versao!==1||!Array.isArray(d.conjuntos)||!Array.isArray(d.ofertas)||d.conjuntos.length>10||d.ofertas.length>100)throw new Error("Use um arquivo de estratégia Bizu, versão 1, com até 100 ofertas.");
  limitado(d.selecao,2026,2100,"Ano da seleção");if(!Number.isInteger(d.selecao))throw new Error("Ano da seleção inválido.");limitado(d.horas,1,20,"Horas disponíveis");
  const anos=new Set<number>();
  const conjuntos=d.conjuntos.map(c=>{limitado(c.ano,2009,2100,"Ano do Enem");if(!Number.isInteger(c.ano)||anos.has(c.ano))throw new Error("Ano repetido ou inválido.");anos.add(c.ano);const notas:Partial<CincoNotas>={};for(const a of AREAS_INGRESSO)if(c.notas?.[a]!==undefined)notas[a]=limitado(c.notas[a],0,1000,NOMES_INGRESSO[a]);return{ano:c.ano,notas,origem:String(c.origem??"Informado por você").slice(0,120)};});
  const ids=new Set<string>();
  const ofertas=d.ofertas.map(o=>{if(typeof o.id!=="string"||!/^[-_a-zA-Z0-9]{1,80}$/.test(o.id)||ids.has(o.id))throw new Error("Identificador de oferta inválido ou repetido.");ids.add(o.id);validarOferta(o);return{...o,instituicao:String(o.instituicao??"").slice(0,160),campus:String(o.campus??"").slice(0,160),uf:String(o.uf??"").slice(0,2),modalidade:String(o.modalidade??"").slice(0,240),turno:String(o.turno??"").slice(0,60),exemplo:o.exemplo===true};});
  const concluidas:Record<string,boolean>={};for(const [key,v]of Object.entries(d.concluidas??{}))if(/^[-a-zA-Z0-9]{1,100}$/.test(key)&&typeof v==="boolean")concluidas[key]=v;
  return { versao:1,catalogoVersao:d.catalogoVersao===1?1:undefined,selecao:d.selecao,conjuntos,ofertas,alvo:ofertas.some(o=>o.id===d.alvo)?d.alvo:ofertas[0]?.id??"",horas:d.horas,concluidas };
}
