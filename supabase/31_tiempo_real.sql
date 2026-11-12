-- Actualización en tiempo real: las tablas principales envían sus cambios por Supabase Realtime
-- (cada usuario solo recibe las filas que puede leer según RLS). personas y perfiles no se publican.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['ordenes','tareas','registros','programacion','paros','horas_extra','vueltas','recorridos','lugares','transportadores','ajustes'] loop
    if to_regclass('public.' || t) is not null and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
select json_build_object('publicadas', (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'))::text as r;
