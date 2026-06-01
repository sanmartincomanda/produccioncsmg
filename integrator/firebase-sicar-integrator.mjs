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
  sicarUserId: Number(process.env.INTEGRATOR_SICAR_USER_ID ?? 1),
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

function toNumber(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((toNumber(value) + Number.EPSILON) * factor) / factor;
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

function buildPostingComment(record, requestId) {
  return String(`PROD:${record.folio ?? ""} Firebase:${requestId} Ajuste:Transformacion`).slice(0, 255);
}

function calculateDraftCosting(draft = {}) {
  const sourceWeight = round(draft.sourceWeight, 4);
  const sourceUnitCost = round(draft.sourceUnitCost, 3);
  const sourceTotal = round(sourceWeight * sourceUnitCost, 2);

  const inputs = Array.isArray(draft.inputs)
    ? draft.inputs.map((input, index) => {
        const weight = round(input?.weight, 4);
        const unitCost = round(input?.unitCost, 3);
        return {
          id: String(input?.id ?? `input-${index + 1}`),
          label: String(input?.label ?? "Insumo"),
          unitName: String(input?.unitName ?? "PZA"),
          weight,
          unitCost,
          total: round(weight * unitCost, 2),
        };
      })
    : [];

  const manualCosts = Array.isArray(draft.manualCosts)
    ? draft.manualCosts.map((manualCost, index) => {
        const cost = round(manualCost?.cost, 3);
        const multiplier = round(manualCost?.multiplier, 4);
        return {
          id: String(manualCost?.id ?? `manual-${index + 1}`),
          label: String(manualCost?.label ?? "Costo manual"),
          cost,
          multiplier,
          total: round(cost * multiplier, 2),
        };
      })
    : [];

  const inputTotal = round(inputs.reduce((sum, item) => sum + item.total, 0), 2);
  const manualCostTotal = round(manualCosts.reduce((sum, item) => sum + item.total, 0), 2);
  const totalCost = round(sourceTotal + inputTotal + manualCostTotal, 2);

  const validOutputs = Array.isArray(draft.outputs)
    ? draft.outputs.filter((output) => output?.article?.artId && toNumber(output?.weight) > 0)
    : [];

  const outputWeightTotal = round(
    validOutputs.reduce((sum, output) => sum + round(output?.weight, 4), 0),
    4,
  );

  const relativeValues = validOutputs.map((output) => round(output?.percentage, 6));
  const vrnValues = validOutputs.map((output, index) => round(round(output?.weight, 4) * relativeValues[index], 6));
  const totalVrn = round(vrnValues.reduce((sum, value) => sum + value, 0), 6);

  let allocatedRunningTotal = 0;

  const outputs = validOutputs.map((output, index) => {
    const weight = round(output.weight, 4);
    const relativeValue = relativeValues[index];
    const vrn = vrnValues[index];
    const shareRatio =
      totalVrn > 0 ? vrn / totalVrn : outputWeightTotal > 0 ? weight / outputWeightTotal : 0;
    const allocatedCost =
      index === validOutputs.length - 1
        ? round(totalCost - allocatedRunningTotal, 2)
        : round(totalCost * shareRatio, 2);

    allocatedRunningTotal = round(allocatedRunningTotal + allocatedCost, 2);

    return {
      id: String(output.id ?? `output-${index + 1}`),
      article: output.article,
      label: `${output.article.clave} - ${output.article.descripcion}`,
      weight,
      percentage: relativeValue,
      vrn,
      shareRatio,
      allocatedCost,
      producedUnitCost: weight > 0 ? round(allocatedCost / weight, 3) : round(totalCost, 3),
    };
  });

  return {
    sourceWeight,
    sourceUnitCost,
    sourceTotal,
    inputs,
    inputTotal,
    manualCosts,
    manualCostTotal,
    totalCost,
    outputs,
  };
}

function buildPostingLines(record, request) {
  const draft = record?.draft ?? {};

  if (!draft?.sourceProduct?.artId) {
    throw new Error(`La produccion ${record?.folio ?? record?.productionOrderId ?? ""} no tiene producto base.`);
  }

  const totals = calculateDraftCosting(draft);

  if (totals.sourceWeight <= 0) {
    throw new Error(`La produccion ${record?.folio ?? record?.productionOrderId ?? ""} no tiene peso base.`);
  }

  if (totals.outputs.length === 0) {
    throw new Error(`La produccion ${record?.folio ?? record?.productionOrderId ?? ""} no tiene salidas validas.`);
  }

  const lineMap = new Map();

  const appendLine = (candidate) => {
    const key = String(candidate.artId);
    const existing = lineMap.get(key);

    if (!existing) {
      lineMap.set(key, {
        ...candidate,
        quantity: round(candidate.quantity, 4),
        detailUnitCost: round(candidate.detailUnitCost, 3),
        detailAvgCost: round(candidate.detailAvgCost, 3),
        inventoryTotal: round(candidate.inventoryTotal, 2),
        averageTotal: round(candidate.averageTotal, 2),
        outputAllocatedCost: round(candidate.outputAllocatedCost ?? 0, 2),
      });
      return;
    }

    const nextQuantity = round(existing.quantity + candidate.quantity, 4);
    const nextInventoryTotal = round(existing.inventoryTotal + candidate.inventoryTotal, 2);
    const nextAverageTotal = round(existing.averageTotal + candidate.averageTotal, 2);
    const nextAllocatedCost = round(existing.outputAllocatedCost + (candidate.outputAllocatedCost ?? 0), 2);
    const outputUnitCost = nextQuantity > 0 ? round(nextAllocatedCost / nextQuantity, 3) : existing.outputUnitCost;

    lineMap.set(key, {
      ...existing,
      quantity: nextQuantity,
      detailUnitCost:
        candidate.direction === "POSITIVE" && nextQuantity > 0
          ? outputUnitCost
          : round(nextInventoryTotal / (nextQuantity || 1), 3),
      detailAvgCost:
        candidate.direction === "POSITIVE" && nextQuantity > 0
          ? outputUnitCost
          : round(nextAverageTotal / (nextQuantity || 1), 3),
      inventoryTotal: nextInventoryTotal,
      averageTotal: nextAverageTotal,
      outputAllocatedCost: nextAllocatedCost,
      outputUnitCost: outputUnitCost ?? existing.outputUnitCost,
      updateCost: existing.updateCost || candidate.updateCost,
    });
  };

  appendLine({
    artId: Number(draft.sourceProduct.artId),
    label: `${draft.sourceProduct.clave} - ${draft.sourceProduct.descripcion}`,
    direction: "NEGATIVE",
    quantity: round(-totals.sourceWeight, 4),
    detailUnitCost: totals.sourceUnitCost,
    detailAvgCost: totals.sourceUnitCost,
    inventoryTotal: round(-totals.sourceWeight * round(draft.sourceProduct.precioCompra ?? totals.sourceUnitCost, 3), 2),
    averageTotal: round(-totals.sourceTotal, 2),
    updateCost: false,
    outputUnitCost: null,
    outputAllocatedCost: 0,
  });

  for (const output of totals.outputs) {
    appendLine({
      artId: Number(output.article.artId),
      label: output.label,
      direction: "POSITIVE",
      quantity: round(output.weight, 4),
      detailUnitCost: output.producedUnitCost,
      detailAvgCost: output.producedUnitCost,
      inventoryTotal: round(output.allocatedCost, 2),
      averageTotal: round(output.allocatedCost, 2),
      updateCost: true,
      outputUnitCost: output.producedUnitCost,
      outputAllocatedCost: output.allocatedCost,
    });
  }

  const lines = [...lineMap.values()].sort((left, right) => left.artId - right.artId);

  return {
    requestId: String(request?.requestId ?? record?.productionOrderId ?? ""),
    comment: buildPostingComment(record, request?.requestId ?? record?.productionOrderId ?? ""),
    sourceArtId: Number(draft.sourceProduct.artId),
    totals,
    lines,
  };
}

async function createSicarAdjustment(connection, record, request) {
  const draft = record?.draft ?? {};
  const posting = buildPostingLines(record, request);
  const artIds = posting.lines.map((line) => line.artId);
  const placeholders = artIds.map(() => "?").join(", ");

  const [existingRows] = await connection.query(
    `SELECT ain_id FROM ajusteinventario WHERE comentario = ? ORDER BY ain_id DESC LIMIT 1`,
    [posting.comment],
  );

  if (Array.isArray(existingRows) && existingRows.length > 0) {
    return {
      ainId: Number(existingRows[0].ain_id),
      comment: posting.comment,
      lines: posting.lines,
      totals: posting.totals,
      reused: true,
    };
  }

  await connection.beginTransaction();

  try {
    const [articleRows] = await connection.query(
      `SELECT art_id, clave, descripcion, existencia, precioCompra, preCompraProm, precio1
       FROM articulo
       WHERE art_id IN (${placeholders})
       FOR UPDATE`,
      artIds,
    );

    const articleMap = new Map(
      (Array.isArray(articleRows) ? articleRows : []).map((row) => [Number(row.art_id), row]),
    );

    for (const line of posting.lines) {
      if (!articleMap.has(line.artId)) {
        throw new Error(`Articulo ${line.artId} no encontrado en SICAR.`);
      }
    }

    const [headerResult] = await connection.query(
      `INSERT INTO ajusteinventario (fecha, comentario, tipo) VALUES (?, ?, 0)`,
      [new Date(), posting.comment],
    );

    const ainId = Number(headerResult.insertId);

    for (const line of posting.lines) {
      const article = articleMap.get(line.artId);
      const exisAnterior = round(article.existencia, 4);
      const diferencia = round(line.quantity, 4);
      const exisActual = round(exisAnterior + diferencia, 4);
      const precioCompraActual = round(article.precioCompra, 3);
      const precioVenta = round(article.precio1, 6);
      const precioCompraDetalle =
        line.direction === "POSITIVE" ? round(line.detailUnitCost, 3) : precioCompraActual;
      const preCompraPromDetalle = round(line.detailAvgCost, 3);
      const importeCom =
        line.direction === "POSITIVE"
          ? round(line.inventoryTotal, 2)
          : round(diferencia * precioCompraDetalle, 2);
      const importeProm = round(line.averageTotal, 2);
      const importeVenta = round(diferencia * precioVenta, 2);

      await connection.query(
        `INSERT INTO ajusteinventarioarticulo (
          ain_id,
          art_id,
          exisAnterior,
          exisActual,
          precioCompra,
          preCompraProm,
          diferencia,
          importeCom,
          importeProm,
          precioVenta,
          importeVenta
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ainId,
          line.artId,
          exisAnterior,
          exisActual,
          precioCompraDetalle,
          preCompraPromDetalle,
          diferencia,
          importeCom,
          importeProm,
          precioVenta,
          importeVenta,
        ],
      );

      if (line.updateCost) {
        await connection.query(
          `UPDATE articulo
           SET existencia = ?, precioCompra = ?, preCompraProm = ?
           WHERE art_id = ?`,
          [exisActual, round(line.detailUnitCost, 3), preCompraPromDetalle, line.artId],
        );
      } else {
        await connection.query(`UPDATE articulo SET existencia = ? WHERE art_id = ?`, [exisActual, line.artId]);
      }

      await connection.query(
        `INSERT INTO historial (movimiento, fecha, tabla, id, usu_id) VALUES (?, ?, ?, ?, ?)`,
        [1, new Date(), "articulo", line.artId, CONFIG.sicarUserId],
      );
    }

    await connection.query(
      `INSERT INTO historial (movimiento, fecha, tabla, id, usu_id) VALUES (?, ?, ?, ?, ?)`,
      [0, new Date(), "ajusteinventario", ainId, CONFIG.sicarUserId],
    );

    await connection.commit();

    return {
      ainId,
      comment: posting.comment,
      lines: posting.lines,
      totals: posting.totals,
      reused: false,
      sourceProduct: draft.sourceProduct ?? null,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
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

function buildPostingJobV2(record) {
  const posting = buildPostingLines(record, {
    requestId: String(record.productionOrderId ?? ""),
  });

  return {
    productionOrderId: Number(record.productionOrderId ?? 0),
    folio: String(record.folio ?? ""),
    workflowStage: String(record.workflowStage ?? "READY_FOR_SICAR"),
    status: CONFIG.enableSicarWrites ? "READY_TO_POST" : "SIMULATED",
    mode: CONFIG.enableSicarWrites ? "write-enabled" : "dry-run",
    sourceProduct: record.draft?.sourceProduct ?? null,
    sourceWeight: posting.totals.sourceWeight,
    outputCount: posting.totals.outputs.length,
    inputCount: posting.totals.inputs.length + posting.totals.manualCosts.length,
    totalCost: posting.totals.totalCost,
    comment: posting.comment,
    lines: posting.lines.map((line) => ({
      artId: line.artId,
      label: line.label,
      direction: line.direction,
      quantity: line.quantity,
      detailUnitCost: line.detailUnitCost,
      detailAvgCost: line.detailAvgCost,
      inventoryTotal: line.inventoryTotal,
      averageTotal: line.averageTotal,
      updateCost: line.updateCost,
    })),
    createdAt: String(record.createdAt ?? nowIso()),
    updatedAt: nowIso(),
    note: CONFIG.enableSicarWrites
      ? "Listo para escribir ajuste real en SICAR."
      : "Simulacion local: no se escribe en SICAR hasta autorizacion explicita.",
  };
}

async function syncPostingQueueV2() {
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
    const job = buildPostingJobV2(record);
    const requestId = String(request.requestId ?? productionOrderId);
    const requestedAt = String(request.requestedAt ?? nowIso());
    const processedAt = nowIso();

    try {
      if (!CONFIG.enableSicarWrites) {
        await db
          .collection(COLLECTIONS.sicarJobs)
          .doc(String(job.productionOrderId))
          .set(
            {
              ...job,
              requestId,
              requestedAt,
              status: "SIMULATED",
              processedAt,
              updatedAt: processedAt,
            },
            { merge: true },
          );

        await requestDoc.ref.set(
          {
            status: "SIMULATED",
            processedAt,
            updatedAt: processedAt,
          },
          { merge: true },
        );
      } else {
        const connection = await getSicarPool().getConnection();

        try {
          const postingResult = await createSicarAdjustment(connection, record, {
            ...request,
            requestId,
          });

          await db
            .collection(COLLECTIONS.sicarJobs)
            .doc(String(job.productionOrderId))
            .set(
              {
                ...job,
                requestId,
                requestedAt,
                status: "POSTED",
                ainId: postingResult.ainId,
                comment: postingResult.comment,
                reused: Boolean(postingResult.reused),
                processedAt,
                updatedAt: processedAt,
              },
              { merge: true },
            );

          await requestDoc.ref.set(
            {
              status: "COMPLETED",
              ainId: postingResult.ainId,
              comment: postingResult.comment,
              processedAt,
              updatedAt: processedAt,
            },
            { merge: true },
          );

          await orderSnapshot.ref.set(
            {
              status: "COMPLETED",
              workflowStage: "POSTED_TO_SICAR",
              updatedAt: processedAt,
              sicarPosting: {
                ainId: postingResult.ainId,
                comment: postingResult.comment,
                postedAt: processedAt,
                requestId,
                reused: Boolean(postingResult.reused),
              },
            },
            { merge: true },
          );
        } finally {
          connection.release();
        }
      }

      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo postear a SICAR.";

      await db
        .collection(COLLECTIONS.sicarJobs)
        .doc(String(job.productionOrderId))
        .set(
          {
            ...job,
            requestId,
            requestedAt,
            status: "ERROR",
            processedAt,
            updatedAt: processedAt,
            lastErrorMessage: message,
          },
          { merge: true },
        );

      await requestDoc.ref.set(
        {
          status: "ERROR",
          updatedAt: processedAt,
          lastErrorMessage: message,
        },
        { merge: true },
      );

      log("Error posteando a SICAR", {
        productionOrderId,
        requestId,
        message,
      });
    }
  }

  await writeRuntime({
    jobs: {
      rows: processed,
      syncedAt: nowIso(),
    },
  });

  log("Cola SICAR procesada", { rows: processed, mode: CONFIG.enableSicarWrites ? "write" : "dry-run" });
}

async function runCycle() {
  await writeRuntime({
    status: "running",
    startedAt: nowIso(),
  });

  await syncCatalogItems();
  await syncScalePresets();
  await syncPostingQueueV2();

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
