/** A folha de respostas do aluno: uma posição por questão, `null` enquanto não foi preenchida. */

export type Letra = "A" | "B" | "C" | "D" | "E";
export type Marca = Letra | "." | "*"; // "." em branco, "*" dupla marcação
export type Folha = (Marca | null)[];

export const LETRAS: Letra[] = ["A", "B", "C", "D", "E"];

export function marcaDaTecla(tecla: string): Marca | null {
  if (tecla === "." || tecla === "*") return tecla;
  const maiuscula = tecla.toUpperCase();
  return tecla.length === 1 && "ABCDE".includes(maiuscula) ? (maiuscula as Letra) : null;
}

export function resumo(folha: Folha) {
  const contar = (f: (m: Marca | null) => boolean) => folha.filter(f).length;
  return {
    marcadas: contar((m) => m !== null && m !== "." && m !== "*"),
    brancos: contar((m) => m === "."),
    duplas: contar((m) => m === "*"),
    faltam: contar((m) => m === null),
  };
}

export function folhaEmTexto(folha: Folha): string {
  const faltam = resumo(folha).faltam;
  if (faltam > 0) throw new Error(`faltam ${faltam} questões`);
  return folha.join("");
}

/** O inverso de `folhaEmTexto`: abre a folha gravada para o aluno corrigir. */
export function folhaDeTexto(texto: string): Folha {
  return [...texto].map((c) => marcaDaTecla(c));
}

export interface Colagem {
  ano: number | null;
  area: "LC" | "CH" | "CN" | "MT" | null;
  lingua: 0 | 1 | null;
  codigo: number | null;
  folha: Folha;
}

/**
 * Lê um texto colado: só a sequência de respostas ou um cartão completo, como
 * `2023 · LC · Inglês · AZUL 1201 · B.AADC...`. O que não for reconhecido
 * (cor do caderno, pontuação, palavras soltas) é ignorado. Sem sequência, `folha` vem vazia.
 */
export function lerColagem(texto: string): Colagem {
  const colagem: Colagem = { ano: null, area: null, lingua: null, codigo: null, folha: [] };
  const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const t of texto.split(/[\s·|;,/]+/).filter(Boolean)) {
    if (/^[A-Ea-e.*]{20,}$/.test(t)) {
      if (colagem.folha.length === 0) colagem.folha = folhaDeTexto(t);
    } else if (/^20\d\d$/.test(t) && colagem.ano === null) {
      colagem.ano = Number(t);
    } else if (/^\d{3,4}$/.test(t)) {
      colagem.codigo = Number(t);
    } else if (/^(LC|CH|CN|MT)$/i.test(t)) {
      colagem.area = t.toUpperCase() as Colagem["area"];
    } else if (/^(linguagens|humanas|natureza|matematica)$/.test(sem(t))) {
      colagem.area = ({ l: "LC", h: "CH", n: "CN", m: "MT" } as const)[sem(t)[0] as "l"];
    } else if (/^(ingles|ing)$/.test(sem(t))) {
      colagem.lingua = 0;
    } else if (/^(espanhol|esp)$/.test(sem(t))) {
      colagem.lingua = 1;
    }
  }
  return colagem;
}

/** Sinais de que a folha foi preenchida errado (não impedem gravar, só pedem conferência). */
export function avisos(folha: Folha): string[] {
  const { marcadas, brancos } = resumo(folha);
  if (folha.length > 0 && brancos === folha.length) {
    return ["Todas as questões estão em branco. Confira se era isso mesmo."];
  }
  if (marcadas >= 10) {
    const maior = Math.max(...LETRAS.map((l) => folha.filter((m) => m === l).length));
    if (maior / marcadas >= 0.9) {
      return ["Quase tudo está na mesma letra. Confira se você não marcou sem querer."];
    }
  }
  return [];
}
