-- 07: registro por PROCESO con estándar por producto
--  · Cada paso de la ruta tiene sus minutos para una unidad del tamaño de referencia (dificultad media).
--    El estándar del producto en un área = suma de sus procesos. En pasos de terceros el valor son días.
--  · El ensamble final existe solo si el ítem es multiárea (productos de 2 o más familias) y tiene dificultad.
--  · Registro de un proceso para todo el proyecto: el tiempo se reparte entre los ítems según su estándar.

alter table public.rutas add column if not exists min_ref numeric check (min_ref is null or min_ref >= 0);
alter table public.items add column if not exists dificultad_ensamble text not null default 'MEDIO' references public.dificultades(nivel);
alter table public.registros add column if not exists lote uuid;

-- Minutos de referencia por proceso (derivados de los estándares por proceso v5)
update public.rutas set min_ref = 3.6 where producto = 'MAD-P1' and proceso = 'MAD-1';
update public.rutas set min_ref = 7.2 where producto = 'MAD-P1' and proceso = 'MAD-2';
update public.rutas set min_ref = 3.6 where producto = 'MAD-P2' and proceso = 'MAD-1';
update public.rutas set min_ref = 21.6 where producto = 'MAD-P2' and proceso = 'MAD-4';
update public.rutas set min_ref = 7.2 where producto = 'MAD-P2' and proceso = 'MAD-2';
update public.rutas set min_ref = 18 where producto = 'MAD-P2' and proceso = 'MAD-3';
update public.rutas set min_ref = 2.4 where producto = 'MAD-P3' and proceso = 'MAD-1';
update public.rutas set min_ref = 6 where producto = 'MAD-P3' and proceso = 'MAD-5';
update public.rutas set min_ref = 12 where producto = 'MAD-P3' and proceso = 'MAD-3';
update public.rutas set min_ref = 20 where producto = 'MAD-P3' and proceso = 'PINT-4';
update public.rutas set min_ref = 18.5 where producto = 'MAD-P4' and proceso = 'MAD-1';
update public.rutas set min_ref = 13.1 where producto = 'MAD-P4' and proceso = 'MAD-2';
update public.rutas set min_ref = 70 where producto = 'MAD-P4' and proceso = 'MAD-6';
update public.rutas set min_ref = 24 where producto = 'MET-P1' and proceso = 'MET-1';
update public.rutas set min_ref = 38.4 where producto = 'MET-P1' and proceso = 'MET-4';
update public.rutas set min_ref = 25.6 where producto = 'MET-P1' and proceso = 'MET-5';
update public.rutas set min_ref = 20 where producto = 'MET-P1' and proceso = 'PINT-4';
update public.rutas set min_ref = 8 where producto = 'MET-P1' and proceso = 'TER-1';
update public.rutas set min_ref = 24 where producto = 'MET-P2' and proceso = 'MET-1';
update public.rutas set min_ref = 36 where producto = 'MET-P2' and proceso = 'MET-6';
update public.rutas set min_ref = 38.4 where producto = 'MET-P2' and proceso = 'MET-4';
update public.rutas set min_ref = 25.6 where producto = 'MET-P2' and proceso = 'MET-5';
update public.rutas set min_ref = 20 where producto = 'MET-P2' and proceso = 'PINT-4';
update public.rutas set min_ref = 8 where producto = 'MET-P2' and proceso = 'TER-1';
update public.rutas set min_ref = 3.6 where producto = 'MET-P3' and proceso = 'MET-3';
update public.rutas set min_ref = 15 where producto = 'MET-P3' and proceso = 'MET-4';
update public.rutas set min_ref = 10 where producto = 'MET-P3' and proceso = 'MET-5';
update public.rutas set min_ref = 20 where producto = 'MET-P3' and proceso = 'PINT-4';
update public.rutas set min_ref = 8 where producto = 'MET-P3' and proceso = 'TER-1';
update public.rutas set min_ref = 60 where producto = 'MET-P4' and proceso = 'MET-1';
update public.rutas set min_ref = 28.8 where producto = 'MET-P4' and proceso = 'MET-2';
update public.rutas set min_ref = 21.6 where producto = 'MET-P4' and proceso = 'MET-3';
update public.rutas set min_ref = 76.8 where producto = 'MET-P4' and proceso = 'MET-4';
update public.rutas set min_ref = 51.2 where producto = 'MET-P4' and proceso = 'MET-5';
update public.rutas set min_ref = 40 where producto = 'MET-P4' and proceso = 'PINT-4';
update public.rutas set min_ref = 8 where producto = 'MET-P4' and proceso = 'TER-1';
update public.rutas set min_ref = 1.5 where producto = 'ACR-P1' and proceso = 'GF-3';
update public.rutas set min_ref = 2.5 where producto = 'ACR-P1' and proceso = 'AC-1';
update public.rutas set min_ref = 15 where producto = 'ACR-P1' and proceso = 'AC-2';
update public.rutas set min_ref = 17 where producto = 'ACR-P2' and proceso = 'GF-3';
update public.rutas set min_ref = 10 where producto = 'ACR-P2' and proceso = 'AC-1';
update public.rutas set min_ref = 10 where producto = 'ACR-P2' and proceso = 'AC-3';
update public.rutas set min_ref = 15 where producto = 'ACR-P2' and proceso = 'AC-2';
update public.rutas set min_ref = 6 where producto = 'ACR-P3' and proceso = 'GF-3';
update public.rutas set min_ref = 10 where producto = 'ACR-P3' and proceso = 'AC-3';
update public.rutas set min_ref = 15 where producto = 'ACR-P3' and proceso = 'AC-2';
update public.rutas set min_ref = 15 where producto = 'ACR-P4' and proceso = 'AC-2';
update public.rutas set min_ref = 6 where producto = 'GF-P1' and proceso = 'GF-1';
update public.rutas set min_ref = 3 where producto = 'GF-P1' and proceso = 'GF-2';
update public.rutas set min_ref = 4 where producto = 'GF-P1' and proceso = 'GF-6';
update public.rutas set min_ref = 6 where producto = 'GF-P2' and proceso = 'GF-1';
update public.rutas set min_ref = 3 where producto = 'GF-P2' and proceso = 'GF-2';
update public.rutas set min_ref = 8 where producto = 'GF-P2' and proceso = 'GF-7';
update public.rutas set min_ref = 8 where producto = 'GF-P3' and proceso = 'GF-7';
update public.rutas set min_ref = 6 where producto = 'GF-P4' and proceso = 'GF-1';
update public.rutas set min_ref = 4 where producto = 'GF-P4' and proceso = 'GF-6';
update public.rutas set min_ref = 5 where producto = 'GF-P4' and proceso = 'GF-4';
update public.rutas set min_ref = 6 where producto = 'GF-P5' and proceso = 'GF-1';
update public.rutas set min_ref = 4 where producto = 'GF-P5' and proceso = 'GF-6';
update public.rutas set min_ref = 8 where producto = 'GF-P5' and proceso = 'GF-7';
update public.rutas set min_ref = 25 where producto = 'GF-P5' and proceso = 'GF-3';
update public.rutas set min_ref = 6 where producto = 'GF-P6' and proceso = 'GF-1';
update public.rutas set min_ref = 3 where producto = 'GF-P6' and proceso = 'GF-2';
update public.rutas set min_ref = 8 where producto = 'GF-P6' and proceso = 'GF-5';
update public.rutas set min_ref = 4 where producto = 'GF-P6' and proceso = 'GF-6';
update public.rutas set min_ref = 25 where producto = 'GF-P7' and proceso = 'GF-3';
update public.rutas set min_ref = 8 where producto = 'GF-P7' and proceso = 'GF-5';
update public.rutas set min_ref = 20 where producto = 'GF-P7' and proceso = 'PINT-4';
update public.rutas set min_ref = 25 where producto = 'GF-P8' and proceso = 'GF-3';
update public.rutas set min_ref = 60 where producto = 'ENS-P1' and proceso = 'ENS-1';
update public.rutas set min_ref = 60 where producto = 'ENS-P2' and proceso = 'ENS-1';
update public.rutas set min_ref = 8 where producto = 'SER-P2' and proceso = 'TER-1';

