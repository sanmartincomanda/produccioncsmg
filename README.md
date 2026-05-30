# produccioncsmg

Aplicacion web base para controlar transformaciones de inventario con frontend en Firebase y un integrador local para SICAR.

## Objetivo

- Leer el catalogo real de `sicar` desde un integrador local.
- Administrar recetas, ordenes de produccion y configuraciones en Firebase.
- Preparar consumo de materias primas y entrada de producto terminado para ajuste controlado en SICAR.
- Calcular costo producido con estrategia VRN.
- Mantener trazabilidad seria por orden, movimiento y costo.

## Stack inicial

- Next.js 16
- React 19
- Tailwind CSS 4
- Framer Motion
- MySQL 5.6 via `mysql2`
- Firebase Web SDK 12
- Firebase Admin SDK 13

## Modulos

- `Producir`: registra producciones reales con folio `PR-001`, `PR-002`, etc.
- `Costeo`: aplica costeo VRN editable sobre producciones guardadas.
- `SICAR`: prepara el posteo de ajustes y actualizacion de costos hacia SICAR.
- `Historial`: consulta producciones registradas y su estado.
- `Configuracion`: administra basculas, clasificaciones y base editable de costos e insumos.

## Scripts

```bash
pnpm install
pnpm db:migrate
pnpm dev
pnpm integrator:once
pnpm integrator:run
```

## Variables de entorno

La web usa `NEXT_PUBLIC_FIREBASE_*`.

El integrador local usa:

- `FIREBASE_ADMIN_CREDENTIALS_PATH`
- `SICAR_*`
- `APP_*` si mantienes la base auxiliar MySQL

## Firebase

- Cliente web: [`src/lib/firebase/client.ts`](src/lib/firebase/client.ts)
- Admin server-only: [`src/lib/firebase/admin.ts`](src/lib/firebase/admin.ts)

La llave de Firebase Admin se lee desde archivo local y no se expone al frontend.

Archivo guia: [`.env.example`](.env.example)

## Documentacion

- Analisis y arquitectura: [`docs/sicar-analisis-y-arquitectura.md`](docs/sicar-analisis-y-arquitectura.md)
- Migracion inicial: [`db/migrations/001_init.sql`](db/migrations/001_init.sql)
- Integrador local: [`integrator/README.md`](integrator/README.md)
