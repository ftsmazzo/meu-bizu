import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { frasePontos } from "../rotulos";
import { Evolucao } from "./Evolucao";

describe("frasePontos", () => {
  it("diz se subiu, caiu ou ficou igual, sem casas decimais", () => {
    expect(frasePontos(34.4)).toBe("Subiu 34 pontos desde a prova anterior");
    expect(frasePontos(-12.6)).toBe("Caiu 13 pontos desde a prova anterior");
    expect(frasePontos(1)).toBe("Subiu 1 ponto desde a prova anterior");
    expect(frasePontos(0.2)).toBe("Ficou igual à prova anterior");
  });
});

describe("Evolucao", () => {
  const areas = [
    { area: "MT", provas: 2, ultima: 612.4, anterior: 578.1, variacao: 34.3 },
    { area: "LC", provas: 1, ultima: 540, anterior: null, variacao: null },
    { area: "CH", provas: 1, ultima: null, anterior: null, variacao: null },
  ] as const;

  it("mostra a nota e a variação por área, e pede outra prova quando só há uma", () => {
    render(<Evolucao areas={[...areas]} aoVerFoco={vi.fn()} />);
    expect(screen.getByText("Matemática")).toBeInTheDocument();
    expect(screen.getByText("612")).toBeInTheDocument();
    expect(screen.getByText("Subiu 34 pontos desde a prova anterior")).toBeInTheDocument();
    expect(screen.getAllByText(/Inclua mais uma prova desta área/)).toHaveLength(2);
    expect(screen.getByText("Sem nota estimada")).toBeInTheDocument();
  });

  it("abre o foco da área escolhida", async () => {
    const aoVerFoco = vi.fn();
    render(<Evolucao areas={[...areas]} aoVerFoco={aoVerFoco} />);
    await userEvent.setup().click(screen.getAllByRole("button", { name: "Onde focar" })[0]);
    expect(aoVerFoco).toHaveBeenCalledWith("MT");
  });

  it("não mostra nada sem provas", () => {
    const { container } = render(<Evolucao areas={[]} aoVerFoco={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
