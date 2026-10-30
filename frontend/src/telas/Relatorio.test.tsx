import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Relatorio } from "./Relatorio";

function montar(area: "MT" | null) {
  const cliente = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <Relatorio area={area} aoVoltar={vi.fn()} />
    </QueryClientProvider>,
  );
}

function responder(corpo: unknown, status = 200) {
  const fetchFalso = vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
  vi.stubGlobal("fetch", fetchFalso);
  return fetchFalso;
}

describe("Relatorio", () => {
  it("só pede o relatório quando o aluno clica, e mostra o texto", async () => {
    const fetchFalso = responder({ texto: "Em Matemática sua nota é 612.", origem: "ia" });
    montar("MT");
    expect(fetchFalso).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Gerar relatório" }));
    expect(await screen.findByText("Em Matemática sua nota é 612.")).toBeInTheDocument();
    expect(fetchFalso).toHaveBeenCalledWith(
      "/relatorio?area=MT",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.queryByText(/sem a IA/)).not.toBeInTheDocument();
  });

  it("avisa quando o texto foi montado sem a IA", async () => {
    responder({ texto: "Texto padrão.", origem: "padrao" });
    montar(null);
    await userEvent.setup().click(screen.getByRole("button", { name: "Gerar relatório" }));
    expect(await screen.findByText(/montado automaticamente, sem a IA/)).toBeInTheDocument();
  });

  it("mostra o erro da API", async () => {
    responder({ detail: "Inclua uma prova antes de pedir o relatório." }, 409);
    montar(null);
    await userEvent.setup().click(screen.getByRole("button", { name: "Gerar relatório" }));
    expect(await screen.findByText(/Inclua uma prova antes/)).toBeInTheDocument();
  });
});
