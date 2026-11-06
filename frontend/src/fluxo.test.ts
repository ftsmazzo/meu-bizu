import { describe, expect, it, vi } from "vitest";

import type { RaioX, Resultado } from "./api";
import { executarAnalise, lerSequencia, type EntradaAnalise } from "./fluxo";

const entrada: EntradaAnalise = {
  ano: 2023,
  notas: { MT: 650 },
  lingua: null,
  uf: "AL",
  municipio: "2704302",
  provas: [{ area: "MT", co_prova: 1227, folha: "ABCDE", total: 5 }],
};
const resultado = { id: "prova-1", area: "MT", nota_estimada: 610 } as Resultado;
const raioX = { ano: 2023, areas: [] } as RaioX;

describe("análise guiada com a API real", () => {
  it("grava e corrige as respostas antes de gerar o Raio-X com a localização", async () => {
    const ordem: string[] = [];
    const gravarProva = vi.fn(async () => { ordem.push("prova"); return resultado; });
    const gerar = vi.fn(async () => { ordem.push("raiox"); return raioX; });
    const r = await executarAnalise(entrada, { gravarProva, raioX: gerar }, new Map(), () => {});
    expect(ordem).toEqual(["prova", "raiox"]);
    expect(gravarProva).toHaveBeenCalledWith(expect.objectContaining({ ano: 2023, area: "MT", nota: 650, folha: "ABCDE", tipo: "enem" }));
    expect(gerar).toHaveBeenCalledWith({ ano: 2023, notas: { MT: 650 }, lingua: null, uf: "AL", municipio: "2704302" });
    expect(r.provas[0].id).toBe("prova-1");
  });

  it("permite gerar comparativos só pela nota, sem fabricar respostas", async () => {
    const gravarProva = vi.fn();
    const gerar = vi.fn(async () => raioX);
    await executarAnalise({ ...entrada, provas: [] }, { gravarProva, raioX: gerar }, new Map(), () => {});
    expect(gravarProva).not.toHaveBeenCalled();
    expect(gerar).toHaveBeenCalledOnce();
  });

  it("usa estimativa identificada apenas quando não há nota informada", async () => {
    const gerar = vi.fn(async () => raioX);
    const r = await executarAnalise({ ...entrada, notas: {} }, { gravarProva: vi.fn(async () => resultado), raioX: gerar }, new Map(), () => {});
    expect(r.estimadas).toEqual(["MT"]);
    expect(gerar).toHaveBeenCalledWith(expect.objectContaining({ notas: { MT: 610 } }));
  });

  it("não grava de novo uma prova já corrigida quando o Raio-X falha e é repetido", async () => {
    const cache = new Map<string, Resultado>();
    const gravarProva = vi.fn(async () => resultado);
    const gerar = vi.fn().mockRejectedValueOnce(new Error("sem rede")).mockResolvedValueOnce(raioX);
    await expect(executarAnalise(entrada, { gravarProva, raioX: gerar }, cache, () => {})).rejects.toThrow("sem rede");
    await executarAnalise(entrada, { gravarProva, raioX: gerar }, cache, () => {});
    expect(gravarProva).toHaveBeenCalledOnce();
  });

  it("não envia prova incompleta, caderno ausente ou notas inválidas", async () => {
    const api = { gravarProva: vi.fn(), raioX: vi.fn() };
    for (const invalid of [
      { ...entrada, provas: [{ ...entrada.provas[0], folha: "AB" }] },
      { ...entrada, provas: [{ ...entrada.provas[0], co_prova: 0 }] },
      { ...entrada, notas: { MT: Number.NaN } },
      { ...entrada, notas: { MT: 1001 } },
      { ...entrada, notas: {}, provas: [] },
    ]) await expect(executarAnalise(invalid as EntradaAnalise, api, new Map(), () => {})).rejects.toThrow();
    expect(api.gravarProva).not.toHaveBeenCalled();
    expect(api.raioX).not.toHaveBeenCalled();
  });

  it("exige língua para Linguagens e não transforma estimativa ausente em zero", async () => {
    const api = { gravarProva: vi.fn(async () => ({ ...resultado, nota_estimada: null })), raioX: vi.fn() };
    await expect(executarAnalise({ ...entrada, notas: { LC: 600 }, provas: [] }, api, new Map(), () => {})).rejects.toThrow("língua");
    await expect(executarAnalise({ ...entrada, notas: {} }, api, new Map(), () => {})).rejects.toThrow("nota");
    expect(api.raioX).not.toHaveBeenCalled();
  });
});

describe("sequência digitada pelo aluno", () => {
  it("aceita letras, brancos e dupla marcação com separadores", () => {
    expect(lerSequencia("a b\nC;D,E.*", 7)).toEqual(["A", "B", "C", "D", "E", ".", "*"]);
  });
  it("rejeita símbolos desconhecidos e quantidade incorreta sem completar respostas", () => {
    expect(() => lerSequencia("ABXDE", 5)).toThrow();
    expect(() => lerSequencia("ABCDE", 45)).toThrow("45");
  });
});

