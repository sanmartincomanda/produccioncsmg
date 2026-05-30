# Analisis SICAR y arquitectura propuesta

Fecha de analisis: 2026-05-29

## 1. Hallazgos reales en `sicar`

La inspeccion fue hecha en modo solo lectura sobre `127.0.0.1:3307`, base `sicar`.

### Tablas clave confirmadas

- `articulo`: catalogo principal, existencias y costos actuales.
- `unidad`: unidades de compra y venta.
- `ajusteinventario`: encabezado del ajuste.
- `ajusteinventarioarticulo`: detalle por articulo del ajuste.
- `historial`: rastro de altas, cambios y eliminaciones.
- `produccion` y `detalleprod`: modulo nativo muy basico de SICAR.
- `bascula` y `codigobascula`: presets de basculas y reglas de codigos de peso.
- `paquete`: estructura comercial tipo paquete/combo, no manufactura completa.

### Conteos observados

- `articulo`: 1308 registros
- `unidad`: 8 registros
- `ajusteinventario`: 1199 registros
- `ajusteinventarioarticulo`: 42412 registros
- `historial`: 1492417 registros
- `produccion`: 17 registros
- `detalleprod`: 22 registros
- `bascula`: 4 registros

### Punto critico

No se encontraron `triggers` de MySQL para `articulo`, `ajusteinventario` o `ajusteinventarioarticulo`.
Tampoco se encontraron stored procedures de inventario; solo existe la funcion `regex_replace`.

Eso significa que SICAR hace la logica de negocio en su propia aplicacion y despues guarda el resultado final en MySQL.
Por lo tanto, si esta app va a escribir a SICAR, debe calcular y persistir todo de forma explicita:

- encabezado del ajuste
- detalle del ajuste
- actualizacion de `articulo.existencia`
- politica de costo (`precioCompra` / `preCompraProm`) segun la regla elegida
- alta en `historial`

## 2. Como SICAR guarda los datos clave

### `articulo`

Campos relevantes confirmados:

- `art_id`: PK
- `clave`: clave unica del producto
- `descripcion`: descripcion larga
- `precioCompra DECIMAL(20,3)`: costo de compra actual
- `preCompraProm DECIMAL(20,3)`: costo promedio actual
- `existencia DECIMAL(20,4)`: existencia actual
- `unidadCompra INT`: FK a `unidad.uni_id`
- `unidadVenta INT`: FK a `unidad.uni_id`
- `caracteristicas TEXT`: texto libre
- `insumo TINYINT(1)`: bandera de articulo como insumo
- `receta TINYINT(1)`: bandera de receta
- `platillo TINYINT(1)`: bandera de producto preparado

### `unidad`

Campos relevantes:

- `uni_id`
- `nombre`
- `clave`
- `status`

En esta base existen unidades como `PZA`, `CAJA`, `KG`, `LT`, `LB`.

### `ajusteinventario`

Campos relevantes:

- `ain_id`
- `fecha`
- `comentario`
- `tipo`

`tipo` esta documentado asi:

- `0 = Normal/Libre`
- `1 = Categoria`
- `2 = Departamento`
- `3 = Localizacion`

### `ajusteinventarioarticulo`

Campos relevantes:

- `ain_id`
- `art_id`
- `exisAnterior`
- `exisActual`
- `diferencia`
- `precioCompra`
- `preCompraProm`
- `importeCom`
- `importeProm`
- `precioVenta`
- `importeVenta`

Interpretacion operativa:

- `exisAnterior`: existencia del articulo antes del ajuste
- `exisActual`: existencia final despues del ajuste
- `diferencia`: `exisActual - exisAnterior`
- `precioCompra`: costo compra usado como referencia en el movimiento
- `preCompraProm`: costo promedio usado como referencia en el movimiento
- `importeCom`: `diferencia * precioCompra`
- `importeProm`: `diferencia * preCompraProm`
- `importeVenta`: `diferencia * precioVenta`

Ejemplo real observado:

- `ain_id = 1199`
- articulo `00046`
- `exisAnterior = 19.7500`
- `exisActual = 0.1500`
- `diferencia = -19.6000`
- `preCompraProm = 161.000`
- `importeProm = -3155.60`

### `historial`

Campos relevantes:

- `his_id`
- `movimiento`
- `fecha`
- `tabla`
- `id`
- `usu_id`

Codigos confirmados:

- `0 = Agregar`
- `1 = Modificar`
- `2 = Eliminar`

