import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";

import { getAppPool } from "@/lib/db/app-db";

const articleProfileSchema = z.object({
  sicarArtId: z.coerce.number().int().positive(),
  productionRole: z.enum(["RAW_MATERIAL", "FINISHED_GOOD", "BYPRODUCT", "CONSUMABLE", "PACKAGING"]),
  vrnPercentage: z.coerce.number().min(0).max(100),
  costingMode: z.enum(["SICAR_AVERAGE", "SICAR_LAST_PURCHASE", "VRN_PRODUCED", "STANDARD", "MANUAL"]),
  manualCost: z.union([z.coerce.number().min(0), z.null()]),
  notes: z.string().max(1000).optional().default(""),
});

export async function POST(request: NextRequest) {
  const payload = articleProfileSchema.parse(await request.json());
  const pool = getAppPool();

  await pool.query(
    `
      INSERT INTO article_profiles (
        sicar_art_id,
        production_role,
        vrn_percentage,
        costing_mode,
        manual_cost,
        characteristic_notes
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        production_role = VALUES(production_role),
        vrn_percentage = VALUES(vrn_percentage),
        costing_mode = VALUES(costing_mode),
        manual_cost = VALUES(manual_cost),
        characteristic_notes = VALUES(characteristic_notes),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      payload.sicarArtId,
      payload.productionRole,
      payload.vrnPercentage,
      payload.costingMode,
      payload.manualCost,
      payload.notes,
    ],
  );

  revalidatePath("/configuracion");
  revalidatePath("/costeo");

  return NextResponse.json({ ok: true });
}
