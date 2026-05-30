import "server-only";

import type { RowDataPacket } from "mysql2";

import { getAppPool } from "@/lib/db/app-db";
import { getSicarPool } from "@/lib/db/sicar";

type CountRow = RowDataPacket & { total: number };

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

export async function getSicarOverview() {
  const pool = getSicarPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        COUNT(*) AS totalArticles,
        SUM(status = 1) AS activeArticles,
        SUM(status <> 1) AS inactiveArticles,
        SUM(existencia < 0) AS negativeExistence,
        SUM(insumo = 1) AS inputsMarked,
        SUM(platillo = 1) AS finishedMarked,
        SUM(caracteristicas <> '') AS taggedArticles,
        ROUND(SUM(GREATEST(existencia, 0) * preCompraProm), 2) AS inventoryValue
      FROM articulo
    `,
  );

  return {
    totalArticles: Number(rows[0]?.totalArticles ?? 0),
    activeArticles: Number(rows[0]?.activeArticles ?? 0),
    inactiveArticles: Number(rows[0]?.inactiveArticles ?? 0),
    negativeExistence: Number(rows[0]?.negativeExistence ?? 0),
    inputsMarked: Number(rows[0]?.inputsMarked ?? 0),
    finishedMarked: Number(rows[0]?.finishedMarked ?? 0),
    taggedArticles: Number(rows[0]?.taggedArticles ?? 0),
    inventoryValue: Number(rows[0]?.inventoryValue ?? 0),
  };
}

export async function getRecentInventoryAdjustments() {
  const pool = getSicarPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        ai.ain_id AS adjustmentId,
        ai.fecha,
        ai.comentario,
        COUNT(aia.art_id) AS lineCount,
        SUM(CASE WHEN aia.diferencia < 0 THEN 1 ELSE 0 END) AS negativeLines,
        SUM(CASE WHEN aia.diferencia > 0 THEN 1 ELSE 0 END) AS positiveLines,
        ROUND(SUM(COALESCE(aia.importeProm, 0)), 2) AS averageCostAmount
      FROM ajusteinventario ai
      LEFT JOIN ajusteinventarioarticulo aia ON aia.ain_id = ai.ain_id
      GROUP BY ai.ain_id, ai.fecha, ai.comentario
      ORDER BY ai.ain_id DESC
      LIMIT 8
    `,
  );

  return rows.map((row) => ({
    adjustmentId: Number(row.adjustmentId),
    fecha: String(row.fecha),
    comentario: String(row.comentario),
    lines: Number(row.lineCount ?? 0),
    negativeLines: Number(row.negativeLines ?? 0),
    positiveLines: Number(row.positiveLines ?? 0),
    averageCostAmount: Number(row.averageCostAmount ?? 0),
  }));
}

export async function getSicarScalePresets() {
  const pool = getSicarPool();
  const [scaleRows] = await pool.query<RowDataPacket[]>(
    `
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
    `,
  );
  const [barcodeRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        cba_id AS codeId,
        inicio AS startAt,
        posCla AS keyPosition,
        posPI AS weightPosition,
        antecede AS keyFirst,
        activo AS isActive
      FROM codigobascula
      ORDER BY cba_id
    `,
  );

  return {
    scaleRows: scaleRows.map((row) => ({
      scaleId: Number(row.scaleId),
      name: String(row.name),
      portName: String(row.portName),
      baudRate: Number(row.baudRate),
      pollDelayMs: Number(row.pollDelayMs),
      commandSequence: String(row.commandSequence),
      useCarriageReturn: Number(row.useCarriageReturn),
      dataBits: Number(row.dataBits),
    })),
    barcodeRows: barcodeRows.map((row) => ({
      codeId: Number(row.codeId),
      startAt: Number(row.startAt),
      keyPosition: Number(row.keyPosition),
      weightPosition: Number(row.weightPosition),
      keyFirst: Number(row.keyFirst),
      isActive: Number(row.isActive),
    })),
  };
}

async function countTable(tableName: string) {
  const pool = getAppPool();
  const [rows] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS total FROM \`${tableName}\``,
  );
  return Number(rows[0]?.total ?? 0);
}

export async function getAppOverview() {
  const [articleProfiles, recipes, productionOrders, manualCosts, scaleDevices] =
    await Promise.all([
      countTable("article_profiles"),
      countTable("recipes"),
      countTable("production_orders"),
      countTable("manual_cost_items"),
      countTable("scale_devices"),
    ]);

  return {
    articleProfiles,
    recipes,
    productionOrders,
    manualCosts,
    scaleDevices,
  };
}

export async function getDashboardData() {
  const [sicar, recentAdjustments, scalePresets, app] = await Promise.all([
    getSicarOverview(),
    getRecentInventoryAdjustments(),
    getSicarScalePresets(),
    getAppOverview(),
  ]);

  return {
    sicar,
    recentAdjustments,
    scalePresets,
    app,
  };
}
