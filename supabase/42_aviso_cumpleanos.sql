-- Claves para integraciones externas (Apps Script). Sin políticas: nadie la lee desde la app.
create table if not exists public.integraciones (clave text primary key, token text not null, creado timestamptz not null default now());
alter table public.integraciones enable row level security;
revoke all on public.integraciones from anon, authenticated;

-- Aviso de cumpleaños (lo consulta el Apps Script de nómina y envía el correo con Gmail).
-- Solo corre en día hábil (lunes a sábado sin festivos) y avisa los cumpleaños desde mañana
-- hasta el próximo día hábil, así no se pierden los de domingo o festivo.
create or replace function public.aviso_cumpleanos(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v_hoy date := (now() at time zone 'America/Bogota')::date; v_fest date[]; v_prox date; v_correo text; v_lista json;
begin
  if not exists (select 1 from integraciones where clave = 'avisos_apps_script' and token = p_token) then
    return json_build_object('error', 'token inválido');
  end if;
  select coalesce(array_agg(x::date), '{}') into v_fest from nomina_config, jsonb_array_elements_text(valor) x where clave = 'festivos';
  select valor->>'correoCumpleanos' into v_correo from nomina_config where clave = 'parametros';
  if extract(dow from v_hoy) = 0 or v_hoy = any(v_fest) then return json_build_object('enviar', false, 'motivo', 'hoy no es día hábil'); end if;
  v_prox := v_hoy + 1;
  while extract(dow from v_prox) = 0 or v_prox = any(v_fest) loop v_prox := v_prox + 1; end loop;
  select json_agg(json_build_object('nombre', e.nombre, 'cargo', e.cargo, 'area', e.area, 'fecha', to_char(d, 'DD/MM/YYYY')) order by d, e.nombre) into v_lista
    from empleados e, generate_series(v_hoy + 1, v_prox, interval '1 day') d
   where e.estado <> 'Inactivo' and e.fecha_cumpleanos is not null
     and extract(month from e.fecha_cumpleanos) = extract(month from d) and extract(day from e.fecha_cumpleanos) = extract(day from d);
  return json_build_object('enviar', v_lista is not null and coalesce(v_correo, '') <> '', 'correo', v_correo, 'hasta', to_char(v_prox, 'DD/MM/YYYY'), 'personas', coalesce(v_lista, '[]'::json));
end $$;
revoke execute on function public.aviso_cumpleanos(text) from public;
grant execute on function public.aviso_cumpleanos(text) to anon;
insert into public.integraciones (clave, token) values ('avisos_apps_script', encode(gen_random_bytes(24), 'hex')) on conflict (clave) do nothing;
