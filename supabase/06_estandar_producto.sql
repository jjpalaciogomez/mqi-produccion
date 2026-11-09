-- 06: estándares por PRODUCTO y ÁREA (ya no por proceso)
-- Cada producto tiene un tamaño de referencia y, por cada área de su ruta, los minutos que toma
-- una unidad de ese tamaño en dificultad media. El tiempo de cada ítem se escala con sus medidas:
--   minutos por unidad = min_ref × (fija + (1 − fija) × tamaño / tamaño_ref) × multiplicador de dificultad
-- tamaño: CM2 = ancho × alto (o ancho × profundidad si no hay alto); CM3 = ancho × profundidad × alto; UNIDAD = 1.

-- Se borra la OP de prueba (se creó con el modelo anterior)
delete from public.ordenes where numero = 'PRUEBA-001';

create table if not exists public.dificultades (
  nivel text primary key check (nivel in ('BAJO','MEDIO','ALTO')),
  nombre text not null,
  multiplicador numeric not null check (multiplicador > 0),
  orden int not null
);
insert into public.dificultades values ('BAJO','Baja',0.75,1), ('MEDIO','Media',1,2), ('ALTO','Alta',1.35,3)
on conflict (nivel) do nothing;

alter table public.productos
  add column if not exists medida text not null default 'UNIDAD' check (medida in ('CM2','CM3','UNIDAD')),
  add column if not exists ref_ancho numeric,
  add column if not exists ref_prof numeric,
  add column if not exists ref_alto numeric,
  add column if not exists ref_descripcion text,
  add column if not exists fraccion_fija numeric not null default 0.3 check (fraccion_fija between 0 and 1),
  add column if not exists std_fuente text;

create table if not exists public.etapas_producto (
  id bigint generated always as identity primary key,
  producto text not null references public.productos(codigo) on delete cascade,
  paso int not null,
  area text not null references public.areas(codigo),
  opcional boolean not null default false,
  alternativa boolean not null default false,
  min_ref numeric check (min_ref is null or min_ref >= 0),
  procesos text,
  unique (producto, paso, area)
);

alter table public.componentes
  add column if not exists ancho numeric check (ancho is null or ancho > 0),
  add column if not exists profundidad numeric check (profundidad is null or profundidad > 0),
  add column if not exists alto numeric check (alto is null or alto > 0),
  add column if not exists dificultad text not null default 'MEDIO' references public.dificultades(nivel);
comment on column public.componentes.cantidad is 'Unidades de este producto por cada unidad del ítem';

alter table public.tareas alter column proceso drop not null;

-- Seguridad de las tablas nuevas
alter table public.dificultades enable row level security;
alter table public.etapas_producto enable row level security;
drop policy if exists "lectura autenticados" on public.dificultades;
drop policy if exists "gestores escriben" on public.dificultades;
drop policy if exists "lectura autenticados" on public.etapas_producto;
drop policy if exists "gestores escriben" on public.etapas_producto;
create policy "lectura autenticados" on public.dificultades for select to authenticated using (true);
create policy "gestores escriben" on public.dificultades for all to authenticated using (public.es_gestor()) with check (public.es_gestor());
create policy "lectura autenticados" on public.etapas_producto for select to authenticated using (true);
create policy "gestores escriben" on public.etapas_producto for all to authenticated using (public.es_gestor()) with check (public.es_gestor());
revoke all on public.dificultades, public.etapas_producto from anon;

