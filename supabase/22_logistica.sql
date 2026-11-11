-- 22. Módulo de logística (fase 1, sin GPS): clientes y proveedores recurrentes, vueltas y rutas del día
-- Roles nuevos: logistica (pide vueltas: compras, Litografía…) y conductor (ve su ruta en el celular y marca las paradas)

do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.perfiles'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%rol%' loop
    execute format('alter table public.perfiles drop constraint %I', c);
  end loop;
end $$;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('admin','direccion','consulta','tablet','logistica','conductor'));

create or replace function public.pide_vueltas() returns boolean
language sql stable as $$ select coalesce(public.mi_rol() in ('admin','direccion','logistica'), false) $$;

-- Clientes, proveedores y otros sitios a los que se va seguido
create table if not exists public.lugares (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'cliente' check (tipo in ('cliente','proveedor','otro')),
  nombre text not null,
  direccion text,
  municipio text default 'Medellín',
  contacto text,
  telefono text,
  horario text,             -- horario de atención, p. ej. "L-V 8:00-12:00 y 2:00-5:00"
  lat numeric, lng numeric, -- ubicación (de un link de Google Maps) para ordenar la ruta
  notas text,
  activo boolean not null default true,
  creado timestamptz not null default now()
);

-- Recorrido (ruta) de un vehículo en un día. ("rutas" ya es la ruta de procesos de un producto)
create table if not exists public.recorridos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  vehiculo text not null check (vehiculo in ('camion','mensajero','externo')),
  conductor text,
  estado text not null default 'borrador' check (estado in ('borrador','confirmada','cerrada')),
  confirmada_por uuid,
  confirmada_en timestamptz,
  nota text,
  creado timestamptz not null default now(),
  unique (fecha, vehiculo)
);

-- Vuelta: entrega, recogida o diligencia que alguien pide
create table if not exists public.vueltas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'entrega' check (tipo in ('entrega','recogida','diligencia')),
  lugar_id uuid references public.lugares(id) on delete set null,
  destino text not null,     -- nombre del sitio (se copia del cliente/proveedor)
  direccion text, municipio text, contacto text, telefono text, horario text,
  lat numeric, lng numeric,
  fecha date not null,
  franja text not null default 'todo' check (franja in ('manana','tarde','todo')),
  descripcion text not null, -- qué se lleva o se recoge
  op text,                   -- OP relacionada (opcional)
  necesita_camion boolean not null default false,
  prioridad int not null default 2 check (prioridad in (1,2)), -- 1 urgente
  estado text not null default 'pendiente' check (estado in ('pendiente','hecha','no_hecha','cancelada')),
  recorrido_id uuid references public.recorridos(id) on delete set null,
  orden int,
  resultado text,            -- nota del conductor
  hecha_en timestamptz,
  solicitante uuid default auth.uid(),
  solicitante_nombre text,
  creado timestamptz not null default now()
);
create index if not exists vueltas_fecha on public.vueltas (fecha, estado);

alter table public.lugares enable row level security;
alter table public.recorridos enable row level security;
alter table public.vueltas enable row level security;

drop policy if exists "lectura" on public.lugares;
create policy "lectura" on public.lugares for select to authenticated using (true);
drop policy if exists "escriben" on public.lugares;
create policy "escriben" on public.lugares for all to authenticated using (public.pide_vueltas()) with check (public.pide_vueltas());

drop policy if exists "lectura" on public.recorridos;
create policy "lectura" on public.recorridos for select to authenticated using (true);
drop policy if exists "gestores" on public.recorridos;
create policy "gestores" on public.recorridos for all to authenticated using (public.es_gestor()) with check (public.es_gestor());

drop policy if exists "lectura" on public.vueltas;
create policy "lectura" on public.vueltas for select to authenticated using (true);
drop policy if exists "piden" on public.vueltas;
create policy "piden" on public.vueltas for insert to authenticated with check (public.pide_vueltas());
drop policy if exists "gestores cambian" on public.vueltas;
create policy "gestores cambian" on public.vueltas for update to authenticated using (public.es_gestor()) with check (public.es_gestor());
-- Quien pidió la vuelta la puede corregir o cancelar mientras no esté en una ruta confirmada
drop policy if exists "solicitante cambia" on public.vueltas;
create policy "solicitante cambia" on public.vueltas for update to authenticated
  using (public.pide_vueltas() and solicitante = auth.uid() and estado = 'pendiente'
         and not exists (select 1 from public.recorridos r where r.id = recorrido_id and r.estado <> 'borrador'))
  with check (public.pide_vueltas() and solicitante = auth.uid() and estado in ('pendiente','cancelada'));
drop policy if exists "gestores borran" on public.vueltas;
create policy "gestores borran" on public.vueltas for delete to authenticated using (public.es_gestor());

revoke all on public.lugares, public.recorridos, public.vueltas from anon;
grant select, insert, update, delete on public.lugares, public.recorridos, public.vueltas to authenticated;

-- El conductor marca cada parada de una ruta confirmada
create or replace function public.marcar_vuelta(p_vuelta uuid, p_hecha boolean, p_nota text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if coalesce(public.mi_rol(), '') not in ('conductor','admin','direccion') then return 'Sin permiso'; end if;
  select vu.*, r.estado as ruta_estado into v from vueltas vu left join recorridos r on r.id = vu.recorrido_id where vu.id = p_vuelta;
  if not found then return 'No existe la vuelta'; end if;
  if v.ruta_estado is distinct from 'confirmada' then return 'La ruta no está confirmada'; end if;
  if not p_hecha and coalesce(trim(p_nota), '') = '' then return 'Escribe por qué no se pudo'; end if;
  update vueltas set estado = case when p_hecha then 'hecha' else 'no_hecha' end,
    resultado = nullif(trim(p_nota), ''), hecha_en = now() where id = p_vuelta;
  return 'ok';
end $$;
revoke execute on function public.marcar_vuelta(uuid, boolean, text) from public, anon;
grant execute on function public.marcar_vuelta(uuid, boolean, text) to authenticated;

-- Punto de salida (la planta) y minutos promedio por parada
insert into public.ajustes (clave, valor) values ('logistica', '{"lat": null, "lng": null, "min_parada": 20, "jornada_camion": 510}')
on conflict (clave) do nothing;
