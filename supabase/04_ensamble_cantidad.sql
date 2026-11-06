-- 04: el ensamble final toma la cantidad del ítem (8 mesas = 8 ensambles)
create or replace function public.generar_ensamble(p_item uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_orden uuid; v_id uuid; v_area text; v_cant numeric;
begin
  if not public.es_gestor() then raise exception 'Sin permiso'; end if;
  select orden_id, coalesce(area_ensamble,'ENSAMBLE FINAL'), cantidad into v_orden, v_area, v_cant from items where id = p_item;
  select id into v_id from tareas where item_id = p_item and componente_id is null;
  if v_id is null then
    insert into tareas (orden_id, item_id, componente_id, paso, proceso, area, unidad, cantidad, tiempo_std_unit)
    select v_orden, p_item, null, 999, 'ENS-1', v_area, p.unidad, v_cant, p.tiempo_std_min
    from procesos p where p.codigo = 'ENS-1'
    returning id into v_id;
  else
    update tareas set area = v_area where id = v_id;
  end if;
  return v_id;
end $$;
update tareas t set cantidad = i.cantidad from items i where t.item_id = i.id and t.componente_id is null and t.estado = 'pendiente';
