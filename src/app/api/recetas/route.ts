import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";

import { getAppPool } from "@/lib/db/app-db";
import { directMysqlWebError, isDirectMysqlWebEnabled } from "@/lib/server/direct-mysql-web";

const articleSchema = z.object({
  artId: z.coerce.number().int().positive(),
  clave: z.string().optional(),
  descripcion: z.string().optional(),
  unidadVenta: z.string().optional(),
});

const draftInputSchema = z.object({
  manualCostItemId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  label: z.string().max(160).optional(),
  unitName: z.string().max(16).optional(),
  article: articleSchema.nullable().optional(),
  weight: z.union([z.string(), z.number()]).optional(),
  unitCost: z.union([z.string(), z.number()]).optional(),
});

const draftOutputSchema = z.object({
  article: articleSchema.nullable(),
  weight: z.union([z.string(), z.number()]).optional(),
  percentage: z.union([z.string(), z.number()]).optional(),
});

const draftManualCostSchema = z.object({
  manualCostItemId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  label: z.string().max(160).optional(),
  cost: z.union([z.string(), z.number()]).optional(),
  multiplier: z.union([z.string(), z.number()]).optional(),
});

const saveRecipeSchema = z.object({
  recipeId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  name: z.string().trim().min(1).max(160),
  draft: z.object({
    sourceProduct: articleSchema.nullable(),
    sourceWeight: z.union([z.string(), z.number()]).optional(),
    sourceUnitCost: z.union([z.string(), z.number()]).optional(),
    inputs: z.array(draftInputSchema).default([]),
    outputs: z.array(draftOutputSchema).default([]),
    manualCosts: z.array(draftManualCostSchema).default([]),
  }),
});

function toNumber(value: string | number | null | undefined) {
  return Number(value ?? 0) || 0;
}

function sanitizeCodeToken(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
}

function buildRecipeCode(name: string, articleCode: string) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const base = sanitizeCodeToken(articleCode || name || "RECETA");
  return `REC-${base}-${stamp}`.slice(0, 40);
}

