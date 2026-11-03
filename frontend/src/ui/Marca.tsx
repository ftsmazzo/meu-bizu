import type { ReactNode } from "react";

/** O ícone do Meu Bizu: um alvo com um ponto de foco. */
export function Icone({ tamanho = 20 }: { tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function Marca() {
  return (
    <span className="marca">
      <span className="marca-icone">
        <Icone />
      </span>
      Meu Bizu
    </span>
  );
}

/** Barra de cima das telas de quem está logado. */
export function Barra({ children }: { children?: ReactNode }) {
  return (
    <header className="barra">
      <Marca />
      {children}
    </header>
  );
}