En historial se observan registros para `AjusteInventario` y `Articulo`.
No vimos historial detalle por linea de `ajusteinventarioarticulo`; parece que el rastro fuerte esta en el encabezado del ajuste y en el cambio del articulo.

## 3. Modulos nativos de SICAR que existen, pero no alcanzan

### `produccion` y `detalleprod`

SICAR tiene un modulo `produccion`, pero su estructura es muy corta:

- `produccion`: solo fecha, estado, comentario y usuario
- `detalleprod`: articulo producido, cantidad, unidad, costos y precios

Problemas para el caso de manufactura serio:

- no modela entradas/consumos de materias primas
- no modela multiples salidas con reparto de costo
- no modela VRN
- no guarda enlace con ajustes de inventario
- no guarda trazabilidad por lote/cierre de costo

Recomendacion: no usar este modulo como base funcional.
Solo tomarlo como referencia historica si algun usuario ya lo ocupaba.

### `recetaplatillo`

Existe, pero es solo texto:

- `ingredientes TEXT`
- `preparacion TEXT`

No es una receta estructurada con cantidades y costos.

### `bascula` y `codigobascula`

Si sirven como referencia para la configuracion de hardware:

- puertos `COM1`, `COM3`, `COM4`
- `baud_rate`, `delay`, `secuencia`, `carriageReturn`, `databit`
- reglas para extraer clave y peso desde codigo impreso

## 4. Que conviene para transformacion

## Opcion A: usar solo tablas de SICAR

No recomendable.

Problemas:

- SICAR no tiene modelo serio para recetas, multiples salidas, costo VRN y aprobacion
- la trazabilidad de negocio quedaria incrustada en comentarios de ajustes
- seria dificil simular, reprocesar o revertir ordenes
- la logica de costo quedaria demasiado fragil

## Opcion B: app propia + tablas auxiliares + posteo final a SICAR

Recomendacion fuerte.

Patron:

1. Leer catalogo, costos y existencias en vivo desde `sicar`.
2. Guardar recetas, ordenes, configuracion y snapshots de costo en una base propia.
3. Ejecutar simulacion y aprobacion dentro de la app.
4. Al cerrar la orden, generar los ajustes de SICAR de forma transaccional y controlada.
5. Guardar la relacion entre orden y `ain_id` en la base propia.

Esta es la linea mas limpia, mantenible y auditable.

## 5. Arquitectura propuesta

## Capas

### 1. Frontend web

- Next.js
- React
- Tailwind
- Framer Motion
- Firebase Web SDK para cliente, analitica y futuras capacidades web

Responsabilidad:

- catalogo en vivo
- recetas
- ordenes
- simulacion de costo
- configuracion de basculas
- configuracion VRN y perfiles de articulo

### 2. Backend de aplicacion

Responsabilidad:

- leer `sicar`
- leer y escribir base auxiliar
- calcular costo producido
- armar movimientos de consumo y produccion
- simular antes de aplicar
- postear a SICAR en transaccion

## 5.1 Integracion Firebase

Se agrego el proyecto web `produccion-a397a` a la app base.

Decision tecnica:

- usar Firebase solo del lado cliente para esta primera integracion
- inicializar `Analytics` unicamente en navegador
- no mezclar Firebase con la escritura a `sicar`

Motivo:

- el SDK de Firebase Analytics para web no funciona en entorno Node.js
- la app actual usa SSR/App Router, asi que `Analytics` debe vivir en un componente cliente
- si despues usamos Auth o Firestore con SSR, la ruta correcta sera `FirebaseServerApp`

Tambien quedo preparada la integracion de Firebase Admin del lado servidor:

- inicializacion `server-only`
- lectura de service account desde archivo local
- lista para Auth administrativo, Firestore del backend y futuras automatizaciones por codigo

Decisiones de seguridad:

- la service account no se expone en `NEXT_PUBLIC_*`
- la llave no se copia dentro del repo
- el backend la resuelve desde `FIREBASE_ADMIN_CREDENTIALS_PATH`

### 3. Base `sicar`

Responsabilidad:

- catalogo real
- existencias reales
- costo actual de articulos
- ajustes de inventario e historial operativo

### 4. Base auxiliar `transformacion_app`

Responsabilidad:

- recetas estructuradas
- ordenes de produccion
- perfiles por articulo
- configuracion de basculas
- costos manuales/indirectos
- bitacora de produccion
- relacion orden <-> ajustes SICAR

