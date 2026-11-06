import type { Area, NovaProva, PedidoRaioX, RaioX, Resultado } from "./api";
import { folhaDeTexto, type Folha } from "./folha";
import { nomeDaArea } from "./rotulos";

export interface ProvaDaAnalise {
  area: Area;
  co_prova: number;
  folha: string;
  total: number;
}

export interface EntradaAnalise extends PedidoRaioX {
  provas: ProvaDaAnalise[];
}

export function lerSequencia(texto: string, total: number): Folha {
  const sequencia = texto.toUpperCase().replace(/[\s,;|]+/g, "");
  if (!/^[ABCDE.*]+$/.test(sequencia)) throw new Error("Use somente A, B, C, D, E, ponto para branco e asterisco para dupla marcação.");
  if (sequencia.length !== total) throw new Error(`Esta prova tem ${total} questões; você informou ${sequencia.length} respostas. Confira o caderno e a língua.`);
  return folhaDeTexto(sequencia);
}

interface ApiDaAnalise {
  gravarProva: (p: NovaProva) => Promise<Resultado>;
  raioX: (p: PedidoRaioX) => Promise<RaioX>;
}

/** A mesma API autenticada do Meu Bizu: grava primeiro, corrige no servidor e então cruza o Raio-X. */
export async function executarAnalise(
  entrada: EntradaAnalise,
  api: ApiDaAnalise,
  salvas: Map<string, Resultado>,
  progresso: (texto: string) => void,
): Promise<{ dados: RaioX; provas: Resultado[]; estimadas: Area[] }> {
  const areas: Area[] = ["LC", "CH", "CN", "MT"];
  const notas = { ...entrada.notas };
  if (!Number.isInteger(entrada.ano) || entrada.ano < 2009) throw new Error("Escolha o ano da prova.");
  if (Object.entries(notas).some(([a, n]) => !areas.includes(a as Area) || typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1000)) throw new Error("Cada nota deve estar entre 0 e 1000.");
  const usaLC = notas.LC !== undefined || entrada.provas.some(p => p.area === "LC");
  if (usaLC && ![0, 1].includes(entrada.lingua as number)) throw new Error("Informe a língua estrangeira de Linguagens.");
  const unicas = new Set<Area>();
  for (const p of entrada.provas) {
    if (!areas.includes(p.area) || unicas.has(p.area)) throw new Error("Inclua somente uma prova por área nesta análise.");
    unicas.add(p.area);
    if (!Number.isInteger(p.co_prova) || p.co_prova <= 0 || !Number.isInteger(p.total) || p.total <= 0) throw new Error(`Escolha o caderno de ${nomeDaArea(p.area)}.`);
    lerSequencia(p.folha, p.total);
  }
  if (!Object.keys(notas).length && !entrada.provas.length) throw new Error("Informe pelo menos uma nota ou as respostas de uma prova.");
  const provas: Resultado[] = [];
  const estimadas: Area[] = [];
  for (const p of entrada.provas) {
    const prova: NovaProva = {
      ano: entrada.ano, area: p.area, co_prova: p.co_prova,
      lingua: p.area === "LC" ? entrada.lingua : null,
      tipo: "enem", feita_em: null, nota: notas[p.area] ?? null,
      folha: lerSequencia(p.folha, p.total).join(""),
    };
    const chave = JSON.stringify(prova);
    progresso(`Salvando e corrigindo ${nomeDaArea(p.area)}…`);
    let resultado = salvas.get(chave);
    if (!resultado) {
      resultado = await api.gravarProva(prova);
      salvas.set(chave, resultado);
    }
    provas.push(resultado);
    if (notas[p.area] === undefined) {
      if (resultado.nota_estimada === null || !Number.isFinite(resultado.nota_estimada)) throw new Error(`A prova de ${nomeDaArea(p.area)} foi corrigida, mas não foi possível estimar a nota. Volte ao primeiro passo e informe a nota para gerar o comparativo.`);
      notas[p.area] = resultado.nota_estimada;
      estimadas.push(p.area);
    }
  }
  progresso("Calculando o Raio-X e os comparativos com a referência do INEP…");
  const dados = await api.raioX({ ano: entrada.ano, notas, lingua: usaLC ? entrada.lingua : null, uf: entrada.uf, municipio: entrada.municipio });
  return { dados, provas, estimadas };
}

