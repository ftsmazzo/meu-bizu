import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, type Area, type Usuario } from "../api";
import { estiloArea, nomeDaArea, subtituloDaProva, tituloDaProva } from "../rotulos";
import { Evolucao } from "./Evolucao";

interface Props {
  usuario: Usuario;
  aoIncluir: () => void;
  aoRaioX: () => void;
  aoAbrir: (id: string) => void;
  aoVerFoco: (area: Area) => void;
  aoVerRelatorio: () => void;
}

export function Inicio({
  usuario,
  aoIncluir,
  aoRaioX,
  aoAbrir,
  aoVerFoco,
  aoVerRelatorio,
}: Props) {
  const cliente = useQueryClient();
  const provas = useQuery({ queryKey: ["provas"], queryFn: api.provas });
  const perfil = useQuery({
    queryKey: ["perfil"],
    queryFn: () => api.perfil(null),
  });
  const excluir = useMutation({
    mutationFn: api.excluirProva,
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ["provas"] });
      void cliente.invalidateQueries({ queryKey: ["perfil"] });
    },
  });

  const areas = perfil.data?.areas ?? [];
  const melhor = areas
    .filter((a) => a.ultima !== null)
    .sort((a, b) => (b.ultima as number) - (a.ultima as number))[0];

  return (
    <>
      <section className="hero">
        <h1>Olá, {usuario.nome}</h1>
        <p>Vamos descobrir onde focar nos seus estudos para o próximo Enem?</p>
        <div className="acoes">
          <button type="button" className="claro" onClick={aoRaioX}>
            Fazer o Raio-X pela nota
          </button>
          <button type="button" className="vazado" onClick={aoIncluir}>
            Incluir resultado
          </button>
        </div>
      </section>

      {areas.length > 0 && (
        <div className="stats">
          <div className="stat">
            <strong>{provas.data?.length ?? 0}</strong>
            <span>provas incluídas</span>
          </div>
          <div className="stat">
            <strong>{areas.length}</strong>
            <span>
              {areas.length === 1 ? "área acompanhada" : "áreas acompanhadas"}
            </span>
          </div>
          {melhor && (
            <div className="stat" style={estiloArea(melhor.area)}>
              <strong>{Math.round(melhor.ultima as number)}</strong>
              <span>melhor nota</span>
              <em className="stat-area">{nomeDaArea(melhor.area)}</em>
            </div>
          )}
        </div>
      )}

      {perfil.data && (
        <Evolucao
          areas={areas}
          provas={perfil.data.provas}
          aoVerFoco={aoVerFoco}
        />
      )}
      {areas.length > 0 && (
        <div className="acoes">
          <button type="button" onClick={aoVerRelatorio}>
            Ver relatório completo
          </button>
        </div>
      )}

      <h2>Suas provas</h2>
      {provas.isPending && <p className="carregando">Carregando…</p>}
      {provas.isError && <p className="erro">{provas.error.message}</p>}
      {provas.data?.length === 0 && (
        <p className="vazio">
          Nenhuma prova ainda. Inclua o que você marcou numa prova do Enem para
          ver onde focar, ou faça o Raio-X pela nota.
        </p>
      )}
      <ul className="lista">
        {[...(provas.data ?? [])].reverse().map((p) => (
          <li key={p.id} className="prova" style={estiloArea(p.area)}>
            <span className="prova-sigla" aria-hidden="true">
              {p.area}
            </span>
            <div className="prova-titulo">
              <strong>{nomeDaArea(p.area)}</strong>
              <span className="mudo">{subtituloDaProva(p)}</span>
            </div>
            {p.nota_estimada !== null && (
              <div className="prova-nota">
                <b>{Math.round(p.nota_estimada)}</b>
                <small>nota estimada</small>
              </div>
            )}
            {p.acertos !== null && p.avaliadas !== null ? (
              <div className="prova-acertos">
                <span>
                  <strong>{p.acertos}</strong> de {p.avaliadas} acertos
                </span>
                <div
                  className="trilha"
                  role="img"
                  aria-label={`${p.acertos} de ${p.avaliadas} acertos`}
                >
                  <i style={{ width: `${Math.max(3, (p.acertos / p.avaliadas) * 100)}%` }} />
                </div>
              </div>
            ) : (
              <p className="mudo prova-acertos">Sem correção</p>
            )}
            <div className="prova-acoes">
              <button
                type="button"
                className="ver"
                aria-label={`Ver ${tituloDaProva(p)}`}
                onClick={() => aoAbrir(p.id)}
              >
                Ver
              </button>
              <button
                type="button"
                className="perigo"
                aria-label={`Excluir ${tituloDaProva(p)}`}
                onClick={() =>
                  window.confirm("Excluir esta prova?") && excluir.mutate(p.id)
                }
              >
                Excluir
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