-- El ensamble ya no es un producto: se crea solo en ítems multiárea
update public.productos set activo = false where codigo in ('ENS-P1','ENS-P2');

-- Reemplaza el modelo por etapas de la versión 06
drop view if exists public.v_estandar_producto;
drop function if exists public.std_unidad(text, text, numeric, numeric, numeric, text);
drop table if exists public.etapas_producto;

-- ---------- CÁLCULO ----------
create or replace function public.std_ruta(p_ruta bigint, p_ancho numeric, p_prof numeric, p_alto numeric, p_dificultad text)
returns numeric language sql stable set search_path = public as $$
  select case when pr.area = 'TERCEROS' then ru.min_ref
    else round((ru.min_ref * d.multiplicador *
      case when p.medida = 'UNIDAD' then 1
           else p.fraccion_fija + (1 - p.fraccion_fija)
                * public.tamano(p.medida, p_ancho, p_prof, p_alto)
                / nullif(public.tamano(p.medida, p.ref_ancho, p.ref_prof, p.ref_alto), 0) end)::numeric, 2) end
  from rutas ru
  join productos p on p.codigo = ru.producto
  join procesos pr on pr.codigo = ru.proceso
  join dificultades d on d.nivel = coalesce(p_dificultad, 'MEDIO')
  where ru.id = p_ruta
