-- =====================================================================
-- PAGOS AL PERSONAL (nómina quincenal, horas extra, jornadas, etc.)
-- Migrado desde CALCULADORA_NOMINA_QUINCENAL (Google Sheets + Apps Script).
-- Los datos de nómina son sensibles: cada tabla queda cerrada por rol.
-- =====================================================================

-- ---------- Roles nuevos ----------
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('admin','direccion','consulta','tablet','logistica','conductor','rrhh','contabilidad','litografia'));
-- Módulos de Pagos adicionales para un usuario puntual (p. ej. alguien de logística que también registra jornada)
alter table public.perfiles add column if not exists modulos_pagos text[] not null default '{}';

-- Módulos: jornadalito, jornadaindustrial, horasextra, nomina, programados, ausentismos, vacaciones, informes, causaciones, empleados
create or replace function public.mis_modulos_pagos() returns text[]
language sql stable security definer set search_path = public as $$
  select case
    when p.rol in ('admin','direccion') then array['jornadalito','jornadaindustrial','horasextra','nomina','programados','ausentismos','vacaciones','informes','causaciones','empleados']
    when p.rol = 'rrhh' then array['empleados','nomina','programados','ausentismos','vacaciones']
    when p.rol = 'contabilidad' then array['horasextra','nomina','empleados','programados','ausentismos','vacaciones','informes','causaciones']
    when p.rol = 'litografia' then array['jornadalito']
    else array[]::text[] end || coalesce(p.modulos_pagos, '{}')
  from public.perfiles p where p.user_id = auth.uid()
$$;

create or replace function public.puede_pagos(variadic p_mod text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.mis_modulos_pagos() && p_mod, false)
$$;
revoke execute on function public.mis_modulos_pagos() from public, anon;
revoke execute on function public.puede_pagos(text[]) from public, anon;
grant execute on function public.mis_modulos_pagos() to authenticated;
grant execute on function public.puede_pagos(text[]) to authenticated;

