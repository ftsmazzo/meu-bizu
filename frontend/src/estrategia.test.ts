import { describe, expect, it } from "vitest";
import { avaliarOferta, cinco, completas, melhorConjunto, metaInversa, planoReal, simularNotas, unirRaiox, validarEstrategia, vazioEstrategia, type Oferta } from "./estrategia";
import type { LinhaPerfil, PedidoSalvo } from "./api";

const oferta:Oferta={ id:"teste",nome:"Computação",instituicao:"Instituição informada",campus:"Campus informado",uf:"AL",modalidade:"Ampla concorrência",turno:"Integral",pesos:{LC:2,CH:1,CN:2,MT:4,RED:1},minimos:cinco(400),mediaMinima:0,bonus:0,referencia:720,anoReferencia:2025,tipoReferencia:"historico",fonte:"https://www.gov.br/mec",exemplo:false };
const notas={LC:640,CH:680,CN:610,MT:670,RED:800};
describe("cenários de ingresso preservados junto da análise real",()=>{
  it("faz a média ponderada e verifica cada mínimo",()=>{expect(avaliarOferta(notas,oferta).media).toBe(666);expect(avaliarOferta({...notas,CN:300},oferta).atendeMinimos).toBe(false);});
  it("mantém referência ausente como ausente e não presume aprovação",()=>{expect(avaliarOferta(notas,{...oferta,referencia:null}).diferenca).toBeNull();expect(metaInversa(notas,{...oferta,referencia:null},"MT").tipo).toBe("sem-referencia");});
  it("usa um conjunto completo por ano, dentro das edições configuradas",()=>{const c=[{ano:2025,notas,origem:"Raio-X"},{ano:2024,notas:{LC:620,CH:650,CN:650,MT:700,RED:760},origem:"Informado"},{ano:2022,notas:cinco(1000),origem:"Fora da seleção"}];expect(melhorConjunto(c,oferta,2026)?.media).toBe(675);expect(melhorConjunto(c,oferta,2026)?.ano).toBe(2024);});
  it("não inventa Redação ao importar as quatro notas do Raio-X",()=>{const c=unirRaiox([],[{ano:2025,notas:{MT:700,LC:600,CH:650,CN:620}} as PedidoSalvo]);expect(c[0].notas.RED).toBeUndefined();expect(completas(c[0])).toBeNull();});
  it("preserva a redação e as edições já editadas ao receber o Raio-X salvo",()=>{const c=unirRaiox([{ano:2025,notas:{RED:840,MT:720},origem:"Informado"}],[{ano:2025,notas:{MT:700,CN:620}} as PedidoSalvo]);expect(c[0].notas).toEqual({MT:720,CN:620,RED:840});});
  it("calcula meta inversa verificável e os casos impossíveis",()=>{const r=metaInversa(notas,oferta,"MT");expect(r.nota).toBe(805);expect(avaliarOferta({...notas,MT:r.nota!},oferta).media).toBe(720);expect(metaInversa(notas,{...oferta,pesos:{...oferta.pesos,MT:0}},"MT").tipo).toBe("peso-zero");expect(metaInversa(notas,{...oferta,referencia:1999},"MT").tipo).toBe("impossivel");});
  it("aplica bônus configurado sem presumir direito a ele",()=>{expect(avaliarOferta(notas,{...oferta,bonus:10}).media).toBeCloseTo(732.6);const o={...oferta,bonus:10};const r=metaInversa(notas,o,"MT");expect(avaliarOferta({...notas,MT:r.nota!},o).media).toBeCloseTo(720);});
  it("não conta redação zerada como atendimento dos mínimos",()=>expect(avaliarOferta({...notas,RED:0},{...oferta,minimos:cinco(0)}).atendeMinimos).toBe(false));
  it("respeita o teto da nota simulada e rejeita valores não finitos",()=>{expect(simularNotas({...notas,MT:980},{MT:100}).MT).toBe(1000);expect(()=>simularNotas(notas,{MT:Infinity})).toThrow();expect(()=>avaliarOferta(notas,{...oferta,pesos:cinco(0)})).toThrow();});
  it("valida a importação e bloqueia fonte que execute código",()=>{const e={...vazioEstrategia(),ofertas:[oferta]};expect(validarEstrategia(e).ofertas).toHaveLength(1);expect(()=>validarEstrategia({...e,ofertas:[{...oferta,fonte:"javascript:alert(1)"}]})).toThrow();expect(()=>validarEstrategia({...e,ofertas:[oferta,oferta]})).toThrow();});
});
describe("plano gerado das habilidades reais",()=>{
  const habilidade={area:"MT",habilidade:16,n:10,acertos:3,taxa:.3,esperado:.7,lacuna:-.4,z:-2,selo:"firme",armadilhas:0,descricao:"Proporções"} as LinhaPerfil;
  it("usa dados do perfil e cabe no tempo informado",()=>{const p=planoReal([habilidade],1,oferta);expect(p.minutos).toBeLessThanOrEqual(60);expect(p.tarefas[0].habilidade).toBe(16);expect(p.tarefas[0].area).toBe("MT");});
  it("sem provas não fabrica um plano ou habilidades",()=>expect(planoReal([],3,oferta).tarefas).toEqual([]));
  it("poucos itens pedem investigação, não revisão firme",()=>{const p=planoReal([{...habilidade,n:2}],3,oferta);expect(p.tarefas).toHaveLength(1);expect(p.tarefas[0].tipo).toBe("Investigar");});
});

