-- =====================================================================
-- PAGOS: permisos de escritura idénticos al programa anterior (Apps Script)
--  * Contabilidad ve y exporta, pero NO guarda Nómina quincenal ni Horas extra,
--    NO recalcula, NO genera/regenera/elimina Causaciones y NO elimina Ausentismos.
--    Sí puede editar Empleados, crear/cancelar Programados y registrar Ausentismos.
--  * Un día de Jornada ya guardado solo se consulta; únicamente Gerencia/Administrador
--    (es_gestor) lo puede corregir o borrar.
--  * La configuración contable (Causaciones) solo la edita Gerencia/Administrador.
-- =====================================================================

-- Puede ESCRIBIR en un módulo de Pagos (tiene el módulo y no es un rol de solo consulta)
create or replace function public.edita_pagos(variadic p_mod text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select public.puede_pagos(variadic p_mod) and coalesce(public.mi_rol(), '') <> 'contabilidad'
$$;
revoke execute on function public.edita_pagos(text[]) from public, anon;
grant execute on function public.edita_pagos(text[]) to authenticated;

-- Nómina quincenal y Horas extra: Contabilidad solo consulta
drop policy if exists escribe on public.nomina_quincenal;
create policy escribe on public.nomina_quincenal for all to authenticated
  using (public.edita_pagos('nomina')) with check (public.edita_pagos('nomina'));
drop policy if exists escribe on public.nomina_horas_extra;
create policy escribe on public.nomina_horas_extra for all to authenticated
  using (public.edita_pagos('horasextra')) with check (public.edita_pagos('horasextra'));

-- Causaciones: Contabilidad las consulta y descarga, pero no las genera ni las borra
drop policy if exists escribe on public.causaciones;
create policy escribe on public.causaciones for all to authenticated
  using (public.edita_pagos('causaciones')) with check (public.edita_pagos('causaciones'));

-- Configuración (incluida la contable de Causaciones): solo Gerencia/Administrador
drop policy if exists escribe on public.nomina_config;
create policy escribe on public.nomina_config for all to authenticated
  using (public.es_gestor()) with check (public.es_gestor());

-- Ausentismos: registrar sí (RR.HH. y Contabilidad), eliminar solo quien edita
drop policy if exists escribe on public.ausentismos;
drop policy if exists registra on public.ausentismos;
drop policy if exists corrige on public.ausentismos;
drop policy if exists elimina on public.ausentismos;
create policy registra on public.ausentismos for insert to authenticated with check (public.puede_pagos('ausentismos'));
create policy corrige on public.ausentismos for update to authenticated using (public.edita_pagos('ausentismos')) with check (public.edita_pagos('ausentismos'));
create policy elimina on public.ausentismos for delete to authenticated using (public.edita_pagos('ausentismos'));

-- Jornadas: se registra el día una vez; corregir o borrar un día guardado es solo de Gerencia/Administrador
drop policy if exists escribe on public.jornadas;
drop policy if exists registra on public.jornadas;
drop policy if exists corrige on public.jornadas;
drop policy if exists elimina on public.jornadas;
create policy registra on public.jornadas for insert to authenticated with check (
  (grupo = 'litografia' and public.puede_pagos('jornadalito')) or (grupo = 'industrial' and public.puede_pagos('jornadaindustrial')));
create policy corrige on public.jornadas for update to authenticated using (public.es_gestor()) with check (public.es_gestor());
create policy elimina on public.jornadas for delete to authenticated using (public.es_gestor());

-- Guardar quincena (función con permisos propios): misma regla que la tabla
create or replace function public.guardar_nomina(p_quincena text, p_q_inicio date, p_filas jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare f jsonb; v_ya boolean; v_id text;
begin
  if not public.edita_pagos('nomina') then return 'Sin permiso para guardar la nómina (solo consulta)'; end if;
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
