-- 20. Cantidad de máquinas iguales por proceso (cada una trabaja un montaje a la vez)
alter table public.procesos add column if not exists num_maquinas int not null default 1 check (num_maquinas >= 1);
-- Hay 3 impresoras de gran formato
update public.procesos set num_maquinas = 3 where codigo = 'GF-1';
