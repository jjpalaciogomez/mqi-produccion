-- 08: corrección de registros de tiempo (solo Administrador y Dirección)

-- Recalcula cantidad hecha y estado de un paso después de corregir sus registros
create or replace function public._recalcular_tarea(p_tarea uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int; s numeric; v_orden uuid;
begin
  select count(*), sum(cantidad) into n, s from registros where tarea_id = p_tarea and motivo_pausa is null;
  update tareas set cantidad_hecha = s,
         estado = case when n = 0 and estado in ('en_curso','pausada','terminada') then 'pendiente' else estado end
  where id = p_tarea returning orden_id into v_orden;
  -- Una OP que se cerró sola vuelve a planta si algún paso deja de estar terminado
  if v_orden is not null and exists (select 1 from tareas where orden_id = v_orden and estado not in ('terminada','omitida')) then
    update ordenes set estado = 'en_planta', fecha_entrega_real = null where id = v_orden and estado = 'terminada';
  end if;
end $$;

-- Borra un registro, o todo el "registro de proyecto" al que pertenece. Devuelve cuántos borró.
create or replace function public.eliminar_registro(p_registro uuid, p_todo_el_lote boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare v_lote uuid; v_tareas uuid[]; t uuid;
begin
  if not public.es_gestor() then raise exception 'Solo Administración o Dirección pueden corregir registros'; end if;
  select lote into v_lote from registros where id = p_registro;
  with b as (
    delete from registros
    where id = p_registro or (p_todo_el_lote and v_lote is not null and lote = v_lote)
    returning tarea_id)
  select array_agg(distinct tarea_id) into v_tareas from b;
  if v_tareas is null then return 0; end if;
  foreach t in array v_tareas loop perform public._recalcular_tarea(t); end loop;
  return coalesce(array_length(v_tareas, 1), 0);
end $$;

-- Corrige minutos y cantidad de un registro
create or replace function public.editar_registro(p_registro uuid, p_minutos numeric, p_cantidad numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_tarea uuid;
begin
  if not public.es_gestor() then raise exception 'Solo Administración o Dirección pueden corregir registros'; end if;
  if p_minutos is null or p_minutos <= 0 or p_minutos > 960 then raise exception 'El tiempo debe estar entre 1 minuto y 16 horas'; end if;
  if p_cantidad is not null and p_cantidad < 0 then raise exception 'La cantidad no puede ser negativa'; end if;
  update registros set minutos = p_minutos, cantidad = p_cantidad where id = p_registro returning tarea_id into v_tarea;
  if v_tarea is null then raise exception 'Registro no encontrado'; end if;
  perform public._recalcular_tarea(v_tarea);
end $$;

-- Reabre un paso marcado como terminado (queda en proceso, o pendiente si no tiene registros)
create or replace function public.reabrir_tarea(p_tarea uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_gestor() then raise exception 'Solo Administración o Dirección pueden reabrir pasos'; end if;
  update tareas set estado = case when exists (select 1 from registros where tarea_id = p_tarea and motivo_pausa is null)
                                  then 'en_curso' else 'pendiente' end
  where id = p_tarea and estado = 'terminada';
  perform public._recalcular_tarea(p_tarea);
end $$;

revoke execute on function public._recalcular_tarea(uuid) from public, anon, authenticated;
revoke execute on function public.eliminar_registro(uuid, boolean) from public, anon;
revoke execute on function public.editar_registro(uuid, numeric, numeric) from public, anon;
revoke execute on function public.reabrir_tarea(uuid) from public, anon;
grant execute on function public.eliminar_registro(uuid, boolean) to authenticated;
grant execute on function public.editar_registro(uuid, numeric, numeric) to authenticated;
grant execute on function public.reabrir_tarea(uuid) to authenticated;
