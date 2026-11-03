import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RaioX } from "./RaioX";
import { frasePosicao } from "./RaioXPainel";

const MT = {
  area: "MT",
  nota: 640,
  brasil: { nome: "Brasil", a_frente_de: 70, n: 1000000 },
  uf: { nome: "SP", a_frente_de: 65, n: 150000 },
  municipio: { nome: "São Paulo", a_frente_de: 60, n: 30000 },
  decil: 8,
  a_frente_de: 70,
  alvo: 690,
  total: 45,
  esperado: 19.8,
  faixas: { seguras: 9, alcance: 11, dificeis: 25 },
  foco: [
    {
      habilidade: 12,
      descricao: "Medidas de grandezas",
      n: 2,
      esperado: 0.8,
      alvo: 1.3,
      ganho: 0.5,
      seus_acertos: null,
      seus_de: null,
    },
  ],
  sua_prova: null,
  alcance: [
    {
      habilidade: 5,
      descricao: "Números",
      chance: 62,
      resultado: null,
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
let provasGravadas: unknown[] = [];
let areaDoMock: unknown = MT;
let pedidosSalvos: unknown[] = [];

beforeEach(() => {
  corpos = [];
  provasGravadas = [];
  areaDoMock = MT;
  pedidosSalvos = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/anos") return new Response(JSON.stringify([2022, 2023]));
      if (url === "/provas") return new Response(JSON.stringify(provasGravadas));
      if (url === "/raio-x/salvos") return new Response(JSON.stringify(pedidosSalvos));
      if (url === "/geo/ufs?ano=2023") {
        return new Response(JSON.stringify([{ uf: "RJ", n: 90000 }, { uf: "SP", n: 150000 }]));
      }
      if (url === "/geo/municipios?ano=2023&uf=SP") {
        return new Response(
          JSON.stringify([{ codigo: "3550308", nome: "São Paulo", n: 30000 }]),
        );
      }
      if (url === "/raio-x") {
        corpos.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ ano: 2023, areas: [areaDoMock] }));
      }
      return new Response("{}", { status: 404 });
    }),
  );
});

