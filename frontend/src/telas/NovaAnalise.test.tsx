import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NovaAnalise } from "./NovaAnalise";

const area = { area: "MT", nota: 650, brasil: { nome: "Brasil", a_frente_de: 70, n: 1000000 }, uf: { nome: "AL", a_frente_de: 75, n: 30000 }, municipio: { nome: "Maceió", a_frente_de: 65, n: 5000 }, decil: 8, a_frente_de: 70, alvo: 690, total: 45, esperado: 22, faixas: { seguras: 10, alcance: 15, dificeis: 20 }, foco: [], alcance: [], sua_prova: null };
let chamadas: { url: string; corpo: unknown }[];

beforeEach(() => {
  chamadas = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") chamadas.push({ url, corpo: JSON.parse(String(init.body)) });
    if (url === "/anos") return new Response(JSON.stringify([2023]));
    if (url === "/provas" && init?.method === "POST") return new Response(JSON.stringify({ id: "p1", ano: 2023, area: "MT", nota_estimada: 640 }));
    if (url === "/provas") return new Response("[]");
    if (url === "/geo/ufs?ano=2023") return new Response(JSON.stringify([{ uf: "AL", n: 30000 }]));
    if (url === "/geo/municipios?ano=2023&uf=AL") return new Response(JSON.stringify([{ codigo: "2704302", nome: "Maceió", n: 5000 }]));
    if (url === "/anos/2023/areas/MT/cadernos") return new Response(JSON.stringify([{ co_prova: 1227, cor: "AZUL", rotulo: "AZUL 1227", referencia: "decil", selecionavel: true, motivo: "" }]));
    if (String(url).startsWith("/cadernos/1227/questoes")) return new Response(JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ numero: i + 1, introducao: null, enunciado: null, alternativas: {}, imagens: [], tem_texto: false }))));
    if (url === "/raio-x") return new Response(JSON.stringify({ ano: 2023, areas: [area] }));
    return new Response("{}", { status: 404 });
  }));
  vi.stubGlobal("scrollTo", vi.fn());
});

function montar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={cliente}><NovaAnalise aoVoltar={vi.fn()} aoIncluirProva={vi.fn()} aoVerDiagnostico={vi.fn()} /></QueryClientProvider>);
}
async function preencherContexto(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: "2023" });
  await user.selectOptions(screen.getByLabelText("Ano do Enem"), "2023");
  await user.type(screen.getByLabelText("Nota de Matemática"), "650");
  await screen.findByRole("option", { name: "AL" });
  await user.selectOptions(screen.getByLabelText("Estado da prova"), "AL");
  await screen.findByRole("option", { name: "Maceió" });
  await user.selectOptions(screen.getByLabelText("Município da prova"), "2704302");
  await user.click(screen.getByRole("button", { name: "Continuar para respostas →" }));
}

it("conduz notas, localização, conferência e resultado com comparativos reais da resposta da API", async () => {
  const user = userEvent.setup(); montar();
  expect(screen.getByRole("button", { name: "Continuar para respostas →" })).toBeDisabled();
  await preencherContexto(user);
  await user.click(screen.getByRole("button", { name: "Conferir análise →" }));
  await user.click(screen.getByRole("button", { name: "Salvar, corrigir e gerar Raio-X →" }));
  await screen.findByRole("heading", { name: "Seu Raio-X do Enem 2023" });
  expect(chamadas).toEqual([{ url: "/raio-x", corpo: { ano: 2023, notas: { MT: 650 }, lingua: null, uf: "AL", municipio: "2704302" } }]);
  expect(screen.getByRole("heading", { name: "Seu ranking" })).toBeInTheDocument();
  expect(screen.getAllByText("Maceió").length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: "Nova análise" })).toBeInTheDocument();
});

it("exige folha completa e corrige a prova antes de gerar o Raio-X", async () => {
  const user = userEvent.setup(); montar(); await preencherContexto(user);
  await user.click(screen.getByLabelText(/Adicionar respostas de Matemática/));
  await screen.findByRole("option", { name: "AZUL 1227" });
  await user.selectOptions(screen.getByLabelText("Caderno de Matemática"), "1227");
  const campo = await screen.findByLabelText("Sequência de respostas de Matemática");
  expect(screen.getByRole("button", { name: "Conferir análise →" })).toBeDisabled();
  await user.type(campo, "ABC");
  await user.click(screen.getByRole("button", { name: "Aplicar sequência" }));
  expect(screen.getByRole("alert")).toHaveTextContent("5 questões");
  await user.clear(campo); await user.type(campo, "ABCDE");
  await user.click(screen.getByRole("button", { name: "Aplicar sequência" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Conferir análise →" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Conferir análise →" }));
  await user.click(screen.getByRole("button", { name: "Salvar, corrigir e gerar Raio-X →" }));
  await screen.findByRole("heading", { name: "Seu Raio-X do Enem 2023" });
  expect(chamadas.map(c => c.url)).toEqual(["/provas", "/raio-x"]);
  expect(chamadas[0].corpo).toMatchObject({ ano: 2023, area: "MT", co_prova: 1227, folha: "ABCDE", nota: 650 });
  expect(screen.getByText("1 prova corrigida e salva na sua conta.")).toBeInTheDocument();
});