$$;

-- Pasos de un producto dentro de un ítem (uno por proceso de la ruta). Se puede repetir: actualiza sin duplicar.
create or replace function public._sync_componente(p_componente uuid) returns int
language plpgsql security definer set search_path = public as $$
declare c record; r record; n int := 0; v_id uuid; v_und numeric;
begin
  select co.*, i.orden_id, i.cantidad as item_cant into c
  from componentes co join items i on i.id = co.item_id where co.id = p_componente;
  if not found then return 0; end if;
  v_und := coalesce(c.cantidad, 1) * coalesce(c.item_cant, 1);

  delete from tareas t where t.componente_id = p_componente and t.estado in ('pendiente','omitida')
    and not exists (select 1 from rutas x where x.producto = c.producto and x.paso = t.paso and x.proceso = t.proceso);

  for r in
    select ru.*, pr.area, row_number() over (partition by ru.paso order by ru.id) as orden_alt
    from rutas ru join procesos pr on pr.codigo = ru.proceso
    where ru.producto = c.producto order by ru.paso, ru.id
  loop
    select id into v_id from tareas where componente_id = p_componente and paso = r.paso and proceso = r.proceso;
    if v_id is null then
      insert into tareas (orden_id, item_id, componente_id, paso, proceso, area, unidad, cantidad,
                          tiempo_std_unit, opcional, alternativa, estado)
      values (c.orden_id, c.item_id, p_componente, r.paso, r.proceso, r.area, 'UND', v_und,
              public.std_ruta(r.id, c.ancho, c.profundidad, c.alto, c.dificultad), r.opcional, r.alternativa,
              case when (not r.alternativa) or r.orden_alt = 1 then 'pendiente' else 'omitida' end);
    else
      update tareas set cantidad = v_und, area = r.area, opcional = r.opcional, alternativa = r.alternativa,
             tiempo_std_unit = public.std_ruta(r.id, c.ancho, c.profundidad, c.alto, c.dificultad)
      where id = v_id and estado <> 'terminada';
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Ensamble final: solo si el ítem tiene productos de 2 o más familias
create or replace function public._sync_ensamble(p_item uuid) returns void
language plpgsql security definer set search_path = public as $$
declare it record; n int; v_id uuid; v_est text; v_area text; v_std numeric;
begin
  select * into it from items where id = p_item;
  if not found then return; end if;
  select count(distinct p.familia) into n from componentes c join productos p on p.codigo = c.producto where c.item_id = p_item;
  select id, estado into v_id, v_est from tareas where item_id = p_item and componente_id is null;
  if n >= 2 then
    v_area := it.area_ensamble;
    if v_area is null or v_area = 'ENSAMBLE FINAL' then
      select p.familia into v_area from componentes c join productos p on p.codigo = c.producto
      where c.item_id = p_item and p.familia in ('METAL','MADERA','ACRILICO','GRAN FORMATO')
      order by case p.familia when 'METAL' then 1 when 'MADERA' then 2 else 3 end limit 1;
      v_area := coalesce(v_area, 'METAL');
      update items set area_ensamble = v_area where id = p_item;
    end if;
    select pr.tiempo_std_min * d.multiplicador into v_std
    from procesos pr, dificultades d where pr.codigo = 'ENS-1' and d.nivel = coalesce(it.dificultad_ensamble, 'MEDIO');
    if v_id is null then
      insert into tareas (orden_id, item_id, componente_id, paso, proceso, area, unidad, cantidad, tiempo_std_unit)
      values (it.orden_id, p_item, null, 999, 'ENS-1', v_area, 'UND', it.cantidad, v_std);
    else
      update tareas set area = v_area, cantidad = it.cantidad, tiempo_std_unit = v_std where id = v_id and estado <> 'terminada';
    end if;
  elsif v_id is not null and v_est in ('pendiente','omitida') then
    delete from tareas where id = v_id;
  end if;
