-- Transportadores recurrentes (mensajeros y servicios de transporte contratados)
create table if not exists public.transportadores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text default 'moto',
  contacto text,
  telefono text,
  notas text,
  activo boolean not null default true,
  creado timestamptz not null default now()
);
alter table public.transportadores enable row level security;
drop policy if exists transportadores_leer on public.transportadores;
create policy transportadores_leer on public.transportadores for select to authenticated using (true);
drop policy if exists transportadores_escribir on public.transportadores;
create policy transportadores_escribir on public.transportadores for all to authenticated using (public.pide_vueltas()) with check (public.pide_vueltas());
grant select, insert, update, delete on public.transportadores to authenticated;
alter table public.vueltas add column if not exists transportador_id uuid references public.transportadores(id) on delete set null;
