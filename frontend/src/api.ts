/** Cliente da API. Mesma origem: o cookie de sessão (httpOnly) vai sozinho, o código nunca o vê. */

export type Area = "LC" | "CH" | "CN" | "MT";
export type Tipo = "enem" | "simulado";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
}

export interface OpcaoCaderno {
  co_prova: number;
  cor: string;
  rotulo: string;
  referencia: "decil" | "tri";
  selecionavel: boolean;
  motivo: string;
}

export interface Questao {
  numero: number;
  introducao: string | null;
  enunciado: string | null;
  alternativas: Record<string, string | null>;
  imagens: unknown[];
  tem_texto: boolean;
}

export interface LinhaPerfil {
  area: string;
  habilidade: number;
  descricao: string | null;
  n: number;
  acertos: number;
  taxa: number;
  esperado: number;
  lacuna: number;
  z: number | null;
  selo: string;
  armadilhas: number;
}

export interface Resumo {
  id: string;
  ano: number;
  area: Area;
  co_prova: number;
  lingua: number | null;
  tipo: Tipo;
  feita_em: string | null;
  nota: number | null;
  nota_estimada: number | null;
  acertos: number | null;
  avaliadas: number | null;
  anuladas: number | null;
  referencia: "decil" | "tri" | null;
  origem: string | null;
  decil: number | null;
}

export interface Resultado extends Resumo {
  folha: string;
  habilidades: LinhaPerfil[];
}

export interface ResumoArea {
  area: Area;
  provas: number;
  ultima: number | null;
  anterior: number | null;
  variacao: number | null;
}

export interface Perfil {
  provas: Resumo[];
  areas: ResumoArea[];
  habilidades: LinhaPerfil[];
}

export interface NovaProva {
  ano: number;
  area: Area;
  co_prova: number;
  lingua: number | null;
  tipo: Tipo;
  feita_em: string | null;
  nota: number | null;
  folha: string;
}

export interface FocoRaioX {
  habilidade: number;
  descricao: string | null;
  n: number;
  esperado: number;
  alvo: number;
  ganho: number;
}

export interface QuestaoAoAlcance {
  habilidade: number;
  descricao: string | null;
  chance: number;
  questao: {
    introducao: string | null;
    enunciado: string | null;
    alternativas: Record<string, string | null>;
    imagens: unknown[];
  } | null;
}

/** Onde a nota fica num local: supera pelo menos `a_frente_de`% de `n` participantes. */
export interface Posicao {
  nome: string;
  a_frente_de: number;
  n: number;
}

export interface UfComDados {
  uf: string;
  n: number;
}

export interface MunicipioComDados {
  codigo: string;
  nome: string;
  n: number;
}

export interface AreaRaioX {
  area: Area;
  nota: number;
  brasil: Posicao | null;
  uf: Posicao | null;
  municipio: Posicao | null;
  decil: number | null;
  a_frente_de: number | null;
  alvo: number | null;
  total: number;
  esperado: number;
  faixas: { seguras: number; alcance: number; dificeis: number };
  foco: FocoRaioX[];
  alcance: QuestaoAoAlcance[];
}

export interface RaioX {
  ano: number;
  areas: AreaRaioX[];
}

export interface PedidoRaioX {
  ano: number;
  notas: Partial<Record<Area, number>>;
  lingua: number | null;
  uf: string | null;
  municipio: string | null;
}

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

function mensagemDeErro(corpo: unknown, status: number): string {
  const detalhe = (corpo as { detail?: unknown } | null)?.detail;
  if (typeof detalhe === "string") return detalhe;
  if (Array.isArray(detalhe) && detalhe.length > 0) {
    const msg = (detalhe[0] as { msg?: string }).msg;
    if (msg) return msg.replace(/^Value error, /, "");
  }
  return `Algo deu errado (código ${status}).`;
}

async function pedir<T>(caminho: string, metodo = "GET", corpo?: unknown): Promise<T> {
  const resposta = await fetch(caminho, {
    method: metodo,
    credentials: "same-origin",
    headers: corpo === undefined ? undefined : { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (resposta.status === 204) return undefined as T;
  const json = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new ErroApi(resposta.status, mensagemDeErro(json, resposta.status));
  return json as T;
}

export const api = {
  /** `null` quando não há sessão (não é erro: é a tela de entrada). */
  eu: () =>
    pedir<Usuario>("/conta/eu").catch((erro: unknown) => {
      if (erro instanceof ErroApi && erro.status === 401) return null;
      throw erro;
    }),
  cadastrar: (dados: { nome: string; email: string; senha: string }) =>
    pedir<Usuario>("/conta/cadastro", "POST", { ...dados, maior_de_18: true }),
  entrar: (dados: { email: string; senha: string }) =>
    pedir<Usuario>("/conta/entrar", "POST", dados),
  sair: () => pedir<void>("/conta/sair", "POST"),

  anos: () => pedir<number[]>("/anos"),
  cadernos: (ano: number, area: Area) =>
    pedir<OpcaoCaderno[]>(`/anos/${ano}/areas/${area}/cadernos`),
  questoes: (coProva: number, ano: number, area: Area, lingua: number | null) => {
    const filtro = new URLSearchParams({ ano: String(ano), area });
    if (lingua !== null) filtro.set("lingua", String(lingua));
    return pedir<Questao[]>(`/cadernos/${coProva}/questoes?${filtro}`);
  },

  gravarProva: (prova: NovaProva) => pedir<Resultado>("/provas", "POST", prova),
  provas: () => pedir<Resumo[]>("/provas"),
  prova: (id: string) => pedir<Resultado>(`/provas/${id}`),
  editarProva: (id: string, prova: NovaProva) => pedir<Resultado>(`/provas/${id}`, "PUT", prova),
  excluirProva: (id: string) => pedir<void>(`/provas/${id}`, "DELETE"),
  ufs: (ano: number) => pedir<UfComDados[]>(`/geo/ufs?ano=${ano}`),
  municipios: (ano: number, uf: string) =>
    pedir<MunicipioComDados[]>(`/geo/municipios?ano=${ano}&uf=${uf}`),
  raioX: (pedido: PedidoRaioX) => pedir<RaioX>("/raio-x", "POST", pedido),
  relatorio: (area: Area | null) =>
    pedir<{ texto: string; origem: "ia" | "padrao" }>(
      area ? `/relatorio?area=${area}` : "/relatorio",
      "POST",
    ),
  perfil: (area: Area | null) => pedir<Perfil>(area ? `/perfil?area=${area}` : "/perfil"),
};
