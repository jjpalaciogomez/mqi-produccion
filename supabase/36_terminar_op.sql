-- Terminar una OP a mano desde el tablero (OPs que se terminaron sin registrar todos los tiempos).
-- Los pasos sin terminar quedan como "omitidos por cierre" (no cuentan en indicadores) y se pueden recuperar al reabrir.
alter table public.ordenes add column if not exists cierre_manual boolean not null default false;
alter table public.ordenes add column if not exists cierre_nota text;
alter table public.tareas add column if not exists omitida_por_cierre boolean not null default false;

create or replace function public.terminar_op(p_orden uuid, p_nota text default null)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.es_gestor() then return 'Sin permiso'; end if;
  if not exists (select 1 from ordenes where id = p_orden) then return 'No existe la OP'; end if;
  -- Cierra los tiempos que hayan quedado abiertos
  update registros r set fin = now() from tareas t where r.tarea_id = t.id and t.orden_id = p_orden and r.fin is null;
  update tareas set estado = 'omitida', omitida_por_cierre = true where orden_id = p_orden and estado in ('pendiente', 'en_curso', 'pausada');
  -- Lo programado de hoy en adelante ya no hace falta
  delete from programacion where orden_id = p_orden and fecha >= (now() at time zone 'America/Bogota')::date;
  update ordenes set estado = 'terminada', fecha_entrega_real = coalesce(fecha_entrega_real, (now() at time zone 'America/Bogota')::date),
    cierre_manual = true, cierre_nota = nullif(trim(p_nota), '') where id = p_orden;
  return 'ok';
end $$;
revoke execute on function public.terminar_op(uuid, text) from public, anon;
grant execute on function public.terminar_op(uuid, text) to authenticated;

create or replace function public.reabrir_op(p_orden uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.es_gestor() then return 'Sin permiso'; end if;
  update tareas set estado = 'pendiente', omitida_por_cierre = false where orden_id = p_orden and omitida_por_cierre;
  update ordenes set estado = 'en_planta', fecha_entrega_real = null, cierre_manual = false, cierre_nota = null where id = p_orden;
  return 'ok';
end $$;
revoke execute on function public.reabrir_op(uuid) from public, anon;
grant execute on function public.reabrir_op(uuid) to authenticated;
