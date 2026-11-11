-- 19. Tipos de paro vigentes y área de Instalación (solo para ensambles multiárea)

-- Motivos de paro: se desactivan los que ya no se usan (los que tienen historial se conservan para los reportes)
alter table public.motivos_paro add column if not exists activo boolean not null default true;
update public.motivos_paro set activo = descripcion in (
  'SERVICIO A INSTALACIONES', 'SERVICIO A PRODUCCION', 'SERVICIO OTRAS AREAS DE PRODUC', 'EPS',
  'SERVICIO A COMERCIAL', 'PERMISO', 'ORDENAR Y ASEAR', 'SERVICIO A LOGISTICA', 'AUSENTISMO');

-- Área de Instalación: los instaladores ayudan con los ensambles multiárea cuando no tienen trabajo de calle
insert into public.areas (codigo, nombre) values ('INSTALACION', 'Instalación') on conflict (codigo) do nothing;
insert into public.procesos (codigo, area, nombre, unidad, tiempo_std_min, estado)
values ('ENS-INS', 'INSTALACION', 'ENSAMBLE FINAL',  'UND', coalesce((select tiempo_std_min from public.procesos where codigo = 'ENS-MET'), 30), 'VIGENTE')
on conflict (codigo) do nothing;

-- Las tablets de cualquier área pueden registrar los ensambles de Instalación (igual que Pintura)
do $$ declare f record; def text; begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' and pg_get_functiondef(p.oid) like '%public.mi_area(), ''PINTURA'')%' loop
    def := replace(pg_get_functiondef(f.oid), 'public.mi_area(), ''PINTURA'')', 'public.mi_area(), ''PINTURA'', ''INSTALACION'')');
    execute def;
  end loop;
end $$;