-- Datos: tamaño de referencia y estándar inicial por producto y área
delete from public.etapas_producto;
update public.productos set medida='CM2', ref_ancho=120, ref_prof=null, ref_alto=60, ref_descripcion='Repisa / tapa 120 × 60 cm', fraccion_fija=0.3, std_fuente='Derivado de estándares por proceso v5 — MADERA: corte 360 cm×0,01 + canto 360 cm×0,02' where codigo='MAD-P1';
update public.productos set medida='CM2', ref_ancho=120, ref_prof=null, ref_alto=60, ref_descripcion='Mesón en fórmica 120 × 60 cm', fraccion_fija=0.3, std_fuente='Derivado de estándares por proceso v5 — MADERA: corte 3,6 + fórmica 7.200 cm²×0,003 + canto 7,2' where codigo='MAD-P2';
update public.productos set medida='CM2', ref_ancho=60, ref_prof=null, ref_alto=60, ref_descripcion='Pieza ruteada 60 × 60 cm', fraccion_fija=0.3, std_fuente='Derivado de estándares por proceso v5 — MADERA: corte 2,4 + ruteado 240 cm×0,025 + canto manual 240 cm×0,05; PINTURA: 1 pieza × 20' where codigo='MAD-P3';
update public.productos set medida='CM3', ref_ancho=60, ref_prof=55, ref_alto=90, ref_descripcion='Módulo bajo 60 × 55 × 90 cm (7 piezas)', fraccion_fija=0.3, std_fuente='Derivado de estándares por proceso v5 — MADERA: corte 1.854 cm×0,01 + canto 657 cm×0,02 + ensamble 7 piezas×10' where codigo='MAD-P4';
update public.productos set medida='CM3', ref_ancho=120, ref_prof=60, ref_alto=72, ref_descripcion='Base de mesa 120 × 60 × 72 cm (8 tubos, 8 uniones)', fraccion_fija=0.3, std_fuente='Derivado de estándares por proceso v5 — METAL: 8 cortes×3 + soldadura 128 cm×0,3 + pulido 128 cm×0,2; PINTURA: 1 pieza × 20' where codigo='MET-P1';
update public.productos set medida='CM3', ref_ancho=120, ref_prof=60, ref_alto=72, ref_descripcion='Base curva 120 × 60 × 72 cm (2 tubos rolados)', fraccion_fija=0.3, std_fuente='Derivado de estándares por proceso v5 — METAL: base recta 88 + rolado 240 cm×0,15; PINTURA: 1 pieza × 20' where codigo='MET-P2';
update public.productos set medida='CM2', ref_ancho=60, ref_prof=null, ref_alto=40, ref_descripcion='Caja o tapa en lámina 60 × 40 cm', fraccion_fija=0.3, std_fuente='Derivado de estándares por proceso v5 — METAL: doblez 0,24 m²×15 + soldadura 50 cm×0,3 + pulido 50 cm×0,2; PINTURA: 1 pieza × 20' where codigo='MET-P3';
update public.productos set medida='CM3', ref_ancho=90, ref_prof=40, ref_alto=180, ref_descripcion='Estantería 90 × 40 × 180 cm, 4 entrepaños', fraccion_fija=0.3, std_fuente='Derivado de estándares por proceso v5 — METAL: 20 cortes×3 + lámina 1,44 m²×(20+15) + soldadura 256 cm×0,3 + pulido 256 cm×0,2; PINTURA: mueble grande ≈ 2 piezas × 20' where codigo='MET-P4';
update public.productos set medida='CM2', ref_ancho=30, ref_prof=null, ref_alto=20, ref_descripcion='Placa 30 × 20 cm', fraccion_fija=0.3, std_fuente='Derivado de estándares por proceso v5 — GRAN FORMATO: láser 0,06 m²×25; ACRILICO: canto 100 cm×0,025 + terminación 15' where codigo='ACR-P1';
update public.productos set medida='CM2', ref_ancho=60, ref_prof=null, ref_alto=40, ref_descripcion='Caja de luz 60 × 40 cm, 10 cm de fondo', fraccion_fija=0.3, std_fuente='Derivado de estándares por proceso v5 — GRAN FORMATO: láser 0,68 m²×25; ACRILICO: canto 400 cm×0,025 + iluminación 200 cm×0,05 + terminación 15' where codigo='ACR-P2';
update public.productos set medida='CM2', ref_ancho=60, ref_prof=null, ref_alto=40, ref_descripcion='Neón sobre base de 60 × 40 cm', fraccion_fija=0.3, std_fuente='Derivado de estándares por proceso v5 — GRAN FORMATO: láser base 0,24 m²×25; ACRILICO: neón 200 cm×0,05 + terminación 15' where codigo='ACR-P3';
update public.productos set medida='CM2', ref_ancho=20, ref_prof=null, ref_alto=15, ref_descripcion='Hablador 20 × 15 cm', fraccion_fija=0.3, std_fuente='Derivado de estándares por proceso v5 — ACRILICO: terminación 1 pieza × 15' where codigo='ACR-P4';
update public.productos set medida='CM2', ref_ancho=100, ref_prof=null, ref_alto=100, ref_descripcion='1 m² (100 × 100 cm)', fraccion_fija=0.15, std_fuente='Derivado de estándares por proceso v5 — GRAN FORMATO: imprimir 6 + laminar 3 + refilar 4 por m²' where codigo='GF-P1';
update public.productos set medida='CM2', ref_ancho=100, ref_prof=null, ref_alto=100, ref_descripcion='1 m² (100 × 100 cm)', fraccion_fija=0.15, std_fuente='Derivado de estándares por proceso v5 — GRAN FORMATO: imprimir 6 + laminar 3 + plóter 8 por m²' where codigo='GF-P2';
update public.productos set medida='CM2', ref_ancho=100, ref_prof=null, ref_alto=100, ref_descripcion='1 m² (100 × 100 cm)', fraccion_fija=0.15, std_fuente='Derivado de estándares por proceso v5 — GRAN FORMATO: plóter 8 por m²' where codigo='GF-P3';
update public.productos set medida='CM2', ref_ancho=100, ref_prof=null, ref_alto=100, ref_descripcion='1 m² (100 × 100 cm)', fraccion_fija=0.15, std_fuente='Derivado de estándares por proceso v5 — GRAN FORMATO: imprimir 6 + refilar 4 + ensamblar 5 por m²' where codigo='GF-P4';
update public.productos set medida='CM2', ref_ancho=100, ref_prof=null, ref_alto=100, ref_descripcion='1 m² (100 × 100 cm)', fraccion_fija=0.15, std_fuente='Derivado de estándares por proceso v5 — GRAN FORMATO: imprimir 6 + refilar 4 por m²' where codigo='GF-P5';
update public.productos set medida='CM2', ref_ancho=100, ref_prof=null, ref_alto=100, ref_descripcion='1 m² (100 × 100 cm)', fraccion_fija=0.15, std_fuente='Derivado de estándares por proceso v5 — GRAN FORMATO: imprimir 6 + laminar 3 + pegar 8 + refilar 4 por m²' where codigo='GF-P6';
update public.productos set medida='CM2', ref_ancho=100, ref_prof=null, ref_alto=100, ref_descripcion='1 m² (100 × 100 cm)', fraccion_fija=0.15, std_fuente='Derivado de estándares por proceso v5 — GRAN FORMATO: láser 25 por m² (pegado opcional aparte); PINTURA: 1 pieza × 20' where codigo='GF-P7';
update public.productos set medida='CM2', ref_ancho=100, ref_prof=null, ref_alto=100, ref_descripcion='1 m² (100 × 100 cm)', fraccion_fija=0.15, std_fuente='Derivado de estándares por proceso v5 — GRAN FORMATO: láser 25 por m²' where codigo='GF-P8';
update public.productos set medida='UNIDAD', ref_ancho=null, ref_prof=null, ref_alto=null, ref_descripcion='1 mueble', fraccion_fija=0, std_fuente='Derivado de estándares por proceso v5 — ENSAMBLE FINAL: ensamble final 60 por ítem' where codigo='ENS-P1';
update public.productos set medida='UNIDAD', ref_ancho=null, ref_prof=null, ref_alto=null, ref_descripcion='1 aviso', fraccion_fija=0, std_fuente='Derivado de estándares por proceso v5 — ENSAMBLE FINAL: ensamble final 60 por ítem' where codigo='ENS-P2';
update public.productos set medida='UNIDAD', ref_ancho=null, ref_prof=null, ref_alto=null, ref_descripcion='1 pieza intervenida', fraccion_fija=0, std_fuente=null where codigo='SER-P1';
update public.productos set medida='UNIDAD', ref_ancho=null, ref_prof=null, ref_alto=null, ref_descripcion='1 pedido', fraccion_fija=0, std_fuente=null where codigo='SER-P2';
insert into public.etapas_producto (producto, paso, area, opcional, alternativa, min_ref, procesos) values
('ACR-P1', 1, 'GRAN FORMATO', false, false, 2, 'GF-3'),
('ACR-P1', 2, 'ACRILICO', false, false, 20, 'AC-1 → AC-2'),
('ACR-P2', 1, 'GRAN FORMATO', false, false, 15, 'GF-3'),
('ACR-P2', 2, 'ACRILICO', false, false, 35, 'AC-1 → AC-3 → AC-2'),
('ACR-P3', 1, 'GRAN FORMATO', false, false, 5, 'GF-3'),
('ACR-P3', 2, 'ACRILICO', false, false, 25, 'AC-3 → AC-2'),
('ACR-P4', 1, 'ACRILICO', false, false, 15, 'AC-2'),
('ENS-P1', 1, 'ENSAMBLE FINAL', false, false, 60, 'ENS-1'),
('ENS-P2', 1, 'ENSAMBLE FINAL', false, false, 60, 'ENS-1'),
('GF-P1', 1, 'GRAN FORMATO', false, false, 15, 'GF-1 → GF-2 → GF-6'),
('GF-P2', 1, 'GRAN FORMATO', false, false, 15, 'GF-1 → GF-2 → GF-7'),
('GF-P3', 1, 'GRAN FORMATO', false, false, 10, 'GF-7'),
('GF-P4', 1, 'GRAN FORMATO', false, false, 15, 'GF-1 → GF-6 → GF-4'),
('GF-P5', 1, 'GRAN FORMATO', false, false, 10, 'GF-1 → GF-6 → GF-7 → GF-3'),
('GF-P6', 1, 'GRAN FORMATO', false, false, 20, 'GF-1 → GF-2 → GF-5 → GF-6'),
('GF-P7', 1, 'GRAN FORMATO', false, false, 25, 'GF-3 → GF-5'),
('GF-P7', 2, 'PINTURA', true, false, 20, 'PINT-4'),
('GF-P8', 1, 'GRAN FORMATO', false, false, 25, 'GF-3'),
('MAD-P1', 1, 'MADERA', false, false, 10, 'MAD-1 → MAD-2'),
('MAD-P2', 1, 'MADERA', false, false, 30, 'MAD-1 → MAD-4 → MAD-2 → MAD-3'),
('MAD-P3', 1, 'MADERA', false, false, 20, 'MAD-1 → MAD-5 → MAD-3'),
('MAD-P3', 2, 'PINTURA', true, false, 20, 'PINT-4'),
('MAD-P4', 1, 'MADERA', false, false, 100, 'MAD-1 → MAD-2 → MAD-6'),
('MET-P1', 1, 'METAL', false, false, 90, 'MET-1 → MET-4 → MET-5'),
('MET-P1', 2, 'PINTURA', false, true, 20, 'PINT-4'),
('MET-P1', 2, 'TERCEROS', false, true, null, 'TER-1'),
('MET-P2', 1, 'METAL', false, false, 125, 'MET-1 → MET-6 → MET-4 → MET-5'),
('MET-P2', 2, 'PINTURA', false, true, 20, 'PINT-4'),
('MET-P2', 2, 'TERCEROS', false, true, null, 'TER-1'),
('MET-P3', 1, 'TERCEROS', false, false, null, 'TER-1'),
('MET-P3', 2, 'METAL', false, false, 30, 'MET-3 → MET-4 → MET-5'),
('MET-P3', 3, 'PINTURA', false, true, 20, 'PINT-4'),
('MET-P3', 3, 'TERCEROS', false, true, null, 'TER-1'),
('MET-P4', 1, 'METAL', false, false, 240, 'MET-1 → MET-2 → MET-3 → MET-4 → MET-5'),
('MET-P4', 2, 'PINTURA', false, true, 40, 'PINT-4'),
('MET-P4', 2, 'TERCEROS', false, true, null, 'TER-1'),
('SER-P2', 1, 'TERCEROS', false, false, null, 'TER-1');