## 6. Modelo de datos recomendado

Migracion inicial creada en:

- [`db/migrations/001_init.sql`](/C:/Users/Microsoft%20Windows%2011/Documents/Codex/2026-05-29/quiero-empezar-una-nueva-app-desde/db/migrations/001_init.sql)

Tablas incluidas:

- `scale_devices`
- `article_profiles`
- `manual_cost_items`
- `recipes`
- `recipe_inputs`
- `recipe_outputs`
- `production_orders`
- `production_order_inputs`
- `production_order_outputs`
- `production_movements`
- `audit_log`

### Motivo del modelo

Se separan entradas y salidas porque en transformacion real:

- una orden puede consumir muchos articulos
- una orden puede producir varios articulos
- VRN necesita porcentaje por salida
- algunos costos no vienen de SICAR sino de costo manual indirecto

## 7. Como registrar produccion real en SICAR

Recomendacion:

### Variante operativa recomendada

Usar 2 ajustes por orden:

1. Ajuste negativo de consumo
2. Ajuste positivo de producto terminado / subproducto

Ventajas:

- trazabilidad mas clara
- comentarios mas legibles
- reversion mas segura
- mas facil conciliar costo por orden

Comentarios sugeridos:

- `PROD:OP-000123 Consumo MP`
- `PROD:OP-000123 Entrada PT`

### Escrituras minimas necesarias en SICAR

Para cada ajuste:

1. Insertar en `ajusteinventario`
2. Insertar lineas en `ajusteinventarioarticulo`
3. Actualizar `articulo.existencia`
4. Si aplica, actualizar `articulo.preCompraProm` del producto terminado
5. Insertar en `historial` el encabezado y las modificaciones relevantes

### Importante

Como no hay triggers, insertar solo en `ajusteinventario` y `ajusteinventarioarticulo` no basta.

## 8. Costeo propuesto

El usuario pidio VRN.
Tomo VRN como `Valor Relativo Neto` / `Valor Realizable Neto` para repartir el costo total del lote entre las salidas configuradas.

## Estrategias comparadas

### `precioCompra`

Util si el costo ultimo compra es la politica central.
No recomendado como costo de produccion final porque ignora mezcla real y rendimientos.

### `preCompraProm`

Bueno como base para valuar consumo de insumos existentes en SICAR.
No suficiente por si solo para repartir un lote con varias salidas.

### Costo producido

Es el costo calculado por la orden segun consumos reales y costos adicionales.
Debe existir siempre, aunque luego se decida o no empujarlo a SICAR.

### Costo estandar

Sirve para presupuesto, simulacion y desviaciones.
No deberia reemplazar el costo real del cierre.

### VRN

Recomendado como estrategia principal cuando:

- hay varios productos terminados
- hay cortes/subproductos
- importa repartir costo real por porcentaje o valor relativo

## Recomendacion final de costo

1. Valuar consumos usando `preCompraProm` actual de SICAR al momento de cierre.
2. Sumar costos manuales/indirectos capturados en la orden.
3. Repartir costo total entre salidas con VRN.
4. Guardar costo producido por salida en la base auxiliar.
5. Decidir por configuracion si se actualiza `articulo.preCompraProm` del terminado.

## 9. Riesgos detectados

- MySQL 5.6 es antiguo; hay que evitar features nuevas como JSON nativo y asumir compatibilidad conservadora.
- Hay articulos con existencia negativa; la orden debe validar stock y tambien permitir excepciones controladas.
- Las banderas `insumo`, `platillo` y `receta` existen, pero no representan un modelo manufacturero completo.
- Si se escribe a SICAR sin transaccion, puede quedar descuadrado ajuste vs articulo.
- `historial` guarda rastro basico, no una auditoria de negocio suficiente.
- Se requiere una politica formal para saber cuando actualizar costo promedio del terminado.

## 10. Plan de implementacion

### Fase 1

- lectura viva del catalogo SICAR
- base auxiliar separada
- configuracion por articulo
- configuracion de basculas
- documentacion y panel de arquitectura

### Fase 2

- CRUD de recetas
- multiples entradas y salidas
- costos manuales
- simulador VRN

### Fase 3

- ordenes de produccion
- simulacion de movimientos
- aprobacion
- posteo controlado a SICAR

### Fase 4

- bitacora operativa
- reporte de rendimientos
- reporte de variaciones
- conciliacion costo producido vs costo SICAR
