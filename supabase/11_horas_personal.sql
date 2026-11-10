-- 11: horas registradas por persona y día (hora de Colombia)
-- Tiempo en tareas (sin terceros) + tiempo en paros. Solo Administración y Dirección.
create or replace function public.horas_personal(p_desde date, p_hasta date)
returns table (persona_id uuid, nombre text, area text, fecha date, min_tareas numeric, min_paros numeric, registros int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_gestor() then raise exception 'Sin permiso'; end if;
  return query
  with t as (
    select r.persona_id, (r.inicio at time zone 'America/Bogota')::date as f,
           sum(coalesce(r.minutos, extract(epoch from (r.fin - r.inicio))/60)) as m, count(*)::int as n
    from registros r join tareas ta on ta.id = r.tarea_id
    where r.motivo_pausa is null and ta.area <> 'TERCEROS' and (r.minutos is not null or r.fin is not null)
      and (r.inicio at time zone 'America/Bogota')::date between p_desde and p_hasta
    group by 1, 2),
  p as (
    select pa.persona_id, (pa.inicio at time zone 'America/Bogota')::date as f,
           sum(coalesce(pa.minutos, extract(epoch from (pa.fin - pa.inicio))/60)) as m, count(*)::int as n
    from paros pa
    where (pa.minutos is not null or pa.fin is not null)
      and (pa.inicio at time zone 'America/Bogota')::date between p_desde and p_hasta
    group by 1, 2)
  select pe.id, pe.nombre, pe.area, coalesce(t.f, p.f),
         round(coalesce(t.m, 0)::numeric, 1), round(coalesce(p.m, 0)::numeric, 1), coalesce(t.n, 0) + coalesce(p.n, 0)
  from t full join p on p.persona_id = t.persona_id and p.f = t.f
  join personas pe on pe.id = coalesce(t.persona_id, p.persona_id);
end $$;
revoke execute on function public.horas_personal(date, date) from public, anon;
grant execute on function public.horas_personal(date, date) to authenticated;
