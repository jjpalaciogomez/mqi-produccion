-- 24. Horarios en logística: horario de recepción por días y tiempo en el sitio (clientes/proveedores y cada vuelta),
--     y vueltas "entre dos horas" (hora = desde, hora_hasta = hasta)
alter table public.lugares add column if not exists recepcion jsonb not null default '[]';
alter table public.lugares add column if not exists min_parada int check (min_parada is null or min_parada > 0);
alter table public.vueltas add column if not exists recepcion jsonb not null default '[]';
alter table public.vueltas add column if not exists hora_hasta time;
alter table public.vueltas add column if not exists min_parada int check (min_parada is null or min_parada > 0);