-- ---------- CÁLCULO ----------
create or replace function public.tamano(p_medida text, p_ancho numeric, p_prof numeric, p_alto numeric) returns numeric
language sql immutable as $$
  select case p_medida
    when 'CM2' then p_ancho * coalesce(p_alto, p_prof)
    when 'CM3' then p_ancho * p_prof * p_alto
    else 1 end
$$;

-- Minutos estándar por unidad de un producto en un área. NULL si faltan medidas o estándar.
create or replace function public.std_unidad(p_producto text, p_area text, p_ancho numeric, p_prof numeric, p_alto numeric, p_dificultad text)
returns numeric language sql stable set search_path = public as $$
  select round((e.min_ref * d.multiplicador *
    case when p.medida = 'UNIDAD' then 1
         else p.fraccion_fija + (1 - p.fraccion_fija)
              * public.tamano(p.medida, p_ancho, p_prof, p_alto)
              / nullif(public.tamano(p.medida, p.ref_ancho, p.ref_prof, p.ref_alto), 0) end)::numeric, 2)
  from productos p
  join etapas_producto e on e.producto = p.codigo and e.area = p_area
  join dificultades d on d.nivel = coalesce(p_dificultad, 'MEDIO')
  where p.codigo = p_producto
  limit 1
$$;

