-- 25. Vueltas: tipo "regreso" (el camión vuelve a la planta a una hora) y "volver a la planta" después de una vuelta
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.vueltas'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tipo%' loop
    execute format('alter table public.vueltas drop constraint %I', c);
  end loop;
end $$;
alter table public.vueltas add constraint vueltas_tipo_check check (tipo in ('entrega','recogida','diligencia','regreso'));
alter table public.vueltas add column if not exists volver_planta boolean not null default false;
alter table public.vueltas add column if not exists volver_antes time;
-- Cuándo se puede hacer: modo explícito (todo, manana, tarde, exacta, desde, antes, rango)
alter table public.vueltas add column if not exists cuando text;
-- Antes de la vuelta, pasar por la planta a recoger la mercancía (lista desde una hora)
alter table public.vueltas add column if not exists recoger_planta boolean not null default false;
alter table public.vueltas add column if not exists lista_desde time;
