-- Dados do aluno (schema `app`), com isolamento por usuário (RLS).
--
-- Papel de execução `meubizu_app`: sem privilégios de dono e sem BYPASSRLS. É o que a API usa em
-- runtime (APP_DATABASE_URL). O login e a senha dele são definidos fora do repositório:
--   alter role meubizu_app login password '...';
-- O dono do schema (DATABASE_URL) serve só para migrar.
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'meubizu_app') then
        create role meubizu_app nologin;
    end if;
end $$;

create schema app;

-- usuario e sessao não têm nenhum privilégio para meubizu_app: o acesso é só pelas funções
-- security definer mais abaixo, que cobrem o que acontece antes de haver usuário identificado.
create table app.usuario (
    id uuid primary key default gen_random_uuid(),
    email text not null unique check (email = lower(email)),
    nome text not null,
    senha_hash text not null,
    maior_de_18 boolean not null check (maior_de_18),
    criado_em timestamptz not null default now()
);

create table app.sessao (
    token_hash text primary key,
    usuario_id uuid not null references app.usuario (id) on delete cascade,
    expira_em timestamptz not null
);
create index sessao_usuario on app.sessao (usuario_id);

create table app.prova (
    id uuid primary key default gen_random_uuid(),
    usuario_id uuid not null references app.usuario (id) on delete cascade,
    ano smallint not null,
    area text not null check (area in ('LC', 'CH', 'CN', 'MT')),
    co_prova bigint not null,
    lingua smallint check (lingua in (0, 1)),
    tipo text not null check (tipo in ('enem', 'simulado')),
    feita_em date,
    nota double precision check (nota between 0 and 1000),
    folha text not null,
    criada_em timestamptz not null default now()
);
create index prova_usuario on app.prova (usuario_id, ano);

create table app.auditoria (
    id bigint generated always as identity primary key,
    usuario_id uuid not null,
    acao text not null,
    prova_id uuid,
    detalhe jsonb,
    em timestamptz not null default now()
);
create index auditoria_usuario on app.auditoria (usuario_id, em);

-- RLS: cada usuário só enxerga e altera as próprias linhas. FORCE vale até para o dono da tabela.
alter table app.prova enable row level security;
alter table app.prova force row level security;
create policy prova_do_dono on app.prova
    using (usuario_id = nullif(current_setting('app.usuario_id', true), '')::uuid)
    with check (usuario_id = nullif(current_setting('app.usuario_id', true), '')::uuid);

alter table app.auditoria enable row level security;
alter table app.auditoria force row level security;
create policy auditoria_do_dono on app.auditoria
    using (usuario_id = nullif(current_setting('app.usuario_id', true), '')::uuid)
    with check (usuario_id = nullif(current_setting('app.usuario_id', true), '')::uuid);

-- Funções de conta: rodam como dono (security definer), só com o que cada uma precisa.
create function app.cadastrar(p_email text, p_nome text, p_hash text)
returns uuid language sql security definer set search_path = app, pg_temp as $$
    insert into app.usuario (email, nome, senha_hash, maior_de_18)
    values (lower(p_email), p_nome, p_hash, true) returning id;
$$;

create function app.credencial(p_email text)
returns table (id uuid, nome text, senha_hash text)
language sql security definer set search_path = app, pg_temp as $$
    select id, nome, senha_hash from app.usuario where email = lower(p_email);
$$;

create function app.abrir_sessao(p_usuario uuid, p_token_hash text, p_dias int)
returns void language sql security definer set search_path = app, pg_temp as $$
    delete from app.sessao where expira_em < now();
    insert into app.sessao (token_hash, usuario_id, expira_em)
    values (p_token_hash, p_usuario, now() + make_interval(days => p_dias));
$$;

create function app.sessao_usuario(p_token_hash text)
returns table (id uuid, nome text, email text)
language sql security definer set search_path = app, pg_temp as $$
    select u.id, u.nome, u.email from app.sessao s join app.usuario u on u.id = s.usuario_id
    where s.token_hash = p_token_hash and s.expira_em > now();
$$;

create function app.fechar_sessao(p_token_hash text)
returns void language sql security definer set search_path = app, pg_temp as $$
    delete from app.sessao where token_hash = p_token_hash;
$$;

revoke all on function app.cadastrar, app.credencial, app.abrir_sessao, app.sessao_usuario,
    app.fechar_sessao from public;
grant usage on schema app to meubizu_app;
grant execute on function app.cadastrar, app.credencial, app.abrir_sessao, app.sessao_usuario,
    app.fechar_sessao to meubizu_app;
grant select, insert, update, delete on app.prova to meubizu_app;
grant select, insert on app.auditoria to meubizu_app;

-- A base de referência é pública e só leitura.
grant usage on schema ref to meubizu_app;
grant select on all tables in schema ref to meubizu_app;
