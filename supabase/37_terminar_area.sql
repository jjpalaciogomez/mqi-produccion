-- Terminar a mano todo el trabajo de un área en una OP (o la OP completa si no se indica área)
drop function if exists public.terminar_op(uuid, text);
create or replace function public.terminar_op(p_orden uuid, p_nota text default null, p_area text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_hoy date := (now() at time zone 'America/Bogota')::date;
begin
  if not public.es_gestor() then return 'Sin permiso'; end if;
  if not exists (select 1 from ordenes where id = p_orden) then return 'No existe la OP'; end if;
  -- Cierra los tiempos abiertos de lo que se termina
  update registros r set fin = now() from tareas t
   where r.tarea_id = t.id and t.orden_id = p_orden and r.fin is null and (p_area is null or t.area = p_area);
  update tareas set estado = 'omitida', omitida_por_cierre = true
   where orden_id = p_orden and estado in ('pendiente', 'en_curso', 'pausada') and (p_area is null or area = p_area);
  delete from programacion where orden_id = p_orden and fecha >= v_hoy and (p_area is null or area = p_area);
  if p_area is not null and nullif(trim(p_nota), '') is not null then
    update ordenes set cierre_nota = concat_ws(E'\n', cierre_nota, p_area || ': ' || trim(p_nota)) where id = p_orden;
  end if;
  -- Si ya no queda nada por hacer en ninguna área, la OP queda terminada
  if p_area is null or not exists (select 1 from tareas where orden_id = p_orden and estado not in ('terminada', 'omitida')) then
    update ordenes set estado = 'terminada', fecha_entrega_real = coalesce(fecha_entrega_real, v_hoy), cierre_manual = true,
      cierre_nota = case when p_area is null then coalesce(nullif(trim(p_nota), ''), cierre_nota) else cierre_nota end
     where id = p_orden;
  end if;
  return 'ok';
end $$;
revoke execute on function public.terminar_op(uuid, text, text) from public, anon;
grant execute on function public.terminar_op(uuid, text, text) to authenticated;

drop function if exists public.reabrir_op(uuid);
create or replace function public.reabrir_op(p_orden uuid, p_area text default null)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.es_gestor() then return 'Sin permiso'; end if;
  update tareas set estado = 'pendiente', omitida_por_cierre = false
   where orden_id = p_orden and omitida_por_cierre and (p_area is null or area = p_area);
  update ordenes set estado = 'en_planta', fecha_entrega_real = null,
    cierre_manual = exists (select 1 from tareas where orden_id = p_orden and omitida_por_cierre),
    cierre_nota = case when p_area is null then null else cierre_nota end
   where id = p_orden and (estado = 'terminada' or p_area is not null);
  return 'ok';
end $$;
revoke execute on function public.reabrir_op(uuid, text) from public, anon;
grant execute on function public.reabrir_op(uuid, text) to authenticated;
