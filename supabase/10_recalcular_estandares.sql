-- 10: aplicar los estándares vigentes a OPs ya cargadas.
-- Recalcula los pasos que NO están terminados (los terminados conservan el estándar con que se hicieron).
-- p_orden = una OP; si es NULL, todas las OPs abiertas (borrador o en planta). Devuelve cuántos ítems recalculó.
create or replace function public.recalcular_estandares(p_orden uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare i record; c record; n int := 0;
begin
  if not public.es_gestor() then raise exception 'Sin permiso'; end if;
  for i in
    select it.id from items it join ordenes o on o.id = it.orden_id
    where (p_orden is not null and o.id = p_orden) or (p_orden is null and o.estado in ('borrador','en_planta'))
  loop
    for c in select id from componentes where item_id = i.id loop perform public._sync_componente(c.id); end loop;
    perform public._sync_ensamble(i.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.recalcular_estandares(uuid) from public, anon;
grant execute on function public.recalcular_estandares(uuid) to authenticated;
