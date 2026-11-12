-- Tamaño o capacidad del vehículo del transportador (p. ej. "Camión 6 m", "carga 2 t")
alter table public.transportadores add column if not exists tamano text;