-- Crea o actualiza los pasos (uno por área) de un producto dentro de un ítem.
-- Se puede volver a llamar cuando cambian medidas, dificultad o cantidad: actualiza sin duplicar.
create or replace function public.generar_tareas(p_componente uuid) returns int
language plpgsql security definer set search_path = public as $$
declare c record; r record; n int := 0; v_id uuid; v_std numeric; v_und numeric; v_ter numeric;
begin
  if not public.es_gestor() then raise exception 'Sin permiso'; end if;
  select co.*, i.orden_id, i.cantidad as item_cant into c
  from componentes co join items i on i.id = co.item_id where co.id = p_componente;
  if not found then raise exception 'Producto no encontrado'; end if;
  v_und := coalesce(c.cantidad, 1) * coalesce(c.item_cant, 1);
  select tiempo_std_min into v_ter from procesos where codigo = 'TER-1';

  delete from tareas t where t.componente_id = p_componente and t.estado in ('pendiente','omitida')
    and not exists (select 1 from etapas_producto e where e.producto = c.producto and e.paso = t.paso and e.area = t.area);

  for r in
    select e.*, row_number() over (partition by e.paso order by e.id) as orden_alt
    from etapas_producto e where e.producto = c.producto order by e.paso, e.id
  loop
    v_std := case when r.area = 'TERCEROS' then v_ter
                  else public.std_unidad(c.producto, r.area, c.ancho, c.profundidad, c.alto, c.dificultad) end;
    select id into v_id from tareas where componente_id = p_componente and paso = r.paso and area = r.area;
    if v_id is null then
      insert into tareas (orden_id, item_id, componente_id, paso, proceso, area, unidad, cantidad,
                          tiempo_std_unit, opcional, alternativa, estado)
      values (c.orden_id, c.item_id, p_componente, r.paso,
              case r.area when 'TERCEROS' then 'TER-1' when 'ENSAMBLE FINAL' then 'ENS-1' end,
              r.area, 'UND', v_und, v_std, r.opcional, r.alternativa,
              case when (not r.alternativa) or r.orden_alt = 1 then 'pendiente' else 'omitida' end);
    else
      update tareas set cantidad = v_und, tiempo_std_unit = v_std
      where id = v_id and estado <> 'terminada';
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- VISTAS ----------
drop view if exists public.v_tareas;
create view public.v_tareas with (security_invoker = on) as
select t.*,
  o.numero as op_numero, o.cliente, o.proyecto, o.fecha_compromiso, o.prioridad, o.estado as op_estado,
  i.descripcion as item_descripcion, i.numero as item_numero,
  c.producto, coalesce(pd.nombre, pr.nombre) as proceso_nombre,
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
  c.ancho, c.profundidad, c.alto, c.dificultad, pd.medida, c.descripcion as componente_detalle
