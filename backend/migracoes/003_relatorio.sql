-- Relatório por IA já gerado, para não pagar duas vezes pelo mesmo conjunto de fatos.
-- `impressao` é o hash dos números enviados à IA: se o perfil muda, o hash muda e o texto é refeito.
create table app.relatorio (
    usuario_id uuid not null references app.usuario (id) on delete cascade,
    chave text not null check (chave in ('todas', 'LC', 'CH', 'CN', 'MT')),
    impressao text not null,
    texto text not null,
    criado_em timestamptz not null default now(),
    primary key (usuario_id, chave)
);

alter table app.relatorio enable row level security;
alter table app.relatorio force row level security;
create policy relatorio_do_dono on app.relatorio
    using (usuario_id = nullif(current_setting('app.usuario_id', true), '')::uuid)
    with check (usuario_id = nullif(current_setting('app.usuario_id', true), '')::uuid);

grant select, insert, update, delete on app.relatorio to meubizu_app;
