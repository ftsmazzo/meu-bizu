-- Onde uma nota fica no Brasil, no estado e no município (agregados do laboratório, sem pessoa).
-- `pontos` são 19 percentis da nota (5%, 10%, ..., 95%). UF e município são os do local da prova.
-- Locais com poucos participantes não são exportados (estado < 30, município < 50).
create table ref.nota_geo (
    ano smallint not null,
    area text not null,
    nivel text not null check (nivel in ('BR', 'UF', 'MUN')),
    codigo text not null,
    uf text,
    nome text,
    n bigint not null,
    pontos double precision[] not null check (array_length(pontos, 1) = 19),
    primary key (ano, area, nivel, codigo)
);
create index nota_geo_uf on ref.nota_geo (ano, area, nivel, uf);

-- A base de referência é pública e só leitura (tabela nova precisa do próprio GRANT).
grant select on ref.nota_geo to meubizu_app;
