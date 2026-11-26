-- Jornada: "Guardar avance" para terminar el día más tarde.
-- El avance se guarda aparte; el día sigue pendiente (alerta de días faltantes) y no cuenta para horas extra
-- hasta que se pulse "Guardar día".
create table if not exists public.jornadas_borrador (
  grupo text not null check (grupo in ('litografia','industrial')),
  fecha date not null,
  filas jsonb not null,
  actualizado timestamptz not null default now(),
  autor uuid default auth.uid(),
  primary key (grupo, fecha)
);
alter table public.jornadas_borrador enable row level security;
drop policy if exists lee on public.jornadas_borrador;
drop policy if exists escribe on public.jornadas_borrador;
create policy lee on public.jornadas_borrador for select to authenticated using (
  (grupo = 'litografia' and public.puede_pagos('jornadalito')) or (grupo = 'industrial' and public.puede_pagos('jornadaindustrial')));
create policy escribe on public.jornadas_borrador for all to authenticated using (
  (grupo = 'litografia' and public.puede_pagos('jornadalito')) or (grupo = 'industrial' and public.puede_pagos('jornadaindustrial')))
  with check ((grupo = 'litografia' and public.puede_pagos('jornadalito')) or (grupo = 'industrial' and public.puede_pagos('jornadaindustrial')));
do $$ begin alter publication supabase_realtime add table public.jornadas_borrador; exception when duplicate_object then null; end $$;
select 'ok' as r;
