import "server-only";

import type { RowDataPacket } from "mysql2";

import { getAppPool } from "@/lib/db/app-db";
import type {
  ArticleProfileDefault,
  CatalogOption,
  ManualCostItem,
  ProductionHistoryRow,
  ProductionRecipeTemplate,
} from "@/types/production";

type DateRangeFilters = {
  dateFrom?: string;
  dateTo?: string;
  folio?: string;
};

function mapCatalogOption(row: RowDataPacket): CatalogOption | null {
  if (!row.artId) {
    return null;
  }

  return {
    artId: Number(row.artId),
    clave: String(row.clave ?? ""),
    descripcion: String(row.descripcion ?? ""),
    unidadVenta: String(row.unidadVenta ?? row.unitName ?? ""),
    existencia: Number(row.existencia ?? 0),
    precioCompra: Number(row.precioCompra ?? 0),
    preCompraProm: Number(row.preCompraProm ?? 0),
  };
}

export async function getArticleProfileDefaults(): Promise<ArticleProfileDefault[]> {
  const pool = getAppPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        ap.article_profile_id AS articleProfileId,
        ap.sicar_art_id AS sicarArtId,
        CONCAT(a.clave, ' - ', a.descripcion) AS articleLabel,
        ap.production_role AS productionRole,
        ap.vrn_percentage AS vrnPercentage,
        ap.costing_mode AS costingMode,
        ap.manual_cost AS manualCost,
        COALESCE(ap.characteristic_notes, '') AS notes
      FROM article_profiles ap
      LEFT JOIN sicar.articulo a ON a.art_id = ap.sicar_art_id
      ORDER BY ap.updated_at DESC, ap.article_profile_id DESC
      LIMIT 50
    `,
  );

  return rows.map((row) => ({
    articleProfileId: Number(row.articleProfileId),
    sicarArtId: Number(row.sicarArtId),
    articleLabel: String(row.articleLabel ?? row.sicarArtId),
    productionRole: row.productionRole,
    vrnPercentage: Number(row.vrnPercentage ?? 0),
    costingMode: row.costingMode,
    manualCost: row.manualCost === null ? null : Number(row.manualCost),
    notes: String(row.notes ?? ""),
  })) as ArticleProfileDefault[];
}

export async function getManualCostItems(): Promise<ManualCostItem[]> {
  const pool = getAppPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        manual_cost_item_id AS manualCostItemId,
        code,
        name,
        unit_name AS unitName,
        cost_type AS costType,
        current_cost AS currentCost,
        is_active AS isActive,
        COALESCE(notes, '') AS notes
      FROM manual_cost_items
      ORDER BY is_active DESC, code ASC
      LIMIT 100
    `,
  );

  return rows.map((row) => ({
    manualCostItemId: Number(row.manualCostItemId),
    code: String(row.code),
    name: String(row.name),
    unitName: String(row.unitName),
    costType: row.costType,
    currentCost: Number(row.currentCost ?? 0),
    isActive: Boolean(row.isActive),
    notes: String(row.notes ?? ""),
  })) as ManualCostItem[];
}

