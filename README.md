# MQI · Sistema de Control de Producción

Fase 1 del sistema de control de planta de Más Que Impresos S.A.S.:
órdenes de producción por ítems y productos estándar, registro de tiempos desde las tablets de cada área,
tablero de cumplimiento y mapa de cada proyecto.

## Cómo está armado

| Pieza | Dónde |
| --- | --- |
| Base de datos, usuarios y permisos | Supabase, proyecto **SISTEMA MQI** |
| App web (React + Vite) | Esta carpeta; se publica sola en GitHub Pages |
| Scripts de la base de datos | `supabase/` (01 esquema, 02 catálogos, 03 ajustes) |

La app solo contiene la clave **pública** de Supabase (`src/supabase.js`). Toda la seguridad está en la base
de datos (Row Level Security): sin iniciar sesión no se puede leer ni escribir nada.

## Roles

- **Administrador / Dirección**: crean OPs, ítems y productos; editan catálogos, tiempos estándar y PIN.
- **Tablet** (una cuenta por área): muestra las tareas del área; cada operario se identifica con su nombre y PIN de 4 dígitos.
- **Consulta**: solo ve el tablero y el mapa de los proyectos.

## Publicar cambios

Cada cambio que se sube a la rama `main` se publica automáticamente (pestaña *Actions* del repositorio).

Para trabajar en un computador: `npm install` y luego `npm run dev`.
