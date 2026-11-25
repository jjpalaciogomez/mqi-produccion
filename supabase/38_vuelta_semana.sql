-- Vueltas "para esta semana": se pueden hacer cualquier día desde su fecha hasta esta fecha límite
alter table public.vueltas add column if not exists hasta date;
