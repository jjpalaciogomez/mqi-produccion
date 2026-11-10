-- 12: mover un ítem (con sus productos, pasos y registros) a otra OP. Solo Administración y Dirección.
create or replace function public.mover_item(p_item uuid, p_orden_destino uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_origen uuid; v_num int;
begin
  if not public.es_gestor() then raise exception 'Sin permiso'; end if;
  select orden_id into v_origen from items where id = p_item;
  if v_origen is null then raise exception 'Ítem no encontrado'; end if;
  if v_origen = p_orden_destino then raise exception 'El ítem ya está en esa OP'; end if;
  if not exists (select 1 from ordenes where id = p_orden_destino) then raise exception 'OP destino no encontrada'; end if;
  select coalesce(max(numero), 0) + 1 into v_num from items where orden_id = p_orden_destino;
  update items set orden_id = p_orden_destino, numero = v_num where id = p_item;
  update tareas set orden_id = p_orden_destino where item_id = p_item;
  -- Si el ítem ya tenía trabajo registrado, la OP destino queda en planta
  if exists (select 1 from tareas where item_id = p_item and estado <> 'pendiente' and estado <> 'omitida') then
    update ordenes set estado = 'en_planta' where id = p_orden_destino and estado = 'borrador';
  end if;
  update ordenes set estado = 'en_planta', fecha_entrega_real = null
  where id = p_orden_destino and estado = 'terminada'
    and exists (select 1 from tareas where orden_id = p_orden_destino and estado not in ('terminada','omitida'));
  return v_num;
end $$;
revoke execute on function public.mover_item(uuid, uuid) from public, anon;
grant execute on function public.mover_item(uuid, uuid) to authenticated;
