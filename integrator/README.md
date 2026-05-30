# Integrador local SICAR

Este proceso corre en el servidor local donde vive SICAR.

## Qué hace

- sincroniza `articulo` + `unidad` hacia Firestore `catalog_items`
- sincroniza `bascula` hacia Firestore `scale_presets`
- prepara una cola `sicar_jobs` para producciones costeadas
- deja heartbeat en `integrator_runtime/main`

## Qué no hace todavía

- no escribe ajustes reales en SICAR
- no actualiza todavía `ajusteinventario`, `ajusteinventarioarticulo`, `articulo` ni `historial`

## Variables

- `FIREBASE_ADMIN_CREDENTIALS_PATH`
- `SICAR_MYSQL_HOST`
- `SICAR_MYSQL_PORT`
- `SICAR_MYSQL_USER`
- `SICAR_MYSQL_PASSWORD`
- `SICAR_MYSQL_DATABASE`
- `INTEGRATOR_SYNC_INTERVAL_MS`
- `INTEGRATOR_ENABLE_SICAR_WRITES=false`

## Ejecutar

```bash
pnpm integrator:once
pnpm integrator:run
```

Usa `dry-run` por defecto.