from tareas t
join ordenes o on o.id = t.orden_id
join items i on i.id = t.item_id
left join componentes c on c.id = t.componente_id
left join productos pd on pd.codigo = c.producto
left join procesos pr on pr.codigo = t.proceso;
revoke all on public.v_tareas from anon;
grant select on public.v_tareas to authenticated;

create or replace view public.v_ordenes as
select o.*,
  count(t.id) filter (where t.estado <> 'omitida') as tareas_total,
  count(t.id) filter (where t.estado = 'terminada') as tareas_terminadas,
  sum(coalesce(t.cantidad,0)*coalesce(t.tiempo_std_unit,0)) filter (where t.estado <> 'omitida' and t.area <> 'TERCEROS') as min_std_total,
  sum(coalesce(t.cantidad,0)*coalesce(t.tiempo_std_unit,0)) filter (where t.estado = 'terminada' and t.area <> 'TERCEROS') as min_std_terminado,
  case
    when count(t.id) filter (where t.estado <> 'omitida') = 0 then 0
    when coalesce(sum(coalesce(t.cantidad,0)*coalesce(t.tiempo_std_unit,0)) filter (where t.estado <> 'omitida' and t.area <> 'TERCEROS'),0) > 0
      then round(100 * coalesce(sum(coalesce(t.cantidad,0)*coalesce(t.tiempo_std_unit,0)) filter (where t.estado = 'terminada' and t.area <> 'TERCEROS'),0)
                 / sum(coalesce(t.cantidad,0)*coalesce(t.tiempo_std_unit,0)) filter (where t.estado <> 'omitida' and t.area <> 'TERCEROS'))
    else round(100.0 * count(t.id) filter (where t.estado = 'terminada') / count(t.id) filter (where t.estado <> 'omitida'))
  end as avance_pct,
  case
    when o.estado in ('terminada','entregada') then
      case when o.fecha_compromiso is null or coalesce(o.fecha_entrega_real, current_date) <= o.fecha_compromiso then 'cumplida' else 'incumplida' end
    when o.fecha_compromiso is null then 'sin_fecha'
    when current_date > o.fecha_compromiso then 'vencida'
    when o.fecha_compromiso - current_date <= 2 then 'en_riesgo'
    else 'a_tiempo'
  end as semaforo
