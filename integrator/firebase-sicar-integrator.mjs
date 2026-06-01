import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import process from "node:process";

import mysql from "mysql2/promise";
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const COLLECTIONS = {
  catalogItems: "catalog_items",
  integratorRuntime: "integrator_runtime",
  scalePresets: "scale_presets",
  sicarJobs: "sicar_jobs",
  sicarPostingRequests: "sicar_posting_requests",
  productionOrders: "production_orders",
  syncRequests: "sync_requests",
};

const CONFIG = {
  runOnce: process.argv.includes("--once"),
  enableSicarWrites: process.env.INTEGRATOR_ENABLE_SICAR_WRITES === "true",
  syncIntervalMs: Number(process.env.INTEGRATOR_SYNC_INTERVAL_MS ?? 30000),
  sicar: {
    host: process.env.SICAR_MYSQL_HOST ?? process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.SICAR_MYSQL_PORT ?? process.env.MYSQL_PORT ?? 3307),
    user: process.env.SICAR_MYSQL_USER ?? process.env.MYSQL_USER ?? "root",
    password: process.env.SICAR_MYSQL_PASSWORD ?? process.env.MYSQL_PASSWORD ?? "",
    database: process.env.SICAR_MYSQL_DATABASE ?? process.env.MYSQL_DATABASE ?? "sicar",
  },
  firebaseCredentialsPath: process.env.FIREBASE_ADMIN_CREDENTIALS_PATH ?? "",
};