function montar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const aoIncluirProva = vi.fn();
  const aoVerDiagnostico = vi.fn();
  render(
    <QueryClientProvider client={cliente}>
      <RaioX
        aoVoltar={vi.fn()}
        aoIncluirProva={aoIncluirProva}
        aoVerDiagnostico={aoVerDiagnostico}
      />
    </QueryClientProvider>,
  );
  return { aoIncluirProva, aoVerDiagnostico };
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

    expect(corpos).toEqual([
      { ano: 2023, notas: { MT: 640.5 }, lingua: null, uf: null, municipio: null },
    ]);
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

  it("escolhe estado e município, manda os códigos e mostra o ranking de cada local", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByRole("option", { name: "2023" });
    await user.selectOptions(screen.getByLabelText("Ano do Enem"), "2023");
    await screen.findByRole("option", { name: "SP" });
    await user.selectOptions(screen.getByLabelText(/Estado onde você fez a prova/), "SP");
    await screen.findByRole("option", { name: "São Paulo" });
    await user.selectOptions(screen.getByLabelText(/Município da prova/), "3550308");
    await user.type(screen.getByLabelText("Matemática"), "640");
    await user.click(screen.getByRole("button", { name: "Ver meu Raio-X" }));

    expect(corpos).toEqual([
      { ano: 2023, notas: { MT: 640 }, lingua: null, uf: "SP", municipio: "3550308" },
    ]);
    const ranking = (await screen.findByRole("heading", { name: "Seu ranking" })).closest(
      "section",
    ) as HTMLElement;
    expect(within(ranking).getByText("Brasil")).toBeInTheDocument();
    expect(within(ranking).getByText("SP")).toBeInTheDocument();
    expect(within(ranking).getByText("São Paulo")).toBeInTheDocument();
    expect(within(ranking).getByText("à frente de pelo menos 65%")).toBeInTheDocument();
    expect(within(ranking).getByText(/150\.000 participantes/)).toBeInTheDocument();
  });

  it("não pede senha do gov.br e abre o INEP em outra aba com segurança", () => {
    montar();
    const link = screen.getByRole("link", { name: "Consulte no site do INEP" });
    expect(link).toHaveAttribute("href", "https://enem.inep.gov.br/participante/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getByText(/nunca pede a sua senha do gov.br/)).toBeInTheDocument();
  });

  it("puxa as provas já incluídas: preenche a nota e leva ao diagnóstico em vez de pedir de novo", async () => {
    provasGravadas = [
      { id: "p1", ano: 2023, area: "MT", nota: null, nota_estimada: 612.44, lingua: null },
      { id: "p2", ano: 2022, area: "MT", nota: 500, nota_estimada: 480, lingua: null },
    ];
    const user = userEvent.setup();
    const { aoVerDiagnostico } = montar();
    await screen.findByRole("option", { name: "2023" });
    expect(
      screen.queryByRole("button", { name: /Preencher com as minhas provas/ }),
    ).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Ano do Enem"), "2023");
    await user.click(
      await screen.findByRole("button", { name: "Preencher com as minhas provas de 2023" }),
    );
    expect(screen.getByLabelText("Matemática")).toHaveValue("612,4"); // só a prova de 2023

    await user.click(screen.getByRole("button", { name: "Ver meu Raio-X" }));
    expect(
      await screen.findByRole("heading", { name: "Seu diagnóstico de verdade já está pronto" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Incluir o que marquei numa prova" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver onde errei em Matemática" }));
    expect(aoVerDiagnostico).toHaveBeenCalledWith("MT");
  });

  it("cruza com a prova incluída: esperado contra real, pontos que escaparam e resultado por questão", async () => {
    const enunciado = {
      introducao: null,
      enunciado: "Quanto é 3+3?",
      alternativas: { A: "seis", B: "sete" },
      imagens: [],
    };
    areaDoMock = {
      ...MT,
      foco: [{ ...MT.foco[0], seus_acertos: 1, seus_de: 2 }],
      alcance: [{ ...MT.alcance[0], resultado: "errou" }],
      sua_prova: {
        acertos: 23,
        avaliadas: 45,
        esperado: 19.8,
        leitura: "acima",
        perdidas_total: 3,
        perdidas: [
          { habilidade: 9, descricao: "Contagem", chance: 88, resultado: "em_branco", questao: enunciado },
        ],
      },
    };
    const user = userEvent.setup();
    montar();
    await screen.findByRole("option", { name: "2023" });
    await user.selectOptions(screen.getByLabelText("Ano do Enem"), "2023");
    await user.type(screen.getByLabelText("Matemática"), "640");
    await user.click(screen.getByRole("button", { name: "Ver meu Raio-X" }));

    expect(await screen.findByText(/23 de 45/)).toBeInTheDocument();
    expect(screen.getByText(/acima do esperado para a sua nota/)).toBeInTheDocument();
    const alcance = screen.getByText(/62% de chance/).closest("li") as HTMLElement;
    expect(within(alcance).getByText("Você errou")).toBeInTheDocument();
    expect(screen.getByText(/Na sua prova: 1 de 2/)).toBeInTheDocument();

    const perdidas = (await screen.findByRole("heading", { name: "Pontos que escaparam" })).closest(
      "section",
    ) as HTMLElement;
    expect(within(perdidas).getByText("88% de quem tem a sua nota acerta")).toBeInTheDocument();
    expect(within(perdidas).getByText("Você deixou em branco")).toBeInTheDocument();
    expect(within(perdidas).getByText("Quanto é 3+3?")).toBeInTheDocument();
    expect(within(perdidas).getByText(/E mais 2 questões desse tipo/)).toBeInTheDocument();
  });

  it("reabre sozinho o último Raio-X guardado e volta ao formulário já preenchido", async () => {
    pedidosSalvos = [
      {
        ano: 2023,
        notas: { MT: 640 },
        lingua: null,
        uf: null,
        municipio: null,
        atualizado_em: "2026-11-03T12:00:00Z",
      },
    ];
    const user = userEvent.setup();
    montar();

    expect(
      await screen.findByRole("heading", { name: "Seu Raio-X do Enem 2023" }),
    ).toBeInTheDocument();
    // refeito com o pedido guardado, sem o carimbo de data
    expect(corpos).toEqual([
      { ano: 2023, notas: { MT: 640 }, lingua: null, uf: null, municipio: null },
    ]);

    await user.click(screen.getByRole("button", { name: "Refazer com outras notas" }));
    expect(screen.getByLabelText("Matemática")).toHaveValue("640");
    expect(screen.getByLabelText("Ano do Enem")).toHaveValue("2023");
    expect(corpos).toHaveLength(1); // voltar ao formulário não gera outro
  });

  it("sem Raio-X guardado abre o formulário vazio e gerar um não reabre nada depois", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByRole("option", { name: "2023" });
    expect(screen.getByRole("button", { name: "Ver meu Raio-X" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Ano do Enem"), "2023");
    await user.type(screen.getByLabelText("Matemática"), "640");
    pedidosSalvos = [{ ano: 2023, notas: { MT: 640 }, lingua: null, uf: null, municipio: null }];
    await user.click(screen.getByRole("button", { name: "Ver meu Raio-X" }));
    await screen.findByRole("heading", { name: "Seu Raio-X do Enem 2023" });
    await user.click(screen.getByRole("button", { name: "Refazer com outras notas" }));
    expect(screen.getByRole("button", { name: "Ver meu Raio-X" })).toBeInTheDocument();
    expect(corpos).toHaveLength(1);
  });

  it("não mostra pontos que escaparam quando não há prova incluída", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByRole("option", { name: "2023" });
    await user.selectOptions(screen.getByLabelText("Ano do Enem"), "2023");
    await user.type(screen.getByLabelText("Matemática"), "640");
    await user.click(screen.getByRole("button", { name: "Ver meu Raio-X" }));
    await screen.findByRole("heading", { name: "Seu Raio-X do Enem 2023" });
    expect(screen.queryByRole("heading", { name: "Pontos que escaparam" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Na sua prova/)).not.toBeInTheDocument();
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