export async function POST(request: NextRequest) {
  if (!isDirectMysqlWebEnabled()) {
    return NextResponse.json({ ok: false, error: directMysqlWebError() }, { status: 503 });
  }

  let connection: PoolConnection | null = null;

  try {
    const rawPayload = await request.json();
    const parsedPayload = saveRecipeSchema.safeParse(rawPayload);

    if (!parsedPayload.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "La receta tiene datos incompletos o inválidos.",
          details: parsedPayload.error.flatten(),
        },
        { status: 400 },
      );
    }

    const payload = parsedPayload.data;

    if (!payload.draft.sourceProduct) {
      return NextResponse.json(
        { ok: false, error: "Selecciona el producto base antes de guardar la receta." },
        { status: 400 },
      );
    }

    const outputs = payload.draft.outputs.filter((output) => output.article);

    if (outputs.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Agrega al menos un producto producido para guardar la receta." },
        { status: 400 },
      );
    }

    const pool = getAppPool();
    connection = await pool.getConnection();
    await connection.beginTransaction();

    let recipeId = payload.recipeId ?? null;
    let recipeCode = "";

    if (recipeId) {
      const [existingRows] = await connection.query<RowDataPacket[]>(
        `
          SELECT recipe_id AS recipeId, code
          FROM recipes
          WHERE recipe_id = ?
          LIMIT 1
        `,
        [recipeId],
      );

      const existingRecipe = (existingRows as Array<{ recipeId: number; code: string }>)[0];

      if (!existingRecipe) {
        throw new Error("La receta seleccionada ya no existe.");
      }

      recipeCode = existingRecipe.code;

      await connection.query(
        `
          UPDATE recipes
          SET
            name = ?,
            batch_size = ?,
            batch_unit = ?,
            costing_method = 'VRN',
            status = 'ACTIVE',
            notes = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE recipe_id = ?
        `,
        [
          payload.name,
          toNumber(payload.draft.sourceWeight),
          payload.draft.sourceProduct.unidadVenta || "LB",
          `Base ${payload.draft.sourceProduct.clave}`,
          recipeId,
        ],
      );

      await connection.query(`DELETE FROM recipe_inputs WHERE recipe_id = ?`, [recipeId]);
      await connection.query(`DELETE FROM recipe_outputs WHERE recipe_id = ?`, [recipeId]);
    } else {
      recipeCode = buildRecipeCode(payload.name, payload.draft.sourceProduct.clave ?? "");

      const [insertResult] = await connection.query<ResultSetHeader>(
        `
          INSERT INTO recipes (
            code,
            name,
            version_no,
            batch_size,
            batch_unit,
            costing_method,
            status,
            notes
          ) VALUES (?, ?, 1, ?, ?, 'VRN', 'ACTIVE', ?)
        `,
        [
          recipeCode,
          payload.name,
          toNumber(payload.draft.sourceWeight),
          payload.draft.sourceProduct.unidadVenta || "LB",
          `Base ${payload.draft.sourceProduct.clave}`,
        ],
      );

      recipeId = Number(insertResult.insertId);
    }

    await connection.query(
      `
        INSERT INTO recipe_inputs (
          recipe_id,
          line_order,
          sicar_art_id,
          quantity,
          unit_name,
          fixed_cost_amount,
          notes
        ) VALUES (?, ?, ?, ?, ?, ?, 'SOURCE_PRODUCT')
      `,
      [
        recipeId,
        1,
        payload.draft.sourceProduct.artId,
        toNumber(payload.draft.sourceWeight),
        payload.draft.sourceProduct.unidadVenta || "LB",
        toNumber(payload.draft.sourceUnitCost),
      ],
    );

    let inputLineOrder = 2;

    for (const input of payload.draft.inputs.filter((item) => item.manualCostItemId || item.article || item.label)) {
      const isManualInput = Boolean(input.manualCostItemId);

      await connection.query(
        `
          INSERT INTO recipe_inputs (
            recipe_id,
            line_order,
            sicar_art_id,
            manual_cost_item_id,
            quantity,
            unit_name,
            fixed_cost_amount,
            notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          recipeId,
          inputLineOrder,
          isManualInput ? null : input.article?.artId ?? null,
          input.manualCostItemId ?? null,
          toNumber(input.weight),
          input.unitName || input.article?.unidadVenta || "LB",
          toNumber(input.unitCost),
          `GENERAL_INPUT:${(input.label ?? "").trim()}`,
        ],
      );

      inputLineOrder += 1;
    }

    for (const manualCost of payload.draft.manualCosts.filter((item) => item.label || item.manualCostItemId)) {
      await connection.query(
        `
          INSERT INTO recipe_inputs (
            recipe_id,
            line_order,
            manual_cost_item_id,
            quantity,
            unit_name,
            fixed_cost_amount,
            notes
          ) VALUES (?, ?, ?, ?, 'LB', ?, ?)
        `,
        [
          recipeId,
          inputLineOrder,
          manualCost.manualCostItemId ?? null,
          toNumber(manualCost.multiplier),
          toNumber(manualCost.cost),
          `MANUAL_COST:${(manualCost.label ?? "").trim()}`,
        ],
      );

      inputLineOrder += 1;
    }

    let outputLineOrder = 1;

    for (const output of outputs) {
      await connection.query(
        `
          INSERT INTO recipe_outputs (
            recipe_id,
            line_order,
            sicar_art_id,
            expected_quantity,
            unit_name,
            vrn_percentage,
            is_primary_output
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          recipeId,
          outputLineOrder,
          output.article?.artId,
          toNumber(output.weight),
          output.article?.unidadVenta || "LB",
          toNumber(output.percentage),
          outputLineOrder === 1 ? 1 : 0,
        ],
      );

      outputLineOrder += 1;
    }

    await connection.commit();

    revalidatePath("/costeo");
    revalidatePath("/recetas");

    return NextResponse.json({
      ok: true,
      recipeId,
      recipeCode,
      recipeName: payload.name,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "No se pudo guardar la receta.",
      },
      { status: 500 },
    );
  } finally {
    connection?.release();
  }
}