export async function getProductionHistory(
  filters: DateRangeFilters = {},
): Promise<ProductionHistoryRow[]> {
  const pool = getAppPool();
  const where: string[] = [];
  const params: Array<string> = [];

  if (filters.dateFrom) {
    where.push("DATE(po.created_at) >= ?");
    params.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    where.push("DATE(po.created_at) <= ?");
    params.push(filters.dateTo);
  }

  if (filters.folio) {
    where.push("po.folio LIKE ?");
    params.push(`%${filters.folio}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        po.production_order_id AS productionOrderId,
        po.folio,
        po.status,
        po.scheduled_at AS scheduledAt,
        po.completed_at AS completedAt,
        COUNT(DISTINCT poo.production_order_output_id) AS outputLines,
        COUNT(DISTINCT poi.production_order_input_id) AS inputLines,
        COUNT(DISTINCT pm.production_movement_id) AS movementLines,
        COALESCE(SUM(poo.allocated_cost), 0) AS estimatedTotalCost,
        COALESCE(po.notes, '') AS notes
      FROM production_orders po
      LEFT JOIN production_order_outputs poo ON poo.production_order_id = po.production_order_id
      LEFT JOIN production_order_inputs poi ON poi.production_order_id = po.production_order_id
      LEFT JOIN production_movements pm ON pm.production_order_id = po.production_order_id
      ${whereSql}
      GROUP BY
        po.production_order_id,
        po.folio,
        po.status,
        po.scheduled_at,
        po.completed_at,
        po.notes
      ORDER BY po.created_at DESC, po.production_order_id DESC
      LIMIT 100
    `,
    params,
  );

  return rows.map((row) => ({
    productionOrderId: Number(row.productionOrderId),
    folio: String(row.folio),
    status: String(row.status),
    workflowStage: "PRODUCED",
    scheduledAt: row.scheduledAt ? String(row.scheduledAt) : null,
    completedAt: row.completedAt ? String(row.completedAt) : null,
    updatedAt: row.completedAt ? String(row.completedAt) : row.scheduledAt ? String(row.scheduledAt) : "",
    outputLines: Number(row.outputLines ?? 0),
    inputLines: Number(row.inputLines ?? 0),
    movementLines: Number(row.movementLines ?? 0),
    estimatedTotalCost: Number(row.estimatedTotalCost ?? 0),
    sourceLabel: String(row.notes ?? ""),
    sourceWeight: 0,
    producedWeight: 0,
    sourceConsumption: [],
    outputEntries: [],
    manualCostEntries: [],
    sicarStatusLabel: "PENDIENTE",
    sicarAinId: null,
    sicarComment: "",
    excludedReason: null,
    notes: String(row.notes ?? ""),
  }));
}

export async function getProductionRecipeTemplates(): Promise<ProductionRecipeTemplate[]> {
  const pool = getAppPool();
  const [recipeRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        recipe_id AS recipeId,
        code,
        name,
        version_no AS versionNo,
        status,
        updated_at AS updatedAt
      FROM recipes
      ORDER BY updated_at DESC, recipe_id DESC
      LIMIT 50
    `,
  );

  if (recipeRows.length === 0) {
    return [];
  }

  const recipeIds = recipeRows.map((row) => Number(row.recipeId));
  const recipePlaceholders = recipeIds.map(() => "?").join(", ");

  const [inputRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        ri.recipe_id AS recipeId,
        ri.recipe_input_id AS recipeInputId,
        ri.manual_cost_item_id AS manualCostItemId,
        ri.quantity,
        ri.unit_name AS unitName,
        ri.fixed_cost_amount AS fixedCostAmount,
        COALESCE(ri.notes, '') AS notes,
        a.art_id AS artId,
        a.clave,
        a.descripcion,
        uv.nombre AS unidadVenta,
        a.existencia,
        a.precioCompra,
        a.preCompraProm,
        mci.code AS manualCode,
        mci.name AS manualName
      FROM recipe_inputs ri
      LEFT JOIN sicar.articulo a ON a.art_id = ri.sicar_art_id
      LEFT JOIN sicar.unidad uv ON uv.uni_id = a.unidadVenta
      LEFT JOIN manual_cost_items mci ON mci.manual_cost_item_id = ri.manual_cost_item_id
      WHERE ri.recipe_id IN (${recipePlaceholders})
      ORDER BY ri.recipe_id ASC, ri.line_order ASC, ri.recipe_input_id ASC
    `,
    recipeIds,
  );

  const [outputRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        ro.recipe_id AS recipeId,
        ro.recipe_output_id AS recipeOutputId,
        ro.expected_quantity AS expectedQuantity,
        ro.unit_name AS unitName,
        ro.vrn_percentage AS vrnPercentage,
        a.art_id AS artId,
        a.clave,
        a.descripcion,
        uv.nombre AS unidadVenta,
        a.existencia,
        a.precioCompra,
        a.preCompraProm
      FROM recipe_outputs ro
      LEFT JOIN sicar.articulo a ON a.art_id = ro.sicar_art_id
      LEFT JOIN sicar.unidad uv ON uv.uni_id = a.unidadVenta
      WHERE ro.recipe_id IN (${recipePlaceholders})
      ORDER BY ro.recipe_id ASC, ro.line_order ASC, ro.recipe_output_id ASC
    `,
    recipeIds,
  );

  return recipeRows.map((row) => {
    const recipeId = Number(row.recipeId);
    const recipeInputs = inputRows.filter((inputRow) => Number(inputRow.recipeId) === recipeId);
    const sourceRow = recipeInputs.find((inputRow) => String(inputRow.notes) === "SOURCE_PRODUCT");
    const generalInputs = recipeInputs.filter((inputRow) => {
      const notes = String(inputRow.notes ?? "");
      return notes.startsWith("GENERAL_INPUT");
    });
    const manualCosts = recipeInputs.filter((inputRow) => {
      const notes = String(inputRow.notes ?? "");
      return notes.startsWith("MANUAL_COST");
    });

    return {
      recipeId,
      code: String(row.code),
      name: String(row.name),
      versionNo: Number(row.versionNo ?? 1),
      status: row.status,
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
      sourceProduct: sourceRow ? mapCatalogOption(sourceRow) : null,
      sourceWeight: Number(sourceRow?.quantity ?? 0),
      sourceUnitCost: Number(sourceRow?.fixedCostAmount ?? 0),
      inputs: generalInputs.map((inputRow) => ({
        recipeInputId: Number(inputRow.recipeInputId),
        manualCostItemId:
          inputRow.manualCostItemId === null ? null : Number(inputRow.manualCostItemId),
        label:
          inputRow.manualCode && inputRow.manualName
            ? `${inputRow.manualCode} - ${inputRow.manualName}`
            : mapCatalogOption(inputRow)
              ? `${String(inputRow.clave ?? "")} - ${String(inputRow.descripcion ?? "")}`
              : "Insumo",
        unitName: String(inputRow.unitName ?? ""),
        weight: Number(inputRow.quantity ?? 0),
        unitCost: Number(inputRow.fixedCostAmount ?? 0),
      })),
      outputs: outputRows
        .filter((outputRow) => Number(outputRow.recipeId) === recipeId)
        .map((outputRow) => ({
          recipeOutputId: Number(outputRow.recipeOutputId),
          article: mapCatalogOption(outputRow),
          weight: Number(outputRow.expectedQuantity ?? 0),
          percentage: Number(outputRow.vrnPercentage ?? 0),
        })),
      manualCosts: manualCosts.map((manualCostRow) => ({
        recipeInputId: Number(manualCostRow.recipeInputId),
        manualCostItemId:
          manualCostRow.manualCostItemId === null ? null : Number(manualCostRow.manualCostItemId),
        label:
          manualCostRow.manualCode && manualCostRow.manualName
            ? `${manualCostRow.manualCode} - ${manualCostRow.manualName}`
            : String(manualCostRow.notes ?? "").replace(/^MANUAL_COST:?/u, "").trim(),
        cost: Number(manualCostRow.fixedCostAmount ?? 0),
        multiplier: Number(manualCostRow.quantity ?? 0),
      })),
    } as ProductionRecipeTemplate;
  });
}

export async function getConfigurationOverview() {
  const [profiles, manualCosts] = await Promise.all([
    getArticleProfileDefaults(),
    getManualCostItems(),
  ]);

  return {
    profiles,
    manualCosts,
  };
}
