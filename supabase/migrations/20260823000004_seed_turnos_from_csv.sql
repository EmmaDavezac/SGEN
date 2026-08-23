-- Importacion inicial de 55 turnos desde el CSV exportado.
-- Es idempotente por legacy_id y relaciona cada turno con clientes.id.
-- Los estados vacios del CSV se importan como provisional.

insert into public.turnos (
    legacy_id,
    cliente_id,
    fecha,
    hora_inicio,
    hora_fin,
    servicio,
    precio,
    estado,
    event_id
)
select
    source.legacy_id,
    clientes.id,
    source.hora_inicio::timestamptz::date,
    source.hora_inicio::timestamptz,
    source.hora_fin::timestamptz,
    source.servicio,
    source.precio::numeric,
    'provisional',
    source.event_id
from (values
    ('app_1785435411095_217', '2026-07-30T17:00:00.000Z', '2026-07-30T18:30:00.000Z', 'Mica Stach', 'Turno', 14200, 't335lcivmlsqpbso4d6l0an7uo@google.com'),
    ('app_1785435506007_153', '2026-07-30T12:30:00.000Z', '2026-07-30T14:00:00.000Z', 'Mireya Ledesma', 'Turno', 15500, 'f5254a5ul3286ok5v51160lbs0@google.com'),
    ('app_1785466042492_831', '2026-07-29T17:00:00.000Z', '2026-07-29T18:30:00.000Z', 'Chenoa', 'Turno', 16250, 'rao2aglq97jh5k96kdkupko72o@google.com'),
    ('app_1785466098673_798', '2026-07-31T12:00:00.000Z', '2026-07-31T13:30:00.000Z', 'Marlene', 'Turno', 17000, '745uem9mej9uevk17ituf620jc@google.com'),
    ('app_1785466144189_460', '2026-07-31T17:00:00.000Z', '2026-07-31T18:30:00.000Z', 'Mile Kloster', 'Turno', 15500, 'qkeo9t6bs1933vr1bcvh4qlvbo@google.com'),
    ('app_1785466175186_775', '2026-07-31T19:00:00.000Z', '2026-07-31T20:30:00.000Z', 'Mile Kloster', 'Turno', 17000, '0jodrjp657aq4hsvg9egs194mo@google.com'),
    ('app_1785628092204_882', '2026-08-01T12:00:00.000Z', '2026-08-01T13:30:00.000Z', 'Agustina Franco', 'Turno', 15750, 'sb3f21d9p5p7ea6cteinf3k1jo@google.com'),
    ('app_1785628275452_425', '2026-08-01T20:00:00.000Z', '2026-08-01T21:30:00.000Z', 'Aldana Luque', 'Turno', 15900, 'od3qhdp3aan4c9k7uol6tcmqac@google.com'),
    ('app_1785629861260_482', '2026-08-03T20:00:00.000Z', '2026-08-03T21:30:00.000Z', 'Vale Noriega', 'Turno', 16500, 'l69l2ohh21dahecmntsj3lmr48@google.com'),
    ('app_1785629953833_596', '2026-08-05T17:00:00.000Z', '2026-08-05T18:30:00.000Z', 'Mama de Emiliana Rossi', 'Turno', 15500, '99s1h5cujf93ndqccnb5qsi0d8@google.com'),
    ('app_1785630163080_169', '2026-08-06T17:00:00.000Z', '2026-08-06T18:30:00.000Z', 'Betiana', 'Turno', 17000, 'gb0uv73eqvooh5feaqpc6qr11k@google.com'),
    ('app_1785630234718_741', '2026-08-04T12:00:00.000Z', '2026-08-04T13:30:00.000Z', 'Tati Rios', 'Turno', 18000, '4ohd15frvarss2fp889f3iairc@google.com'),
    ('app_1785630280256_307', '2026-08-08T20:00:00.000Z', '2026-08-08T21:30:00.000Z', 'Mama de Aldana Godoy', 'Turno', 14000, 'puar052fipsdu52k96kjf3c8kc@google.com'),
    ('app_1785764143765_499', '2026-08-03T17:00:00.000Z', '2026-08-03T18:30:00.000Z', 'Abril', 'Turno', 17600, '2jij78ld9rmba5odj6lkf7c524@google.com'),
    ('app_1785764230343_320', '2026-08-06T00:00:00.000Z', '2026-08-06T01:30:00.000Z', 'Yasmin B', 'Turno', 15500, 'c86hndfqdmrrkehlbdomnlvsfk@google.com'),
    ('app_1785964781355_21', '2026-08-05T19:30:00.000Z', '2026-08-05T21:00:00.000Z', 'Vale', 'Turno', 15500, 'aosvnr3pi5kfufrgvhv4boopdc@google.com'),
    ('app_1786027288048_151', '2026-08-06T12:30:00.000Z', '2026-08-06T14:00:00.000Z', 'Anto Rossi', 'Turno', 15500, 'k19dd0nt02rv91a3mtqkd4i8b8@google.com'),
    ('app_1786116015913_343', '2026-08-07T12:30:00.000Z', '2026-08-07T14:00:00.000Z', 'Anto rios', 'Turno', 15500, '5tlgpjm61tmidpol1okcavi57k@google.com'),
    ('app_1786140204442_421', '2026-08-07T05:00:00.000Z', '2026-08-07T06:30:00.000Z', 'Nanu', 'Turno', 14000, 'tob6l34em6e2rgvhavant7k2lg@google.com'),
    ('app_1786140225871_228', '2026-08-07T17:00:00.000Z', '2026-08-07T18:30:00.000Z', 'Mel z', 'Turno', 15500, '92ovng0d57ivp0bcd85auk00v4@google.com'),
    ('app_1786142151400_219', '2026-08-04T18:00:00.000Z', '2026-08-04T19:30:00.000Z', 'Dani', 'Turno', 17000, 'i1kjol04kde82k469vor7pbqsk@google.com'),
    ('app_1786142201978_523', '2026-08-04T21:00:00.000Z', '2026-08-04T22:30:00.000Z', 'Carmen', 'Turno', 17400, 'o63eg41nmtvulm4rqvfgb4pnek@google.com'),
    ('app_1786142495879_621', '2026-08-08T17:00:00.000Z', '2026-08-08T18:30:00.000Z', 'Catalina Facendini', 'Turno', 16500, '5qe92vne5rdfa3ohdputd7mauo@google.com'),
    ('app_1786142613922_145', '2026-08-08T21:00:00.000Z', '2026-08-08T22:30:00.000Z', 'Aldana Godoy', 'Turno', 14400, 'thtf6crf32b8f927l6pklfbd7k@google.com'),
    ('app_1786142846896_935', '2026-08-08T12:30:00.000Z', '2026-08-08T14:00:00.000Z', 'Ceci', 'Turno', 19000, 'ogu6aiin5gquibtg51c18b9k7o@google.com'),
    ('app_1786147581023_871', '2026-08-12T21:00:00.000Z', '2026-08-12T22:30:00.000Z', 'Yami Gauna', 'Turno', 15500, 'fdo236v6fi7p3rfc2sgf5rrdro@google.com'),
    ('app_1786148178590_660', '2026-08-11T17:00:00.000Z', '2026-08-11T18:30:00.000Z', 'Geri', 'Turno', 17000, 'famb5dsg74c7l10g2b4e97lcuc@google.com'),
    ('app_1786148258733_979', '2026-08-13T12:00:00.000Z', '2026-08-13T13:30:00.000Z', 'Mireya', 'Turno', 15500, 'v16qkmv5qmnihqdairovp89k4g@google.com'),
    ('app_1786148327636_435', '2026-08-14T17:00:00.000Z', '2026-08-14T18:30:00.000Z', 'Jessy Guzman', 'Turno', 17000, '253jmeff10j8soov77vp0a2ru0@google.com'),
    ('app_1786148374769_230', '2026-08-14T20:00:00.000Z', '2026-08-14T21:30:00.000Z', 'Eve Luque', 'Turno', 15500, '8mjfh13ct75hqnh7nsm3sb8r2c@google.com'),
    ('app_1786148406195_879', '2026-08-15T17:00:00.000Z', '2026-08-15T18:30:00.000Z', 'Brenda', 'Turno', 8400, 'bn61ki9cekddla1ndhnbphfhdo@google.com'),
    ('app_1786148494143_413', '2026-08-20T12:00:00.000Z', '2026-08-20T13:30:00.000Z', 'Zulma', 'Turno', 14000, '75k5qud88pdblf5nkktk9cr67k@google.com'),
    ('app_1786148546845_369', '2026-08-19T12:00:00.000Z', '2026-08-19T13:30:00.000Z', 'Sabri', 'Turno', 0, 'oj8bqba7g560vm9cj3jo5rogbs@google.com'),
    ('app_1786148566630_475', '2026-08-22T12:00:00.000Z', '2026-08-22T13:30:00.000Z', 'Chenoa', 'Turno', 17000, 'kbq1mmjstkib7sfvo8cqthvdug@google.com'),
    ('app_1786148601526_120', '2026-08-23T05:00:00.000Z', '2026-08-23T06:30:00.000Z', 'Margarita', 'Turno', 0, '4d24kcg2377a8noqe3e8on05p0@google.com'),
    ('app_1786148918395_160', '2026-08-19T22:40:00.000Z', '2026-08-20T00:10:00.000Z', 'Lara', 'Turno', 15500, 'n8je1163sb1n4go8p571msh7vs@google.com'),
    ('app_1786149112394_839', '2026-08-20T21:00:00.000Z', '2026-08-20T22:30:00.000Z', 'Carmen', 'Turno', 17200, 'f9m9glhoclecsl2lodbc8skelc@google.com'),
    ('app_1786150650768_984', '2026-08-21T12:00:00.000Z', '2026-08-21T13:30:00.000Z', 'Marlen', 'Turno', 17000, 's93beibn9nhd0ophogo87ls454@google.com'),
    ('app_1786150665226_944', '2026-08-21T17:00:00.000Z', '2026-08-21T18:30:00.000Z', 'Yasmin B', 'Turno', 17000, 'kjgnsnj297ig6k2mpgchgndf30@google.com'),
    ('app_1786150736530_572', '2026-08-21T20:00:00.000Z', '2026-08-21T21:30:00.000Z', 'Mica Coronel', 'Turno', 18000, '50tcmhl6o88ltlobenn173a4a8@google.com'),
    ('app_1786151029998_2', '2026-08-22T17:00:00.000Z', '2026-08-22T18:30:00.000Z', 'Agustina Franco', 'Turno', 15750, 'uk0t1mq8k77amjr64mng64p6ak@google.com'),
    ('app_1786204937728_984', '2026-08-12T17:00:00.000Z', '2026-08-12T18:30:00.000Z', 'Xiomara Ojeda', 'Turno', 18000, 'dqguasetvqpjgqhgrmcgiohqdc@google.com'),
    ('app_1786233629915_543', '2026-08-13T17:00:00.000Z', '2026-08-13T18:30:00.000Z', 'Micaela Sauer', 'Turno', 18000, 'imbm8tvbn8ploi0na2utbddckk@google.com'),
    ('app_1786410794611_461', '2026-08-12T12:00:00.000Z', '2026-08-12T13:30:00.000Z', 'Alba', 'Turno', 16900, 'jp7gt2636jqmhrtq7p9glg0bh4@google.com'),
    ('app_1786551672913_688', '2026-09-02T17:00:00.000Z', '2026-09-02T18:30:00.000Z', 'Alba', 'Turno', 0, 'd0b11neavbrtpc9tjh1vnpa394@google.com'),
    ('app_1786631765758_324', '2026-08-28T19:30:00.000Z', '2026-08-28T21:00:00.000Z', 'Mireya', 'Turno', 0, 'paf2o741fket0spi4buj4vgunk@google.com'),
    ('app_1786637260570_612', '2026-08-15T12:00:00.000Z', '2026-08-15T13:30:00.000Z', 'Conti Lopez', 'Turno', 10, '23u3n8okigccsetb6al5ioqkkc@google.com'),
    ('app_1786760232971_930', '2026-08-14T22:40:00.000Z', '2026-08-15T00:10:00.000Z', 'Sahira Espinoza', 'Turno', 19000, 'agaosg88sdhhrbr9g7ughr4ncs@google.com'),
    ('app_1787172014471_674', '2026-08-20T17:00:00.000Z', '2026-08-20T18:30:00.000Z', 'Sonia Espindola', 'Turno', 15500, 'lc3k33me4968l8v24padl6qtp8@google.com'),
    ('app_1787172674348_760', '2026-08-21T22:00:00.000Z', '2026-08-21T23:30:00.000Z', 'Ceci', 'Turno', 18800, 'q08m0gk2gdl27jh7p8hiq8fe8g@google.com'),
    ('app_1787172711040_613', '2026-08-22T20:00:00.000Z', '2026-08-22T21:30:00.000Z', 'Aldana Luque', 'Turno', 15500, 'ejbp360dglrjuabnlsqnt4f080@google.com'),
    ('app_1787173151015_542', '2026-08-23T17:00:00.000Z', '2026-08-23T18:30:00.000Z', 'Mile Kloster', 'Turno', 0, '9817m4mmlfabtf7175stei17ng@google.com'),
    ('app_1787271365347_19', '2026-09-08T21:00:00.000Z', '2026-09-08T22:30:00.000Z', 'Carmen', 'Turno', 0, 'k645ipp0ohflah3f2kauei2vco@google.com'),
    ('app_1787274761641_669', '2026-09-04T12:00:00.000Z', '2026-09-04T13:30:00.000Z', 'Iara Benitez', 'Turno', 19000, 'kldpu7ugch8sgstoun08u8olc0@google.com'),
    ('app_1787324022029_445', '2026-09-11T12:00:00.000Z', '2026-09-11T13:30:00.000Z', 'Marlene', 'Turno', 7000, 'jo0kfo9jslirthfshg32piht28@google.com')
) as source(legacy_id, hora_inicio, hora_fin, cliente, servicio, precio, event_id)
join public.clientes
    on clientes.nombre_normalizado = lower(trim(source.cliente))
on conflict (legacy_id) do nothing;

select count(*) as turnos_importados from public.turnos;
