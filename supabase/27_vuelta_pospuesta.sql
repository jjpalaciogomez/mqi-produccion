-- 27. Vueltas "no programar por ahora": no entran en la ruta ni en la propuesta automática hasta que se retomen
alter table public.vueltas add column if not exists pospuesta boolean not null default false;
