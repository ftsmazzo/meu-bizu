import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";

import type { Resultado } from "../api";
import { Incluir } from "./Incluir";

const QUESTOES = [1, 2, 3].map((numero) => ({
  numero,
  introducao: null,
  enunciado: `Enunciado ${numero}`,
  alternativas: { A: "um", B: "dois", C: "tres", D: "quatro", E: "cinco" },
  imagens: [],
  tem_texto: true,
}));

const CADERNOS = [
  {
    co_prova: 1211,
    cor: "AZUL",
    rotulo: "AZUL (código 1211)",
    referencia: "decil",
    selecionavel: true,
    motivo: "",
  },
  {
    co_prova: 1218,
    cor: "LARANJA",
    rotulo: "LARANJA (código 1218)",
    referencia: "decil",
    selecionavel: false,
    motivo: "caderno adaptado",
  },
];

const RESULTADO = { id: "p1", ano: 2023, area: "MT", co_prova: 1211, habilidades: [] };

let chamadas: { url: string; metodo: string; corpo: unknown }[] = [];

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status });
}

beforeEach(() => {
  chamadas = [];
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const metodo = init?.method ?? "GET";
      chamadas.push({ url, metodo, corpo: init?.body ? JSON.parse(String(init.body)) : null });
      if (url === "/anos") return resposta([2022, 2023]);
      if (url === "/anos/2023/areas/MT/cadernos") return resposta(CADERNOS);
      if (url.startsWith("/cadernos/1211/questoes")) return resposta(QUESTOES);
      if (url === "/provas" && metodo === "POST") return resposta(RESULTADO, 201);
      if (url === "/provas/p1" && metodo === "PUT") return resposta(RESULTADO);
      return resposta({ detail: "não encontrado" }, 404);
    }),
  );
});

function montar(ui: ReactElement) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={cliente}>{ui}</QueryClientProvider>);
}

async function escolherProva(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: "2023" }); // as opções vêm da API
  await user.selectOptions(screen.getByLabelText("Ano da prova"), "2023");
  await user.selectOptions(screen.getByLabelText("Área"), "MT");
  await user.selectOptions(await screen.findByLabelText(/Caderno/), "1211");
}

describe("Incluir resultado", () => {
  it("leva do seletor à gravação, mandando a folha na ordem", async () => {
    const user = userEvent.setup();
    const aoGravar = vi.fn();
    montar(<Incluir aoVoltar={vi.fn()} aoGravar={aoGravar} />);

    await escolherProva(user);
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const grade = await screen.findByRole("group", { name: "Respostas" });
    grade.focus();
    await user.keyboard("ab.");
    await user.click(screen.getByRole("button", { name: "Conferir" }));

    expect(screen.getByText(/Marcadas: 2/)).toBeInTheDocument();
    expect(screen.getByText(/Em branco: 1/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Gravar resultado" }));

    const envio = chamadas.find((c) => c.metodo === "POST");
    expect(envio?.corpo).toEqual({
      ano: 2023,
      area: "MT",
      co_prova: 1211,
      lingua: null,
      tipo: "enem",
      feita_em: null,
      nota: null,
      folha: "AB.",
    });
    expect(aoGravar).toHaveBeenCalledWith("p1");
  });

  it("não deixa escolher caderno adaptado e só continua com a prova escolhida", async () => {
    const user = userEvent.setup();
    montar(<Incluir aoVoltar={vi.fn()} aoGravar={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Continuar" })).toBeDisabled();
    await screen.findByRole("option", { name: "2023" });
    await user.selectOptions(screen.getByLabelText("Ano da prova"), "2023");
    await user.selectOptions(screen.getByLabelText("Área"), "MT");
    expect(await screen.findByRole("option", { name: /1218/ })).toBeDisabled();
  });

  it("não grava com questões sem resposta até marcar o resto em branco", async () => {
    const user = userEvent.setup();
    montar(<Incluir aoVoltar={vi.fn()} aoGravar={vi.fn()} />);
    await escolherProva(user);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(await screen.findByRole("button", { name: "Questão 1, alternativa C" }));
    await user.click(screen.getByRole("button", { name: "Conferir" }));

    expect(screen.getByRole("button", { name: "Gravar resultado" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Marcar o que falta como em branco" }));
    expect(screen.getByRole("button", { name: "Gravar resultado" })).toBeEnabled();
    expect(screen.getByText(/Em branco: 2/)).toBeInTheDocument();
  });

  it("pede a data quando é simulado e manda a data", async () => {
    const user = userEvent.setup();
    montar(<Incluir aoVoltar={vi.fn()} aoGravar={vi.fn()} />);
    await escolherProva(user);
    await user.click(screen.getByLabelText("Refiz como simulado"));
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    await user.type(screen.getByLabelText("Data em que você fez"), "2026-03-10");
    await user.type(screen.getByLabelText(/Nota/), "612,5");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(await screen.findByRole("button", { name: "Conferir" }));
    await user.click(screen.getByRole("button", { name: "Marcar o que falta como em branco" }));
    await user.click(screen.getByRole("button", { name: "Gravar resultado" }));

    const envio = chamadas.find((c) => c.metodo === "POST")?.corpo as Record<string, unknown>;
    expect(envio).toMatchObject({ tipo: "simulado", feita_em: "2026-03-10", nota: 612.5 });
  });

  it("corrige uma prova gravada: abre preenchida, manda PUT e não mexe no rascunho", async () => {
    const user = userEvent.setup();
    const aoGravar = vi.fn();
    const gravada = {
      ...RESULTADO,
      lingua: null,
      tipo: "enem",
      feita_em: null,
      nota: 612.5,
      folha: "AB.",
    } as unknown as Resultado;
    montar(<Incluir edicao={gravada} aoVoltar={vi.fn()} aoGravar={aoGravar} />);

    expect(screen.getByRole("heading", { name: "Corrigir prova" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Caderno/)).toHaveValue("1211"));
    expect(screen.getByLabelText(/Nota/)).toHaveValue("612,5");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    const grade = await screen.findByRole("group", { name: "Respostas" });
    expect(within(grade).getByRole("button", { name: "Questão 2, alternativa B" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(within(grade).getByRole("button", { name: "Questão 3, alternativa C" }));
    await user.click(screen.getByRole("button", { name: "Conferir" }));
    await user.click(screen.getByRole("button", { name: "Salvar correção" }));

    const envio = chamadas.find((c) => c.metodo === "PUT");
    expect(envio?.corpo).toMatchObject({ co_prova: 1211, nota: 612.5, folha: "ABC" });
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
    expect(aoGravar).toHaveBeenCalledWith("p1");
    expect(localStorage.getItem("bizu:rascunho")).toBeNull();
  });

  it("guarda o rascunho no navegador e retoma de onde parou", async () => {
    const user = userEvent.setup();
    const primeira = montar(<Incluir aoVoltar={vi.fn()} aoGravar={vi.fn()} />);
    await escolherProva(user);
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(await screen.findByRole("button", { name: "Questão 2, alternativa D" }));
    primeira.unmount();

    montar(<Incluir aoVoltar={vi.fn()} aoGravar={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText(/Caderno/)).toHaveValue("1211"));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    const grade = await screen.findByRole("group", { name: "Respostas" });
    expect(within(grade).getByRole("button", { name: "Questão 2, alternativa D" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