from ordenes o left join tareas t on t.orden_id = o.id
group by o.id;

-- Estándar real por producto y área: compara minutos reales con los estándar de lo que se hizo
-- (ya corregidos por medidas y dificultad) y sugiere el nuevo estándar de referencia.
create or replace view public.v_estandar_producto with (security_invoker = on) as
with x as (
  select c.producto, t.area, t.id,
         least(coalesce(t.cantidad_hecha, t.cantidad), t.cantidad) * t.tiempo_std_unit as min_std,
         sum(coalesce(r.minutos, extract(epoch from (r.fin - r.inicio))/60)) as min_reales
  from tareas t
  join componentes c on c.id = t.componente_id
  join registros r on r.tarea_id = t.id and r.motivo_pausa is null and (r.minutos is not null or r.fin is not null)
  where t.estado = 'terminada' and t.area <> 'TERCEROS' and t.tiempo_std_unit > 0 and t.cantidad > 0
  group by c.producto, t.area, t.id, t.cantidad, t.cantidad_hecha, t.tiempo_std_unit)
select x.producto, p.nombre, x.area, e.min_ref,
  count(*) as tareas_medidas,
  round(sum(x.min_std)::numeric, 1) as min_std, round(sum(x.min_reales)::numeric, 1) as min_reales,
  round((sum(x.min_reales) / nullif(sum(x.min_std),0))::numeric, 3) as razon,
  round((e.min_ref * sum(x.min_reales) / nullif(sum(x.min_std),0))::numeric, 1) as min_ref_sugerido
from x join productos p on p.codigo = x.producto
left join etapas_producto e on e.producto = x.producto and e.area = x.area
group by x.producto, p.nombre, x.area, e.min_ref;
revoke all on public.v_estandar_producto from anon;
grant select on public.v_estandar_producto to authenticated;

revoke execute on function public.tamano(text, numeric, numeric, numeric) from public, anon;
revoke execute on function public.std_unidad(text, text, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.tamano(text, numeric, numeric, numeric) to authenticated;
grant execute on function public.std_unidad(text, text, numeric, numeric, numeric, text) to authenticated;
