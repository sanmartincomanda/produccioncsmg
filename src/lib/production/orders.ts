import "server-only";

import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { revalidatePath } from "next/cache";

import { getAppPool } from "@/lib/db/app-db";
import { calculateProductionTotals } from "@/lib/production/costing";
import { normalizeProductionDraft } from "@/lib/production/draft";
import type {
  ArticleProfileDefault,
  ProductionDraft,
  ProductionOrderListItem,
  ProductionOrderRecord,
  ProductionWorkflowStage,
  SicarPostingPreview,
} from "@/types/production";

type SnapshotPayload = {
  workflowStage: ProductionWorkflowStage;
  draft: ProductionDraft;
  totals?: ReturnType<typeof calculateProductionTotals>;
};

function parseNumber(value: string | number | null | undefined) {
  return Number(value ?? 0) || 0;
}

function buildSnapshot(payload: SnapshotPayload) {
  return JSON.stringify({
    workflowStage: payload.workflowStage,
    draft: payload.draft,
    totals: payload.totals ?? null,
    updatedAt: new Date().toISOString(),
  });
}

function parseSnapshot(rawSnapshot: unknown): SnapshotPayload {
  if (!rawSnapshot || typeof rawSnapshot !== "string") {
    return {
      workflowStage: "PRODUCED",
      draft: normalizeProductionDraft(null),
    };
  }

  try {
    const parsed = JSON.parse(rawSnapshot) as {
      workflowStage?: ProductionWorkflowStage;
      draft?: unknown;
    };

    return {
      workflowStage: parsed.workflowStage ?? "PRODUCED",
      draft: normalizeProductionDraft(parsed.draft),
    };
  } catch {
    return {
      workflowStage: "PRODUCED",
      draft: normalizeProductionDraft(null),
    };
  }
}

async function getNextProductionFolio(connection: PoolConnection) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `
      SELECT folio
      FROM production_orders
      WHERE folio LIKE 'PR-%'
      ORDER BY production_order_id DESC
      LIMIT 1
    `,
  );

  const lastFolio = String(rows[0]?.folio ?? "PR-000");
  const lastNumber = Number(lastFolio.replace(/^PR-/u, "")) || 0;
  return `PR-${String(lastNumber + 1).padStart(3, "0")}`;
}

async function replaceOrderLines(
  connection: PoolConnection,
  productionOrderId: number,
  draft: ProductionDraft,
  articleProfiles: ArticleProfileDefault[],
  shouldPersistCosts: boolean,
) {
  const totals = calculateProductionTotals(draft, articleProfiles);

  await connection.query(`DELETE FROM production_order_inputs WHERE production_order_id = ?`, [productionOrderId]);
  await connection.query(`DELETE FROM production_order_outputs WHERE production_order_id = ?`, [productionOrderId]);

  if (draft.sourceProduct) {
    await connection.query(
      `
        INSERT INTO production_order_inputs (
          production_order_id,
          sicar_art_id,
          actual_quantity,
          unit_name,
          unit_cost,
          total_cost,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, 'SOURCE_PRODUCT')
      `,
      [
        productionOrderId,
        draft.sourceProduct.artId,
        parseNumber(draft.sourceWeight),
        draft.sourceProduct.unidadVenta || "LB",
        parseNumber(draft.sourceUnitCost),
        totals.sourceTotal,
      ],
    );
  }

  for (const input of draft.inputs.filter((item) => item.manualCostItemId || item.label)) {
    const quantity = parseNumber(input.weight);
    const unitCost = parseNumber(input.unitCost);
    await connection.query(
      `
        INSERT INTO production_order_inputs (
          production_order_id,
          manual_cost_item_id,
          actual_quantity,
          unit_name,
          unit_cost,
          total_cost,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        productionOrderId,
        input.manualCostItemId,
        quantity,
        input.unitName || "PZA",
        unitCost,
        quantity * unitCost,
        `GENERAL_INPUT:${input.label}`,
      ],
    );
  }

  for (const manualCost of draft.manualCosts.filter((item) => item.manualCostItemId || item.label)) {
    const quantity = parseNumber(manualCost.multiplier);
    const unitCost = parseNumber(manualCost.cost);
    await connection.query(
      `
        INSERT INTO production_order_inputs (
          production_order_id,
          manual_cost_item_id,
          actual_quantity,
          unit_name,
          unit_cost,
          total_cost,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        productionOrderId,
        manualCost.manualCostItemId,
        quantity,
        "PZA",
        unitCost,
        quantity * unitCost,
        `MANUAL_COST:${manualCost.label}`,
      ],
    );
  }

  for (const output of draft.outputs.filter((item) => item.article)) {
    const calculated = totals.outputs.find((item) => item.id === output.id);
    await connection.query(
      `
        INSERT INTO production_order_outputs (
          production_order_id,
          sicar_art_id,
          actual_quantity,
          unit_name,
          vrn_percentage,
          allocated_cost,
          produced_unit_cost,
          cost_update_mode,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PRODUCED_COST_ONLY', ?)
      `,
      [
        productionOrderId,
        output.article?.artId,
        parseNumber(output.weight),
        output.article?.unidadVenta || "LB",
        Number(calculated?.relativeValue ?? 0),
        shouldPersistCosts ? Number(calculated?.allocatedCost ?? 0) : null,
        shouldPersistCosts ? Number(calculated?.producedUnitCost ?? 0) : null,
        output.article ? `${output.article.clave} - ${output.article.descripcion}` : "OUTPUT",
      ],
    );
  }

  return totals;
}