-- ---------- Empleados (base maestra; se une con personas de producción) ----------
create table if not exists public.empleados (
  id text primary key,                         -- E001, E002… (mismo código de la hoja)
  persona_id uuid unique references public.personas(id) on delete set null,
  cedula text,
  nombre text not null,
  cargo text,
  area text,
  tipo_contrato text,
  fecha_ingreso date,
  salario numeric not null default 0,
  aux_transporte boolean not null default false,
  aux_conectividad boolean not null default false,
  banco text,
  cuenta text,
  eps text,
  pension text,
  arl text,
  nivel_riesgo text,
  estado text not null default 'Activo' check (estado in ('Activo','Inactivo')),
  empresa text,
  liquida_extras boolean not null default false,
  tipo_doc_banco text,
  fecha_cumpleanos date,
  correo_personal text,
  direccion text,
  telefono text,
  contacto_emergencia text,
  fecha_retiro date,
  caja_compensacion text,
  documento_conciliacion text,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- ---------- Jornadas (registro diario de entrada/salida) ----------
create table if not exists public.jornadas (
  id bigint generated always as identity primary key,
  grupo text not null check (grupo in ('litografia','industrial')),
  fecha date not null,
  empleado_id text not null references public.empleados(id),
  nombre text,
  area text,
  entrada text,
  salida text,
  horas numeric not null default 0,
  observacion text,
  estado text not null default 'Normal',
  seg_entrada text,
  seg_fecha_salida date,
  seg_salida text,
  seg_horas numeric not null default 0,
  actualizado timestamptz not null default now(),
  unique (grupo, fecha, empleado_id)
);
create index if not exists jornadas_fecha on public.jornadas (fecha);

-- ---------- Horas extra liquidadas (semanal, viernes a jueves) ----------
-- OJO: public.horas_extra ya existe (horas extra PROGRAMADAS de Programación); esta es otra tabla.
create table if not exists public.nomina_horas_extra (
  id bigint generated always as identity primary key,
  semana text not null,                        -- "Del 13 al 19 de noviembre de 2026"
  semana_inicio date not null,
  empleado_id text not null references public.empleados(id),
  nombre text,
  area text,
  valor_hora numeric not null default 0,
  hed numeric not null default 0, hen numeric not null default 0, rn numeric not null default 0,
  hdf numeric not null default 0, hndf numeric not null default 0, hedf numeric not null default 0, henf numeric not null default 0,
  v_hed numeric not null default 0, v_hen numeric not null default 0, v_rn numeric not null default 0,
  v_hdf numeric not null default 0, v_hndf numeric not null default 0, v_hedf numeric not null default 0, v_henf numeric not null default 0,
  total numeric not null default 0,
  actualizado timestamptz not null default now(),
  unique (semana, empleado_id)
);

-- ---------- Nómina quincenal ----------
create table if not exists public.nomina_quincenal (
  id bigint generated always as identity primary key,
  quincena text not null,                      -- "Del 1 al 15 de noviembre de 2026"
  q_inicio date not null,
  empleado_id text not null references public.empleados(id),
  nombre text,
  salario numeric not null default 0,
  dias numeric not null default 0,
  incapacidad numeric not null default 0,
  otros numeric not null default 0,
  nota text,
  basico numeric not null default 0,
  aux_transporte numeric not null default 0,
  devengado numeric not null default 0,
  ibc numeric not null default 0,
  salud numeric not null default 0,
  pension numeric not null default 0,
  descuentos numeric not null default 0,
  neto numeric not null default 0,
  subsidio_incapacidad numeric not null default 0,
  programado numeric not null default 0,
  programado_concepto text,
  dias_vacaciones numeric not null default 0,
  dias_licencia numeric not null default 0,
  actualizado timestamptz not null default now(),
  unique (quincena, empleado_id)
);

-- ---------- Pagos programados (cuotas / descuentos recurrentes) ----------
create table if not exists public.programados (
  id text primary key,
  empleado_id text not null references public.empleados(id),
  nombre text,
  concepto text,
  valor numeric not null default 0,
  quincenas_totales int not null default 0,
  quincenas_aplicadas int not null default 0,
  estado text not null default 'Activo',
  fecha_creacion text,
  tipo text,
  monto_total numeric,
  quincena_inicio text,
  cuenta_conciliacion text,
  tipo_cuenta_conciliacion text,
  cuenta_contable_conciliacion text
);

-- ---------- Vacaciones ----------
create table if not exists public.vacaciones (
  id text primary key,
  empleado_id text not null references public.empleados(id),
  nombre text,
  fecha_inicio date not null,
  fecha_fin date not null,
  dias_habiles numeric not null default 0,
  observacion text,
  estado text not null default 'Activo',
  fecha_registro text
);

-- ---------- Ausentismos ----------
create table if not exists public.ausentismos (
  id text primary key,
  empleado_id text not null references public.empleados(id),
  nombre text,
  tipo text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  dias_habiles numeric not null default 0,
  observacion text,
  estado text not null default 'Activo',
  fecha_registro text
);

-- ---------- Causaciones contables ----------
create table if not exists public.causaciones (
  id bigint generated always as identity primary key,
  quincena text not null,
  id_linea int not null,
  empleado_id text,
  cuenta text,
  descripcion text,
  centro_costo text,
  nit text,
  nombre text,
  debito numeric not null default 0,
  credito numeric not null default 0,
  concepto text,
  tipo text,
  generado_en text
);
create index if not exists causaciones_quincena on public.causaciones (quincena);

-- ---------- Configuración de nómina (parámetros legales, factores, festivos, causaciones) ----------
create table if not exists public.nomina_config (
  clave text primary key,
  valor jsonb not null,
  actualizado timestamptz not null default now()
);

-- ---------- Seguridad ----------
alter table public.empleados enable row level security;
alter table public.jornadas enable row level security;
alter table public.nomina_horas_extra enable row level security;
alter table public.nomina_quincenal enable row level security;
alter table public.programados enable row level security;
alter table public.vacaciones enable row level security;
alter table public.ausentismos enable row level security;
alter table public.causaciones enable row level security;
alter table public.nomina_config enable row level security;

do $$ declare t text; begin
  foreach t in array array['empleados','jornadas','nomina_horas_extra','nomina_quincenal','programados','vacaciones','ausentismos','causaciones','nomina_config'] loop
    execute format('drop policy if exists lee on public.%I', t);
    execute format('drop policy if exists escribe on public.%I', t);
  end loop;
end $$;

create policy lee on public.empleados for select to authenticated using (public.puede_pagos('empleados','nomina','horasextra','informes','causaciones','programados','ausentismos','vacaciones'));
create policy escribe on public.empleados for all to authenticated using (public.puede_pagos('empleados')) with check (public.puede_pagos('empleados'));

create policy lee on public.jornadas for select to authenticated using (
  (grupo = 'litografia' and public.puede_pagos('jornadalito')) or (grupo = 'industrial' and public.puede_pagos('jornadaindustrial'))
  or public.puede_pagos('horasextra','informes'));
create policy escribe on public.jornadas for all to authenticated using (
  (grupo = 'litografia' and public.puede_pagos('jornadalito')) or (grupo = 'industrial' and public.puede_pagos('jornadaindustrial')))
  with check ((grupo = 'litografia' and public.puede_pagos('jornadalito')) or (grupo = 'industrial' and public.puede_pagos('jornadaindustrial')));

create policy lee on public.nomina_horas_extra for select to authenticated using (public.puede_pagos('horasextra','informes','jornadaindustrial'));
create policy escribe on public.nomina_horas_extra for all to authenticated using (public.puede_pagos('horasextra')) with check (public.puede_pagos('horasextra'));

create policy lee on public.nomina_quincenal for select to authenticated using (public.puede_pagos('nomina','informes','causaciones'));
create policy escribe on public.nomina_quincenal for all to authenticated using (public.puede_pagos('nomina')) with check (public.puede_pagos('nomina'));

create policy lee on public.programados for select to authenticated using (public.puede_pagos('programados','nomina','informes'));
create policy escribe on public.programados for all to authenticated using (public.puede_pagos('programados','nomina')) with check (public.puede_pagos('programados','nomina'));

create policy lee on public.vacaciones for select to authenticated using (public.puede_pagos('vacaciones','nomina','informes'));
create policy escribe on public.vacaciones for all to authenticated using (public.puede_pagos('vacaciones')) with check (public.puede_pagos('vacaciones'));

create policy lee on public.ausentismos for select to authenticated using (public.puede_pagos('ausentismos','nomina','vacaciones','informes','causaciones'));
create policy escribe on public.ausentismos for all to authenticated using (public.puede_pagos('ausentismos')) with check (public.puede_pagos('ausentismos'));

create policy lee on public.causaciones for select to authenticated using (public.puede_pagos('causaciones'));
create policy escribe on public.causaciones for all to authenticated using (public.puede_pagos('causaciones')) with check (public.puede_pagos('causaciones'));

create policy lee on public.nomina_config for select to authenticated using (cardinality(public.mis_modulos_pagos()) > 0);
create policy escribe on public.nomina_config for all to authenticated
  using (public.es_gestor() or (clave = 'causaciones' and public.puede_pagos('causaciones')))
  with check (public.es_gestor() or (clave = 'causaciones' and public.puede_pagos('causaciones')));

-- Quien registra jornada sin acceso a Empleados solo ve nombre y área de quienes liquidan extras (nunca salarios)
create or replace function public.empleados_jornada(p_grupo text)
returns table (id text, nombre text, area text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nombre, e.area from public.empleados e
  where public.puede_pagos(case when p_grupo = 'litografia' then 'jornadalito' else 'jornadaindustrial' end)
    and e.estado <> 'Inactivo' and e.liquida_extras and coalesce(e.tipo_contrato, '') <> 'Prestación de servicios'
    and ((translate(lower(trim(coalesce(e.area,''))), 'áéíóú', 'aeiou') = 'litografia') = (p_grupo = 'litografia'))
  order by e.nombre
$$;
revoke execute on function public.empleados_jornada(text) from public, anon;
grant execute on function public.empleados_jornada(text) to authenticated;

-- Guardar una quincena: reemplaza las filas de esos empleados y avanza las cuotas de programados
-- (solo la primera vez que se guarda cada empleado en esa quincena, igual que la hoja).
create or replace function public.guardar_nomina(p_quincena text, p_q_inicio date, p_filas jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare f jsonb; v_ya boolean; v_id text;
begin
  if not public.puede_pagos('nomina') then return 'Sin permiso'; end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    select exists (select 1 from nomina_quincenal where quincena = p_quincena and empleado_id = f->>'empleado_id') into v_ya;
    delete from nomina_quincenal where quincena = p_quincena and empleado_id = f->>'empleado_id';
    insert into nomina_quincenal (quincena, q_inicio, empleado_id, nombre, salario, dias, incapacidad, otros, nota, basico,
      aux_transporte, devengado, ibc, salud, pension, descuentos, neto, subsidio_incapacidad, programado, programado_concepto,
      dias_vacaciones, dias_licencia)
    select p_quincena, p_q_inicio, x.empleado_id, x.nombre, x.salario, x.dias, x.incapacidad, x.otros, x.nota, x.basico,
      x.aux_transporte, x.devengado, x.ibc, x.salud, x.pension, x.descuentos, x.neto, x.subsidio_incapacidad, x.programado,
      x.programado_concepto, x.dias_vacaciones, x.dias_licencia
    from jsonb_populate_record(null::nomina_quincenal, f) x;
    if not v_ya then
      for v_id in select jsonb_array_elements_text(coalesce(f->'programados_ids', '[]')) loop
        update programados set quincenas_aplicadas = quincenas_aplicadas + 1,
          estado = case when quincenas_totales > 0 and quincenas_aplicadas + 1 >= quincenas_totales then 'Finalizado' else estado end,
          quincena_inicio = case when quincenas_aplicadas = 0 and coalesce(quincena_inicio, '') = '' then p_quincena else quincena_inicio end
        where id = v_id;
      end loop;
    end if;
  end loop;
  return 'ok';
end $$;
revoke execute on function public.guardar_nomina(text, date, jsonb) from public, anon;
grant execute on function public.guardar_nomina(text, date, jsonb) to authenticated;

-- Tiempo real para las pantallas de Pagos
do $$ declare t text; begin
  foreach t in array array['empleados','jornadas','nomina_horas_extra','nomina_quincenal','programados','vacaciones','ausentismos','causaciones','nomina_config'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t); exception when duplicate_object then null; end;
  end loop;
end $$;

select json_build_object('tablas', (select count(*) from information_schema.tables where table_schema='public'
  and table_name in ('empleados','jornadas','nomina_horas_extra','nomina_quincenal','programados','vacaciones','ausentismos','causaciones','nomina_config')))::text as r;

-- Vacaciones: los saldos iniciales traídos del Excel (corte 2026-09-01) quedan como tipo 'Saldo inicial'
-- con los días PENDIENTES en positivo. En la hoja estaban escritos como texto negativo ("-9,75") y la hoja los contaba como 0.
alter table public.vacaciones add column if not exists tipo text not null default 'Periodo';
alter table public.vacaciones drop constraint if exists vacaciones_tipo_check;
alter table public.vacaciones add constraint vacaciones_tipo_check check (tipo in ('Periodo','Saldo inicial'));
