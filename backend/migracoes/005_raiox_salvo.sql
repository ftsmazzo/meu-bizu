-- Último pedido de Raio-X de cada aluno, por ano. Guarda o PEDIDO (ano, notas, língua, estado e
-- município), não o resultado: ao reabrir, o Raio-X é refeito e já sai cruzado com as provas mais
-- recentes. Uma linha por (aluno, ano); gerar de novo no mesmo ano substitui a anterior.
create table app.raiox_salvo (
    usuario_id uuid not null references app.usuario (id) on delete cascade,
    ano smallint not null,
    pedido jsonb not null,
    atualizado_em timestamptz not null default now(),
    primary key (usuario_id, ano)
);

alter table app.raiox_salvo enable row level security;
alter table app.raiox_salvo force row level security;
create policy raiox_salvo_do_dono on app.raiox_salvo
    using (usuario_id = nullif(current_setting('app.usuario_id', true), '')::uuid)
    with check (usuario_id = nullif(current_setting('app.usuario_id', true), '')::uuid);

grant select, insert, update, delete on app.raiox_salvo to meubizu_app;