let cachedPool;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function log(message, extra) {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[integrator] ${message}${suffix}`);
}

function ensure(value, label) {
  if (!value) {
    throw new Error(`Falta configurar ${label}.`);
  }

  return value;
}

function loadServiceAccount() {
  const credentialsPath = ensure(CONFIG.firebaseCredentialsPath, "FIREBASE_ADMIN_CREDENTIALS_PATH");

  if (!existsSync(credentialsPath)) {
    throw new Error(`No existe la llave de Firebase Admin en ${credentialsPath}`);
  }

  return JSON.parse(readFileSync(credentialsPath, "utf8"));
}

function getFirebaseApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  const serviceAccount = loadServiceAccount();

  return initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: String(serviceAccount.private_key ?? "").replace(/\\n/g, "\n"),
    }),
  });
}

function getDb() {
  return getFirestore(getFirebaseApp());
}

function getSicarPool() {
  if (cachedPool) {
    return cachedPool;
  }

  cachedPool = mysql.createPool({
    host: CONFIG.sicar.host,
    port: CONFIG.sicar.port,
    user: CONFIG.sicar.user,
    password: CONFIG.sicar.password,
    database: CONFIG.sicar.database,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  return cachedPool;
}

async function writeRuntime(update) {
  await getDb()
    .collection(COLLECTIONS.integratorRuntime)
    .doc("main")
    .set(
      {
        host: os.hostname(),
        mode: CONFIG.enableSicarWrites ? "write-enabled" : "dry-run",
        syncIntervalMs: CONFIG.syncIntervalMs,
        updatedAt: nowIso(),
        ...update,
      },
      { merge: true },
    );
}

async function readCatalogSyncRequest() {
  const snapshot = await getDb().collection(COLLECTIONS.syncRequests).doc("catalog").get();
  return snapshot.exists ? snapshot.data() : null;
}

async function markCatalogSyncRequest(status, extra = {}) {
  await getDb()
    .collection(COLLECTIONS.syncRequests)
    .doc("catalog")
    .set(
      {
        kind: "catalog",
        status,
        updatedAt: nowIso(),
        ...extra,
      },
      { merge: true },
    );
}

async function syncCatalogItems() {
  const pool = getSicarPool();
  const requestState = await readCatalogSyncRequest();
  const [rows] = await pool.query(`
    SELECT
      a.art_id AS artId,
      a.clave,
      a.descripcion,
      a.caracteristicas,
      a.status,
      a.servicio,
      a.insumo,
      a.receta,
      a.platillo,
      a.existencia,
      a.precioCompra,
      a.preCompraProm,
      a.cat_id AS categoryId,
      c.nombre AS categoryName,
      c.dep_id AS departmentId,
      d.nombre AS departmentName,
      uc.nombre AS unidadCompra,
      uv.nombre AS unidadVenta
    FROM articulo a
    LEFT JOIN categoria c ON c.cat_id = a.cat_id
    LEFT JOIN departamento d ON d.dep_id = c.dep_id
    LEFT JOIN unidad uc ON uc.uni_id = a.unidadCompra
    LEFT JOIN unidad uv ON uv.uni_id = a.unidadVenta
    ORDER BY a.clave ASC
  `);

  const db = getDb();
  let batch = db.batch();
  let ops = 0;

  for (const row of rows) {
    const docRef = db.collection(COLLECTIONS.catalogItems).doc(String(row.artId));
    batch.set(
      docRef,
      {
        artId: Number(row.artId),
        clave: String(row.clave ?? ""),
        descripcion: String(row.descripcion ?? ""),
        caracteristicas: String(row.caracteristicas ?? ""),
        status: Number(row.status ?? 0),
        servicio: Number(row.servicio ?? 0),
        insumo: Number(row.insumo ?? 0),
        receta: Number(row.receta ?? 0),
        platillo: Number(row.platillo ?? 0),
        existencia: String(row.existencia ?? 0),
        precioCompra: String(row.precioCompra ?? 0),
        preCompraProm: String(row.preCompraProm ?? 0),
        categoryId: row.categoryId === null || row.categoryId === undefined ? null : Number(row.categoryId),
        categoryName: String(row.categoryName ?? ""),
        departmentId:
          row.departmentId === null || row.departmentId === undefined ? null : Number(row.departmentId),
        departmentName: String(row.departmentName ?? ""),
        unidadCompra: String(row.unidadCompra ?? ""),
        unidadVenta: String(row.unidadVenta ?? ""),
        syncedAt: nowIso(),
      },
      { merge: true },
    );

    ops += 1;

    if (ops === 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
  }

  await writeRuntime({
    catalog: {
      rows: rows.length,
      syncedAt: nowIso(),
    },
  });

  if (requestState?.status === "PENDING") {
    await markCatalogSyncRequest("COMPLETED", {
      completedAt: nowIso(),
      rows: rows.length,
    });
  }

  log("Catálogo sincronizado", { rows: rows.length });
}

async function syncScalePresets() {
  const pool = getSicarPool();
  const [rows] = await pool.query(`
    SELECT
      bas_id AS scaleId,
      nombre AS name,
      puerto AS portName,
      baud_rate AS baudRate,
      delay AS pollDelayMs,
      secuencia AS commandSequence,
      carriageReturn AS useCarriageReturn,
      databit AS dataBits
    FROM bascula
    ORDER BY bas_id
  `);

  const db = getDb();
  const batch = db.batch();

  for (const row of rows) {
    batch.set(
      db.collection(COLLECTIONS.scalePresets).doc(String(row.scaleId)),
      {
        scaleId: Number(row.scaleId),
        name: String(row.name ?? ""),
        portName: String(row.portName ?? ""),
        baudRate: Number(row.baudRate ?? 0),
        pollDelayMs: Number(row.pollDelayMs ?? 0),
        commandSequence: String(row.commandSequence ?? ""),
        useCarriageReturn: Number(row.useCarriageReturn ?? 0),
        dataBits: Number(row.dataBits ?? 0),
        syncedAt: nowIso(),
      },
      { merge: true },
    );
  }

  if (rows.length > 0) {
    await batch.commit();
  }

  await writeRuntime({
    scales: {
      rows: rows.length,
      syncedAt: nowIso(),
    },
  });

  log("Básculas sincronizadas", { rows: rows.length });
}

function buildPostingJob(record) {
  const draft = record.draft ?? {};
  const outputs = Array.isArray(draft.outputs) ? draft.outputs : [];
  const inputs = Array.isArray(draft.inputs) ? draft.inputs : [];

  return {
    productionOrderId: Number(record.productionOrderId ?? 0),
    folio: String(record.folio ?? ""),
    workflowStage: String(record.workflowStage ?? "PRODUCED"),
    status: CONFIG.enableSicarWrites ? "PENDING_IMPLEMENTATION" : "SIMULATED",
    mode: CONFIG.enableSicarWrites ? "write-enabled" : "dry-run",
    sourceProduct: draft.sourceProduct ?? null,
    sourceWeight: Number(draft.sourceWeight ?? 0),
    outputCount: outputs.length,
    inputCount: inputs.length,
    createdAt: String(record.createdAt ?? nowIso()),
    updatedAt: nowIso(),
    note: CONFIG.enableSicarWrites
      ? "La escritura real a SICAR debe implementarse en este integrador."
      : "Simulación local: no se escribe en SICAR hasta autorización explícita.",
  };
}

async function syncPostingQueue() {
  const db = getDb();
  const snapshot = await db
    .collection(COLLECTIONS.sicarPostingRequests)
    .where("status", "==", "PENDING")
    .get();

  let processed = 0;

  for (const requestDoc of snapshot.docs) {
    const request = requestDoc.data();
    const productionOrderId = Number(request.productionOrderId ?? 0);

    if (!productionOrderId) {
      await requestDoc.ref.set(
        {
          status: "ERROR",
          updatedAt: nowIso(),
          lastErrorMessage: "productionOrderId invalido.",
        },
        { merge: true },
      );
      continue;
    }

    const orderSnapshot = await db.collection(COLLECTIONS.productionOrders).doc(String(productionOrderId)).get();

    if (!orderSnapshot.exists) {
      await requestDoc.ref.set(
        {
          status: "ERROR",
          updatedAt: nowIso(),
          lastErrorMessage: `Produccion ${productionOrderId} no encontrada.`,
        },
        { merge: true },
      );
      continue;
    }

    const record = orderSnapshot.data();
    const job = buildPostingJob(record);

    await db
      .collection(COLLECTIONS.sicarJobs)
      .doc(String(job.productionOrderId))
      .set(
        {
          ...job,
          requestId: String(request.requestId ?? productionOrderId),
          requestedAt: String(request.requestedAt ?? nowIso()),
          updatedAt: nowIso(),
        },
        { merge: true },
      );

    await requestDoc.ref.set(
      {
        status: CONFIG.enableSicarWrites ? "PENDING_IMPLEMENTATION" : "SIMULATED",
        processedAt: nowIso(),
        updatedAt: nowIso(),
      },
      { merge: true },
    );

    processed += 1;
  }

  await writeRuntime({
    jobs: {
      rows: processed,
      syncedAt: nowIso(),
    },
  });

  log("Cola SICAR preparada", { rows: processed, mode: CONFIG.enableSicarWrites ? "write" : "dry-run" });
}

async function runCycle() {
  await writeRuntime({
    status: "running",
    startedAt: nowIso(),
  });

  await syncCatalogItems();
  await syncScalePresets();
  await syncPostingQueue();

  await writeRuntime({
    status: "idle",
    lastSuccessAt: nowIso(),
  });
}

async function main() {
  log("Integrador iniciado", {
    mode: CONFIG.enableSicarWrites ? "write-enabled" : "dry-run",
    once: CONFIG.runOnce,
  });

  do {
    try {
      await runCycle();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fallo desconocido.";
      log("Error en ciclo", { message });
      await writeRuntime({
        status: "error",
        lastErrorAt: nowIso(),
        lastErrorMessage: message,
      });
    }

    if (!CONFIG.runOnce) {
      await sleep(CONFIG.syncIntervalMs);
    }
  } while (!CONFIG.runOnce);

  if (cachedPool) {
    await cachedPool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
