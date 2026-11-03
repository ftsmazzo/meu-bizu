import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RaioX } from "./RaioX";
import { frasePosicao } from "./RaioXPainel";

const MT = {
  area: "MT",
  nota: 640,
  decil: 8,
  a_frente_de: 70,
  alvo: 690,
  total: 45,
  esperado: 19.8,
  faixas: { seguras: 9, alcance: 11, dificeis: 25 },
  foco: [
    { habilidade: 12, descricao: "Medidas de grandezas", n: 2, esperado: 0.8, alvo: 1.3, ganho: 0.5 },
  ],
  alcance: [
    {
      habilidade: 5,
      descricao: "Números",
      chance: 62,
      questao: {
        introducao: null,
        enunciado: "Quanto é 2+2?",
        alternativas: { A: "três", B: "quatro" },
        imagens: [],
      },
    },
  ],
};

let corpos: unknown[] = [];

beforeEach(() => {
  corpos = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/anos") return new Response(JSON.stringify([2022, 2023]));
      if (url === "/raio-x") {
        corpos.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ ano: 2023, areas: [MT] }));
      }
      return new Response("{}", { status: 404 });
    }),
  );
});

function montar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const aoIncluirProva = vi.fn();
  render(
    <QueryClientProvider client={cliente}>
      <RaioX aoVoltar={vi.fn()} aoIncluirProva={aoIncluirProva} />
    </QueryClientProvider>,
  );
  return { aoIncluirProva };
}

describe("Raio-X pela nota", () => {
  it("só libera o botão com ano e pelo menos uma nota válida", async () => {
    const user = userEvent.setup();
    montar();
    const botao = screen.getByRole("button", { name: "Ver meu Raio-X" });
    expect(botao).toBeDisabled();
    await screen.findByRole("option", { name: "2023" });
    await user.selectOptions(screen.getByLabelText("Ano do Enem"), "2023");
    expect(botao).toBeDisabled();
    await user.type(screen.getByLabelText("Matemática"), "1200");
    expect(screen.getByText("Cada nota vai de 0 a 1000.")).toBeInTheDocument();
    expect(botao).toBeDisabled();
    await user.clear(screen.getByLabelText("Matemática"));
    await user.type(screen.getByLabelText("Matemática"), "640,5");
    expect(botao).toBeEnabled();
  });

  it("pede a língua quando há nota de Linguagens", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByRole("option", { name: "2023" });
    await user.selectOptions(screen.getByLabelText("Ano do Enem"), "2023");
    await user.type(screen.getByLabelText("Linguagens"), "520");
    expect(screen.getByRole("button", { name: "Ver meu Raio-X" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/Língua estrangeira/), "0");
    expect(screen.getByRole("button", { name: "Ver meu Raio-X" })).toBeEnabled();
  });

  it("manda só as áreas preenchidas, com vírgula decimal, e mostra o painel", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByRole("option", { name: "2023" });
    await user.selectOptions(screen.getByLabelText("Ano do Enem"), "2023");
    await user.type(screen.getByLabelText("Matemática"), "640,5");
    await user.click(screen.getByRole("button", { name: "Ver meu Raio-X" }));

    expect(corpos).toEqual([{ ano: 2023, notas: { MT: 640.5 }, lingua: null }]);
    expect(
      await screen.findByRole("heading", { name: "Seu Raio-X do Enem 2023" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Você está à frente de pelo menos 70% dos participantes.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/20 de 45/)).toBeInTheDocument();
    expect(screen.getByText("+0,5")).toBeInTheDocument();
    const alcance = screen.getByText(/62% de chance/).closest("li") as HTMLElement;
    expect(within(alcance).getByText("Quanto é 2+2?")).toBeInTheDocument();
  });

  it("não pede senha do gov.br e abre o INEP em outra aba com segurança", () => {
    montar();
    const link = screen.getByRole("link", { name: "Consulte no site do INEP" });
    expect(link).toHaveAttribute("href", "https://enem.inep.gov.br/participante/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText(/nunca pede a sua senha do gov.br/)).toBeInTheDocument();
  });

  it("leva ao formulário de prova pelo convite do diagnóstico de verdade", async () => {
    const user = userEvent.setup();
    const { aoIncluirProva } = montar();
    await screen.findByRole("option", { name: "2023" });
    await user.selectOptions(screen.getByLabelText("Ano do Enem"), "2023");
    await user.type(screen.getByLabelText("Matemática"), "640");
    await user.click(screen.getByRole("button", { name: "Ver meu Raio-X" }));
    await user.click(
      await screen.findByRole("button", { name: "Incluir o que marquei numa prova" }),
    );
    expect(aoIncluirProva).toHaveBeenCalled();
  });
});

describe("frasePosicao", () => {
  it("fala em porcentagem sem jargão e cobre o grupo mais baixo e a falta de ranking", () => {
    expect(frasePosicao({ decil: 4, a_frente_de: 30 })).toBe(
      "Você está à frente de pelo menos 30% dos participantes.",
    );
    expect(frasePosicao({ decil: 1, a_frente_de: 0 })).toBe(
      "Você está entre os 10% de menor nota.",
    );
    expect(frasePosicao({ decil: null, a_frente_de: null })).toMatch(/Ainda não temos o ranking/);
  });
});
