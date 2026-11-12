-- Replanificar en el día: hora real en que el camión quedó en la planta y si ya almorzó
alter table public.recorridos add column if not exists en_planta time;
alter table public.recorridos add column if not exists ya_almorzo boolean not null default false;
