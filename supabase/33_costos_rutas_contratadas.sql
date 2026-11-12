-- Costo de los servicios contratados y rutas armadas con un transportador contratado
alter table public.vueltas add column if not exists valor numeric;
alter table public.recorridos add column if not exists transportador_id uuid references public.transportadores(id) on delete set null;
alter table public.recorridos add column if not exists valor numeric;
