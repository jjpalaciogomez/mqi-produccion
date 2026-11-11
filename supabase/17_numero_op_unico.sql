-- 17: número de OP único aunque se escriba distinto ("OP 3901", "3901 ", "3.901")
create unique index if not exists ordenes_numero_normalizado on public.ordenes
  ((regexp_replace(regexp_replace(lower(numero), '^\s*op', ''), '[^0-9a-z]', '', 'g')));
