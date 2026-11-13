-- Pasos por la planta como paradas: el conductor marca cuándo cargó y cuándo descargó
alter table public.vueltas add column if not exists cargado_en timestamptz;
alter table public.vueltas add column if not exists descargado_en timestamptz;

create or replace function public.marcar_planta(p_ids uuid[], p_campo text, p_hecho boolean default true)
returns text language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.mi_rol(), '') not in ('conductor', 'admin', 'direccion', 'logistica') then return 'Sin permiso'; end if;
  if p_campo = 'cargado' then
    update vueltas set cargado_en = case when p_hecho then now() else null end where id = any(p_ids);
  elsif p_campo = 'descargado' then
    update vueltas set descargado_en = case when p_hecho then now() else null end where id = any(p_ids);
  else
    return 'Campo no válido';
  end if;
  return 'ok';
end $$;
revoke execute on function public.marcar_planta(uuid[], text, boolean) from public, anon;
grant execute on function public.marcar_planta(uuid[], text, boolean) to authenticated;
