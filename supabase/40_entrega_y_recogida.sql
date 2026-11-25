-- Tipo de vuelta "Entrega y recogida" (en el mismo sitio se entrega algo y se recoge otra cosa)
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid = 'public.vueltas'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tipo%' loop
    execute format('alter table public.vueltas drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.vueltas add constraint vueltas_tipo_check check (tipo in ('entrega','recogida','entrega_recogida','diligencia','regreso'));
