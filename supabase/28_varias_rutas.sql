-- 28. Varias rutas por vehículo en el día (ruta 1, ruta 2…), cada una con su hora de salida opcional
alter table public.recorridos add column if not exists numero int not null default 1 check (numero >= 1);
alter table public.recorridos add column if not exists salida time;
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.recorridos'::regclass and contype = 'u' loop
    execute format('alter table public.recorridos drop constraint %I', c);
  end loop;
end $$;
alter table public.recorridos add constraint recorridos_fecha_vehiculo_numero_key unique (fecha, vehiculo, numero);
