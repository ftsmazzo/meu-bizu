import { useQuery } from "@tanstack/react-query";

import { api, type Area } from "../api";
import { nomeDaArea } from "../rotulos";
import { ListaHabilidades } from "./Habilidades";

/** Onde focar numa área, juntando todas as provas dela. */
export function PerfilPorArea(props: {
  area: Area;
  aoVoltar: () => void;
  aoVerRelatorio: () => void;
}) {
  const perfil = useQuery({ queryKey: ["perfil"], queryFn: () => api.perfil(null) });
  const habilidades = perfil.data?.habilidades.filter((h) => h.area === props.area) ?? [];
  const provas = perfil.data?.areas.find((a) => a.area === props.area)?.provas ?? 0;

  return (
    <>
      <button type="button" className="link" onClick={props.aoVoltar}>
        ← Voltar
      </button>
      <h1>Onde focar em {nomeDaArea(props.area)}</h1>
      {perfil.isPending && <p className="carregando">Carregando…</p>}
      {perfil.isError && <p className="erro">{perfil.error.message}</p>}
      {perfil.data && (
        <>
          <p className="mudo">
            {provas === 1
              ? "Com uma prova só, cada habilidade tem poucas questões."
              : `Juntamos as suas ${provas} provas, então o diagnóstico fica mais firme.`}
          </p>
          {habilidades.length === 0 ? (
            <p className="vazio">Ainda não há habilidades para mostrar nesta área.</p>
          ) : (
            <ListaHabilidades habilidades={habilidades} />
          )}
          <button type="button" className="primario" onClick={props.aoVerRelatorio}>
            Relatório desta área
          </button>
        </>
      )}
    </>
  );
}
