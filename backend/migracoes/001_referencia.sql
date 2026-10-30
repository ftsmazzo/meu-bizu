-- Base de referência (somente leitura para a aplicação): vem da exportação do laboratório de dados.
-- Nada aqui é dado de aluno. Dados de aluno ficam no schema `app` (fase F2), com RLS.
create schema if not exists ref;

create table ref.habilidade (
    area text not null,
    habilidade smallint not null,
    competencia smallint not null,
    competencia_texto text not null,
    descricao text not null,
    primary key (area, habilidade)
);

create table ref.caderno (
    ano smallint not null,
    co_prova bigint not null,
    area text not null,
    cor text not null,
    n_itens smallint not null,
    adaptado boolean not null,
    ambiguo boolean not null,
    tem_respondentes boolean not null,
    primary key (ano, co_prova)
);
create index caderno_ano_area on ref.caderno (ano, area);

create table ref.item (
    ano smallint not null,
    co_item bigint not null,
    area text not null,
    habilidade smallint,
    abandonado boolean not null,
    motivo_abandono text,
    param_a double precision,
    param_b double precision,
    param_c double precision,
    primary key (ano, co_item)
);

create table ref.item_caderno (
    ano smallint not null,
    co_prova bigint not null,
    area text not null,
    posicao smallint not null,
    co_item bigint not null,
    tp_lingua smallint,
    gabarito text
);
create index item_caderno_prova on ref.item_caderno (ano, co_prova);

create table ref.questao (
    ano smallint not null,
    co_item bigint not null,
    area text not null,
    fonte text,
    introducao text,
    enunciado text,
    alternativas jsonb not null,
    imagens jsonb,
    primary key (ano, co_item)
);

create table ref.item_estatistica (
    ano smallint not null,
    co_item bigint not null,
    area text not null,
    habilidade smallint,
    abandonado boolean not null,
    gabarito text,
    n bigint,
    acerto double precision,
    acerto_decil_1 double precision,
    acerto_decil_10 double precision,
    discriminacao double precision,
    inversao boolean,
    distrator_dominante text,
    prop_distrator_topo double precision,
    armadilha boolean,
    prop_sem_resposta double precision,
    primary key (ano, co_item)
);

create table ref.item_esperado (
    ano smallint not null,
    co_item bigint not null,
    decil smallint not null,
    acerto double precision not null,
    n bigint not null,
    primary key (ano, co_item, decil)
);

create table ref.decil_nota (
    ano smallint not null,
    area text not null,
    decil smallint not null,
    nota_min double precision not null,
    nota_max double precision not null,
    n bigint not null,
    primary key (ano, area, decil)
);
