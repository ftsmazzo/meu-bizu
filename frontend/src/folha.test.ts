import {
  avisos,
  folhaDeTexto,
  folhaEmTexto,
  lerColagem,
  marcaDaTecla,
  resumo,
  type Folha,
} from "./folha";

describe("folhaDeTexto", () => {
  it("abre o texto gravado e volta igual", () => {
    expect(folhaDeTexto("A.*e")).toEqual(["A", ".", "*", "E"]);
    expect(folhaEmTexto(folhaDeTexto("AB.*"))).toBe("AB.*");
  });
});

describe("lerColagem", () => {
  const SEQ = "B.AADCAAAEDCCBBABCDDBCBDBEACBEEBAACADACBBE.AE";

  it("lê o cartão completo e ignora a cor do caderno", () => {
    const c = lerColagem(`2023 · LC · Inglês · AZUL 1201 · ${SEQ}`);
    expect(c).toMatchObject({ ano: 2023, area: "LC", lingua: 0, codigo: 1201 });
    expect(folhaEmTexto(c.folha)).toBe(SEQ);
  });

  it("aceita só a sequência, sem mais nada", () => {
    const c = lerColagem(`  ${SEQ.toLowerCase()}\n`);
    expect(c).toMatchObject({ ano: null, area: null, lingua: null, codigo: null });
    expect(c.folha).toHaveLength(45);
  });

  it("reconhece espanhol e área em qualquer caixa", () => {
    expect(lerColagem("2022 mt 1211 espanhol")).toMatchObject({ area: "MT", lingua: 1 });
  });

  it("sem sequência a folha vem vazia", () => {
    expect(lerColagem("2023 LC AZUL 1201").folha).toEqual([]);
  });
});

describe("marcaDaTecla", () => {
  it("aceita A-E em qualquer caixa, ponto para branco e asterisco para dupla", () => {
    expect(marcaDaTecla("a")).toBe("A");
    expect(marcaDaTecla("E")).toBe("E");
    expect(marcaDaTecla(".")).toBe(".");
    expect(marcaDaTecla("*")).toBe("*");
  });

  it("ignora o resto", () => {
    expect(marcaDaTecla("f")).toBeNull();
    expect(marcaDaTecla("Enter")).toBeNull();
    expect(marcaDaTecla("ab")).toBeNull();
  });
});

describe("resumo", () => {
  it("conta marcadas, brancos, duplas e o que falta", () => {
    const folha: Folha = ["A", ".", "*", null, "C", null];
    expect(resumo(folha)).toEqual({ marcadas: 2, brancos: 1, duplas: 1, faltam: 2 });
  });
});

describe("folhaEmTexto", () => {
  it("junta a folha na ordem", () => {
    expect(folhaEmTexto(["A", ".", "*", "E"])).toBe("A.*E");
  });

  it("recusa folha incompleta", () => {
    expect(() => folhaEmTexto(["A", null])).toThrow(/faltam/);
  });
});

describe("avisos", () => {
  it("avisa quando tudo está em branco", () => {
    expect(avisos(Array(20).fill("."))).toHaveLength(1);
  });

  it("avisa quando quase tudo é a mesma letra", () => {
    const folha: Folha = [...Array(18).fill("C"), "A", "B"];
    expect(avisos(folha)[0]).toMatch(/mesma letra/);
  });

  it("não avisa numa folha variada", () => {
    const folha: Folha = Array.from({ length: 20 }, (_, i) => "ABCDE"[i % 5] as "A");
    expect(avisos(folha)).toEqual([]);
  });

  it("não implica com folhas curtas", () => {
    expect(avisos(["A", "A", "A"])).toEqual([]);
  });
});
