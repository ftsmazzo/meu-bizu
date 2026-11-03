/** Gráficos pequenos em SVG/HTML, sem biblioteca. A cor vem de `--cor-area` (veja `estiloArea`). */

const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Anel com a nota no meio (a escala prática do Enem vai de 200 a 1000). */
export function Anel(props: {
  valor: number;
  rotulo: string;
  tamanho?: number;
}) {
  const raio = 38;
  const volta = 2 * Math.PI * raio;
  const fracao = clamp((props.valor - 200) / 800);
  return (
    <svg
      className="anel"
      width={props.tamanho ?? 92}
      height={props.tamanho ?? 92}
      viewBox="0 0 100 100"
      role="img"
      aria-label={props.rotulo}
    >
      <circle
        className="trilho"
        cx="50"
        cy="50"
        r={raio}
        fill="none"
        strokeWidth="10"
      />
      <circle
        className="valor"
        cx="50"
        cy="50"
        r={raio}
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={volta}
        strokeDashoffset={volta * (1 - fracao)}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="58" textAnchor="middle" fontSize="26">
        {Math.round(props.valor)}
      </text>
    </svg>
  );
}

/** Dez grupos de participantes, do de menor nota ao de maior; o seu fica em destaque. */
export function BarraGrupos({ grupo }: { grupo: number }) {
  return (
    <div>
      <div
        className="grupos"
        role="img"
        aria-label={`Você está no grupo ${grupo} de 10`}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={i + 1 === grupo ? "aqui" : i + 1 < grupo ? "cheio" : ""}
          />
        ))}
      </div>
      <div className="grupos-legenda">
        <span>menores notas</span>
        <span>maiores notas</span>
      </div>
    </div>
  );
}

/** Quantas questões são seguras, estão ao alcance ou são difíceis para esta nota. */
export function BarraFaixas(props: {
  seguras: number;
  alcance: number;
  dificeis: number;
}) {
  const itens = [
    {
      chave: "seguras",
      n: props.seguras,
      texto: "Seguras",
      cor: "var(--marca)",
    },
    {
      chave: "alcance",
      n: props.alcance,
      texto: "Ao seu alcance",
      cor: "#f2b01e",
    },
    {
      chave: "dificeis",
      n: props.dificeis,
      texto: "Difíceis por ora",
      cor: "var(--mudo)",
    },
  ];
  return (
    <>
      <div
        className="faixas"
        role="img"
        aria-label={itens.map((i) => `${i.texto}: ${i.n}`).join(", ")}
      >
        {itens.map((i) => (
          <span key={i.chave} style={{ flex: i.n }} />
        ))}
      </div>
      <div className="legenda">
        {itens.map((i) => (
          <span key={i.chave}>
            <i style={{ background: i.cor }} />
            {i.texto}: <strong>{i.n}</strong>
          </span>
        ))}
      </div>
    </>
  );
}

/** Uma linha do ranking: quanto da população do local a nota supera, pelo menos. */
export function BarraPosicao(props: { rotulo: string; aFrenteDe: number; n: number }) {
  const texto =
    props.aFrenteDe === 0
      ? "entre os 5% de menor nota"
      : `à frente de pelo menos ${props.aFrenteDe}%`;
  return (
    <li className="rank">
      <div className="rotulo">
        <span>{props.rotulo}</span>
        <b>{texto}</b>
      </div>
      <div className="trilha" aria-hidden="true">
        <i style={{ width: `${Math.max(3, props.aFrenteDe)}%` }} />
      </div>
      <small>{props.n.toLocaleString("pt-BR")} participantes</small>
    </li>
  );
}

export interface ItemBarra {
  chave: string;
  rotulo: string;
  valor: number;
  texto: string;
  detalhe?: string;
}

/** Barras horizontais proporcionais ao maior valor. */
export function BarrasGanho({ itens }: { itens: ItemBarra[] }) {
  const maior = Math.max(...itens.map((i) => i.valor), 0.0001);
  return (
    <ul className="barras">
      {itens.map((i) => (
        <li key={i.chave}>
          <div className="rotulo">
            <span>{i.rotulo}</span>
            <b>{i.texto}</b>
          </div>
          {i.detalhe && <small>{i.detalhe}</small>}
          <div className="trilha" aria-hidden="true">
            <i style={{ width: `${Math.max(4, (i.valor / maior) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Linha da evolução. Com um ponto só, mostra o ponto. */
export function Sparkline({
  pontos,
  rotulo,
}: {
  pontos: number[];
  rotulo: string;
}) {
  if (pontos.length === 0) return null;
  const menor = Math.min(...pontos);
  const maior = Math.max(...pontos);
  const faixa = Math.max(maior - menor, 1);
  const xy = pontos.map((p, i) => [
    pontos.length === 1 ? 50 : 4 + (i * 92) / (pontos.length - 1),
    34 - ((p - menor) / faixa) * 28,
  ]);
  const ultimo = xy[xy.length - 1];
  return (
    <svg
      className="sparkline"
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      role="img"
      aria-label={rotulo}
    >
      {xy.length > 1 && (
        <polyline
          points={xy.map((p) => p.join(",")).join(" ")}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path className="fim" d={`M${ultimo[0]} ${ultimo[1]}h0`} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
