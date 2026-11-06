import dados from "../public/catalogo-sisu.json";
import { expandirCatalogo, normalizarBusca, ofertasIniciais, notaPublicada, descricaoOferta, type CatalogoArquivo } from "./catalogo";
import { validarOferta, validarEstrategia, vazioEstrategia } from "./estrategia";

const catalogo=expandirCatalogo(dados as unknown as CatalogoArquivo);
it("mantém 204 cursos/turnos e 1634 modalidades com vagas, sem cursos fictícios",()=>{
  expect(dados.cursos).toHaveLength(204);expect(catalogo).toHaveLength(1634);
  expect(new Set(catalogo.map(o=>o.id)).size).toBe(catalogo.length);
  for(const o of catalogo){expect(()=>validarOferta(o)).not.toThrow();expect(o.exemplo).toBe(false);expect(o.catalogo!.vagas).toBeGreaterThan(0);expect(o.catalogo!.anoRegras).toBe(2026);}
  expect(catalogo.filter(o=>o.referencia!==null)).toHaveLength(1375);
});
it("preserva fonte e ano distintos para regras de 2026 e cortes de 2025",()=>{
  const o=catalogo.find(o=>o.id==="ufc-2026-1272079-integral-ac")!;
  expect(o.referencia).toBe(682.42);expect(o.anoReferencia).toBe(2025);expect(o.catalogo!.anoRegras).toBe(2026);
  expect(o.mediaMinima).toBe(450);expect(o.minimos.RED).toBe(.01);
  expect(o.catalogo!.fonteRegras).toContain("termo-de-adesao-ufc-sisu-2026");expect(o.catalogo!.fonteReferencia).toContain("notas-de-corte-sisu-ufc-2025");
  expect(notaPublicada(o.referencia!)).toBe("682,42");expect(notaPublicada(o.minimos.RED)).toBe("0,01");
});
it("usa a pontuação mínima da chamada regular, sem trocar pelo máximo",()=>{
  const o=catalogo.find(o=>o.id==="ufmg-2026-12941-matutino-ac")!;
  expect(o.referencia).toBe(746.56);expect(o.anoReferencia).toBe(2026);
  expect(o.catalogo!.paginaReferencia).toBe(1);
});
it("não empresta a referência de outro turno ou modalidade",()=>{
  const noturno=catalogo.find(o=>o.id==="ufc-2026-38208-noturno-ac")!;
  expect(noturno.referencia).toBeNull();expect(noturno.catalogo!.paginaReferencia).toBeNull();
  expect(catalogo.find(o=>o.id==="ufc-2026-1272079-integral-li-ep")).toBeUndefined();
  const cota=catalogo.find(o=>o.id==="ufc-2026-1272079-integral-li_ep")!;
  expect(cota.referencia).toBe(680.68);
});
it("inicia com seis ofertas reais idênticas ao catálogo e sem notas do aluno",()=>{
  const e=vazioEstrategia();expect(e.conjuntos).toEqual([]);expect(e.alvo).toBe("");expect(e.ofertas).toHaveLength(6);
  expect(validarEstrategia(e).ofertas).toHaveLength(6);
  for(const o of ofertasIniciais())expect(o).toEqual(catalogo.find(c=>c.id===o.id));
  const copias=ofertasIniciais();copias[0].pesos.MT=10;expect(ofertasIniciais()[0].pesos.MT).toBe(1);
  expect(normalizarBusca("Ciência da Computação")).toBe("ciencia da computacao");
});

it("distingue ofertas do mesmo curso no seletor por campus, turno e modalidade",()=>{
  const a=catalogo.find(o=>o.id==="ufc-2026-1272079-integral-ac")!;
  const b=catalogo.find(o=>o.id==="ufc-2026-1272079-integral-li_ep")!;
  expect(descricaoOferta(a)).not.toBe(descricaoOferta(b));
  expect(descricaoOferta(b)).toContain("Campus da UFC em Crateús");
  expect(descricaoOferta(b)).toContain("LI_EP");
});
