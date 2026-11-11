-- 21. Horas extra: un día (también sábado) en que la planta, o un área, trabaja hasta una hora más tarde
create table if not exists public.horas_extra (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  area text references public.areas(codigo), -- null = toda la planta
  hasta time not null,
  nota text,
  creado timestamptz not null default now()
);
create index if not exists horas_extra_fecha on public.horas_extra (fecha);
alter table public.horas_extra enable row level security;
drop policy if exists "lectura autenticados" on public.horas_extra;
create policy "lectura autenticados" on public.horas_extra for select to authenticated using (true);
drop policy if exists "gestores escriben" on public.horas_extra;
create policy "gestores escriben" on public.horas_extra for all to authenticated using (public.es_gestor()) with check (public.es_gestor());
revoke all on public.horas_extra from anon;
grant select, insert, update, delete on public.horas_extra to authenticated;
