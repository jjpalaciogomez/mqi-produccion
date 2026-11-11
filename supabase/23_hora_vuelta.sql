-- 23. Hora exacta en las vueltas (para coordinar, p. ej., con Instalaciones)
alter table public.vueltas add column if not exists hora time;