export async function createProductionOrder(
  draftInput: unknown,
  articleProfiles: ArticleProfileDefault[],
) {
  const draft = normalizeProductionDraft(draftInput);

  if (!draft.sourceProduct) {
    throw new Error("Selecciona el producto base antes de guardar la producción.");
  }

  if (!draft.outputs.some((item) => item.article)) {
    throw new Error("Agrega al menos un producto producido antes de guardar.");
  }

  const pool = getAppPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const folio = await getNextProductionFolio(connection);
    const [insertResult] = await connection.query<ResultSetHeader>(
      `
        INSERT INTO production_orders (
          folio,
          status,
          completed_at,
          notes,
          costing_snapshot
        ) VALUES (?, 'DRAFT', NOW(), ?, ?)
      `,
      [
        folio,
        draft.sourceProduct ? `${draft.sourceProduct.clave} - ${draft.sourceProduct.descripcion}` : "",
        buildSnapshot({
          workflowStage: "PRODUCED",
          draft,
        }),
      ],
    );

    const productionOrderId = Number(insertResult.insertId);
    await replaceOrderLines(connection, productionOrderId, draft, articleProfiles, false);

    await connection.commit();

    revalidatePath("/");
    revalidatePath("/costeo");
    revalidatePath("/historial");
    revalidatePath("/sicar");

    return {
      productionOrderId,
      folio,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateProductionOrderCosting(
  productionOrderId: number,
  draftInput: unknown,
  articleProfiles: ArticleProfileDefault[],
) {
  const draft = normalizeProductionDraft(draftInput);
  const pool = getAppPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const totals = await replaceOrderLines(connection, productionOrderId, draft, articleProfiles, true);

    await connection.query(
      `
        UPDATE production_orders
        SET
          status = 'IN_PROGRESS',
          notes = ?,
          costing_snapshot = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE production_order_id = ?
      `,
      [
        draft.sourceProduct ? `${draft.sourceProduct.clave} - ${draft.sourceProduct.descripcion}` : "",
        buildSnapshot({
          workflowStage: "COSTED",
          draft,
          totals,
        }),
        productionOrderId,
      ],
    );

    await connection.commit();

    revalidatePath("/costeo");
    revalidatePath("/historial");
    revalidatePath("/sicar");

    return { ok: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getProductionOrders(
  allowedStatuses?: string[],
): Promise<ProductionOrderListItem[]> {
  const pool = getAppPool();
  const params: Array<string> = [];
  const whereSql =
    allowedStatuses && allowedStatuses.length > 0
      ? `WHERE po.status IN (${allowedStatuses.map(() => "?").join(", ")})`
      : "";

  if (allowedStatuses) {
    params.push(...allowedStatuses);
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        po.production_order_id AS productionOrderId,
        po.folio,
        po.status,
        po.costing_snapshot AS costingSnapshot,
        po.created_at AS createdAt,
        po.updated_at AS updatedAt
      FROM production_orders po
      ${whereSql}
      ORDER BY po.production_order_id DESC
      LIMIT 100
    `,
    params,
  );

  return rows.map((row) => {
    const snapshot = parseSnapshot(row.costingSnapshot);
    const totals = calculateProductionTotals(snapshot.draft, []);
    return {
      productionOrderId: Number(row.productionOrderId),
      folio: String(row.folio),
      status: String(row.status),
      workflowStage: snapshot.workflowStage,
      sourceLabel: snapshot.draft.sourceProduct
        ? `${snapshot.draft.sourceProduct.clave} - ${snapshot.draft.sourceProduct.descripcion}`
        : "Producción sin base",
      sourceWeight: totals.sourceWeight,
      producedWeight: totals.producedWeight,
      totalCost: totals.totalCost,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
  });
}

export async function getProductionOrderRecord(
  productionOrderId: number,
): Promise<ProductionOrderRecord | null> {
  const pool = getAppPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        production_order_id AS productionOrderId,
        folio,
        status,
        costing_snapshot AS costingSnapshot,
        created_at AS createdAt,
        updated_at AS updatedAt,
        completed_at AS completedAt
      FROM production_orders
      WHERE production_order_id = ?
      LIMIT 1
    `,
    [productionOrderId],
  );

  const row = rows[0];

  if (!row) {
    return null;
  }

  const snapshot = parseSnapshot(row.costingSnapshot);

  return {
    productionOrderId: Number(row.productionOrderId),
    folio: String(row.folio),
    status: String(row.status),
    workflowStage: snapshot.workflowStage,
    draft: snapshot.draft,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
  };
}

export async function getSicarPostingPreviews(): Promise<SicarPostingPreview[]> {
  const orders = await getProductionOrders(["IN_PROGRESS", "COMPLETED"]);
  const records = await Promise.all(orders.map((order) => getProductionOrderRecord(order.productionOrderId)));

  return records
    .filter((record): record is ProductionOrderRecord => Boolean(record))
    .map((record) => {
      const totals = calculateProductionTotals(record.draft, []);
      return {
        productionOrderId: record.productionOrderId,
        folio: record.folio,
        status: record.status,
        workflowStage: record.workflowStage,
        sourceProductLabel: record.draft.sourceProduct
          ? `${record.draft.sourceProduct.clave} - ${record.draft.sourceProduct.descripcion}`
          : "Sin producto base",
        sourceWeight: parseNumber(record.draft.sourceWeight),
        totalProducedWeight: totals.producedWeight,
        totalCost: totals.totalCost,
        outputCount: totals.outputs.length,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        sourceConsumption: record.draft.sourceProduct
          ? [
              {
                label: `${record.draft.sourceProduct.clave} - ${record.draft.sourceProduct.descripcion}`,
                quantity: parseNumber(record.draft.sourceWeight),
                unitName: record.draft.sourceProduct.unidadVenta || "LB",
                unitCost: parseNumber(record.draft.sourceUnitCost),
                totalCost: totals.sourceTotal,
              },
            ]
          : [],
        outputEntries: totals.outputs.map((output, index) => ({
          label: output.label || `Producto ${index + 1}`,
          quantity: output.weight,
          unitName: record.draft.outputs[index]?.article?.unidadVenta || "LB",
          producedUnitCost: output.producedUnitCost,
          allocatedCost: output.allocatedCost,
        })),
      };
    });
}