end $$;

-- Recalcula todos los pasos de un ítem (después de agregar, editar o quitar productos, o editar el ítem)
create or replace function public.sincronizar_item(p_item uuid) returns int
language plpgsql security definer set search_path = public as $$
declare c record; n int := 0;
begin
  if not public.es_gestor() then raise exception 'Sin permiso'; end if;
  for c in select id from componentes where item_id = p_item loop
    n := n + public._sync_componente(c.id);
  end loop;
  perform public._sync_ensamble(p_item);
  return n;
end $$;

-- Compatibilidad con la versión anterior de la app
create or replace function public.generar_tareas(p_componente uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_item uuid;
begin
  if not public.es_gestor() then raise exception 'Sin permiso'; end if;
  select item_id into v_item from componentes where id = p_componente;
  return public.sincronizar_item(v_item);
end $$;
create or replace function public.generar_ensamble(p_item uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_gestor() then raise exception 'Sin permiso'; end if;
  perform public._sync_ensamble(p_item);
  return (select id from tareas where item_id = p_item and componente_id is null);
end $$;

-- Al quitar un producto, el ensamble se revisa solo
create or replace function public._tg_componente_borrado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public._sync_ensamble(old.item_id);
  return old;
end $$;
drop trigger if exists componente_borrado on public.componentes;
create trigger componente_borrado after delete on public.componentes
  for each row execute function public._tg_componente_borrado();

-- ---------- REGISTRO DE UN PROCESO PARA TODO EL PROYECTO ----------
-- Reparte los minutos entre las tareas disponibles de ese proceso en la OP, en proporción a su estándar.
create or replace function public.registrar_proyecto(p_orden uuid, p_proceso text, p_persona uuid, p_minutos numeric,
  p_termino boolean, p_obs text default null) returns text
language plpgsql security definer set search_path = public as $$
declare v_lote uuid := gen_random_uuid(); v_total numeric; v_n int; r record; v_parte numeric;
begin
  if coalesce(public.mi_rol(),'') not in ('tablet','admin','direccion') then return 'Sin permiso'; end if;
  if not exists (select 1 from personas where id = p_persona and activo) then return 'Persona no encontrada'; end if;
  if p_minutos is null or p_minutos <= 0 or p_minutos > 960 then return 'Escribe el tiempo trabajado (entre 1 minuto y 16 horas)'; end if;

  create temp table _el on commit drop as
    select t.id, t.cantidad, t.cantidad_registrada, coalesce(t.cantidad,0) * coalesce(t.tiempo_std_unit,0) as std
    from v_tareas t
    where t.orden_id = p_orden and t.proceso = p_proceso
      and t.estado in ('pendiente','en_curso','pausada') and not (t.estado = 'pendiente' and t.bloqueada)
      and (public.mi_rol() <> 'tablet' or public.mi_area() is null or t.area in (public.mi_area(), 'PINTURA'));
  select count(*), sum(std) into v_n, v_total from _el;
  if v_n = 0 then return 'No hay tareas de este proceso disponibles en el proyecto'; end if;

  for r in select * from _el loop
    v_parte := case when v_total > 0 then p_minutos * r.std / v_total else p_minutos / v_n end;
    insert into registros (tarea_id, persona_id, inicio, fin, minutos, cantidad, observacion, lote)
    values (r.id, p_persona, now(), now(), greatest(round(v_parte, 2), 0.01),
            case when p_termino and r.cantidad is not null then greatest(r.cantidad - r.cantidad_registrada, 0) end,
            p_obs, v_lote);
    update tareas set estado = case when p_termino then 'terminada' else 'en_curso' end,
           cantidad_hecha = (select sum(cantidad) from registros where tarea_id = r.id and motivo_pausa is null)
    where id = r.id;
  end loop;

  update ordenes set estado = 'en_planta' where id = p_orden and estado = 'borrador';
  if p_termino and not exists (select 1 from tareas where orden_id = p_orden and estado not in ('terminada','omitida')) then
    update ordenes set estado = 'terminada', fecha_entrega_real = coalesce(fecha_entrega_real, current_date) where id = p_orden;
  end if;
  return null;
end $$;

-- ---------- VISTAS ----------
drop view if exists public.v_tareas;
create view public.v_tareas with (security_invoker = on) as
select t.*,
  o.numero as op_numero, o.cliente, o.proyecto, o.fecha_compromiso, o.prioridad, o.estado as op_estado,
  i.descripcion as item_descripcion, i.numero as item_numero,
  c.producto, coalesce(pr.nombre, pd.nombre) as proceso_nombre,
  coalesce(t.cantidad,0) * coalesce(t.tiempo_std_unit,0) as min_std,
  (select coalesce(sum(coalesce(r.minutos, extract(epoch from (coalesce(r.fin, now()) - r.inicio))/60)),0)
     from registros r where r.tarea_id = t.id and r.motivo_pausa is null) as min_reales,
  case
    when t.estado in ('terminada','omitida','en_curso','pausada') then false
    when t.componente_id is not null then exists (
      select 1 from tareas p where p.componente_id = t.componente_id and p.paso < t.paso
        and p.estado not in ('terminada','omitida'))
    else exists (
      select 1 from tareas p where p.item_id = t.item_id and p.componente_id is not null
        and p.estado not in ('terminada','omitida'))
  end as bloqueada,
  (select coalesce(sum(r.cantidad),0) from registros r where r.tarea_id = t.id and r.motivo_pausa is null) as cantidad_registrada,
  c.ancho, c.profundidad, c.alto, c.dificultad, pd.medida, c.descripcion as componente_detalle,
  pd.nombre as producto_nombre, pd.familia,
  case when t.componente_id is null then i.dificultad_ensamble end as dificultad_ensamble,
  (select string_agg(distinct split_part(pe.nombre, ' ', 1), ', ')
     from registros r join personas pe on pe.id = r.persona_id
     where r.tarea_id = t.id and r.motivo_pausa is null) as personas
from tareas t
join ordenes o on o.id = t.orden_id
join items i on i.id = t.item_id
left join componentes c on c.id = t.componente_id
left join productos pd on pd.codigo = c.producto
left join procesos pr on pr.codigo = t.proceso;
revoke all on public.v_tareas from anon;
grant select on public.v_tareas to authenticated;

-- Estándar real por producto y área (suma de sus procesos) y referencia sugerida
create view public.v_estandar_producto with (security_invoker = on) as
with x as (
  select c.producto, t.area, t.id,
         least(coalesce(t.cantidad_hecha, t.cantidad), t.cantidad) * t.tiempo_std_unit as min_std,
         sum(coalesce(r.minutos, extract(epoch from (r.fin - r.inicio))/60)) as min_reales
  from tareas t
  join componentes c on c.id = t.componente_id
  join registros r on r.tarea_id = t.id and r.motivo_pausa is null and (r.minutos is not null or r.fin is not null)
  where t.estado = 'terminada' and t.area <> 'TERCEROS' and t.tiempo_std_unit > 0 and t.cantidad > 0
  group by c.producto, t.area, t.id, t.cantidad, t.cantidad_hecha, t.tiempo_std_unit),
ref as (
  select ru.producto, pr.area, sum(ru.min_ref) as min_ref
  from (select ru.*, row_number() over (partition by ru.producto, ru.paso order by ru.id) as n from rutas ru) ru
  join procesos pr on pr.codigo = ru.proceso
  where not ru.opcional and (not ru.alternativa or ru.n = 1)
  group by ru.producto, pr.area)
select x.producto, p.nombre, x.area, ref.min_ref,
  count(*) as tareas_medidas,
  round(sum(x.min_std)::numeric, 1) as min_std, round(sum(x.min_reales)::numeric, 1) as min_reales,
  round((sum(x.min_reales) / nullif(sum(x.min_std),0))::numeric, 3) as razon,
  round((ref.min_ref * sum(x.min_reales) / nullif(sum(x.min_std),0))::numeric, 1) as min_ref_sugerido
from x join productos p on p.codigo = x.producto
left join ref on ref.producto = x.producto and ref.area = x.area
group by x.producto, p.nombre, x.area, ref.min_ref;
revoke all on public.v_estandar_producto from anon;
grant select on public.v_estandar_producto to authenticated;

-- Aplica el estándar real: escala todos los procesos de ese producto en esa área
create or replace function public.aplicar_estandar(p_producto text, p_area text, p_factor numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_gestor() then raise exception 'Sin permiso'; end if;
  if p_factor is null or p_factor <= 0 or p_factor > 10 then raise exception 'Factor no válido'; end if;
  update rutas set min_ref = round(min_ref * p_factor, 2)
  where producto = p_producto and min_ref is not null
    and proceso in (select codigo from procesos where area = p_area);
end $$;

-- Pasos ya creados con el modelo por etapas (06): se rehacen por proceso
delete from public.tareas where proceso is null and estado in ('pendiente','omitida');
do $$ declare c record; i record;
begin
  for c in select id from public.componentes loop perform public._sync_componente(c.id); end loop;
  for i in select id from public.items loop perform public._sync_ensamble(i.id); end loop;
end $$;

-- Permisos de funciones
revoke execute on function public._sync_componente(uuid) from public, anon, authenticated;
revoke execute on function public._sync_ensamble(uuid) from public, anon, authenticated;
revoke execute on function public._tg_componente_borrado() from public, anon, authenticated;
revoke execute on function public.std_ruta(bigint, numeric, numeric, numeric, text) from public, anon;
revoke execute on function public.sincronizar_item(uuid) from public, anon;
revoke execute on function public.registrar_proyecto(uuid, text, uuid, numeric, boolean, text) from public, anon;
revoke execute on function public.aplicar_estandar(text, text, numeric) from public, anon;
grant execute on function public.std_ruta(bigint, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.sincronizar_item(uuid) to authenticated;
grant execute on function public.registrar_proyecto(uuid, text, uuid, numeric, boolean, text) to authenticated;
grant execute on function public.aplicar_estandar(text, text, numeric) to authenticated;
