-- 26. Horas extra en sábados, domingos y festivos: desde qué hora se trabaja (esos días no hay jornada normal)
alter table public.horas_extra add column if not exists desde time;
