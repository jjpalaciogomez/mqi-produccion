-- El camión puede salir sin cargar: la mercancía se recoge en el siguiente paso por la planta
alter table public.recorridos add column if not exists sin_cargar_salida boolean not null default false;
