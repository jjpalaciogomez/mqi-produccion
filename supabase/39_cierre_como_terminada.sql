-- Terminar OP / área a mano: los pasos quedan TERMINADOS (suman al avance del proyecto).
-- La marca omitida_por_cierre (= "cerrado a mano") los saca del cálculo de estándares reales y permite reabrirlos.
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
  update tareas set estado = 'terminada', omitida_por_cierre = true, cantidad_hecha = coalesce(cantidad_hecha, cantidad)
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
  update tareas set estado = 'pendiente', omitida_por_cierre = false, cantidad_hecha = null
   where orden_id = p_orden and omitida_por_cierre and (p_area is null or area = p_area);
  update ordenes set estado = 'en_planta', fecha_entrega_real = null,
    cierre_manual = exists (select 1 from tareas where orden_id = p_orden and omitida_por_cierre),
    cierre_nota = case when p_area is null then null else cierre_nota end
   where id = p_orden and (estado = 'terminada' or p_area is not null);
  return 'ok';
end $$;
revoke execute on function public.reabrir_op(uuid, text) from public, anon;
grant execute on function public.reabrir_op(uuid, text) to authenticated;

-- Lo que ya se había cerrado a mano como omitido pasa a terminado
update public.tareas set estado = 'terminada', cantidad_hecha = coalesce(cantidad_hecha, cantidad) where omitida_por_cierre and estado = 'omitida';

-- Los pasos cerrados a mano no tienen tiempos reales completos: no entran en el estándar real por producto
create or replace view public.v_estandar_producto with (security_invoker = on) as
with x as (
  select c.producto, t.area, t.id,
         least(coalesce(t.cantidad_hecha, t.cantidad), t.cantidad) * t.tiempo_std_unit as min_std,
         sum(coalesce(r.minutos, extract(epoch from (r.fin - r.inicio))/60)) as min_reales
  from tareas t
  join componentes c on c.id = t.componente_id
  join procesos pp on pp.codigo = t.proceso and not pp.es_maquina
  join registros r on r.tarea_id = t.id and r.motivo_pausa is null and (r.minutos is not null or r.fin is not null)
  where t.estado = 'terminada' and not t.omitida_por_cierre and t.area <> 'TERCEROS' and t.tiempo_std_unit > 0 and t.cantidad > 0
  group by c.producto, t.area, t.id, t.cantidad, t.cantidad_hecha, t.tiempo_std_unit),
ref as (
  select ru.producto, pr.area, sum(ru.min_ref) as min_ref
  from (select ru.*, row_number() over (partition by ru.producto, ru.paso order by ru.id) as n from rutas ru) ru
  join procesos pr on pr.codigo = ru.proceso
  where not ru.opcional and (not ru.alternativa or ru.n = 1) and not pr.es_maquina
  group by ru.producto, pr.area)
select x.producto, p.nombre, x.area, ref.min_ref,
  count(*) as tareas_medidas,
  round(sum(x.min_std)::numeric, 1) as min_std, round(sum(x.min_reales)::numeric, 1) as min_reales,
  round((sum(x.min_reales) / nullif(sum(x.min_std),0))::numeric, 3) as razon,
  round((ref.min_ref * sum(x.min_reales) / nullif(sum(x.min_std),0))::numeric, 1) as min_ref_sugerido
from x join productos p on p.codigo = x.producto
left join ref on ref.producto = x.producto and ref.area = x.area
group by x.producto, p.nombre, x.area, ref.min_ref;
