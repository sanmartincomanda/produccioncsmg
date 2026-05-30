import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";

import { getAppPool } from "@/lib/db/app-db";
import { directMysqlWebError, isDirectMysqlWebEnabled } from "@/lib/server/direct-mysql-web";

const manualCostItemSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  unitName: z.string().trim().min(1).max(16),
  costType: z.enum(["LABOR", "PACKAGING", "UTILITY", "INDIRECT", "OTHER"]),
  currentCost: z.coerce.number().min(0),
  notes: z.string().max(1000).optional().default(""),
});

export async function POST(request: NextRequest) {
  if (!isDirectMysqlWebEnabled()) {
    return NextResponse.json({ ok: false, error: directMysqlWebError() }, { status: 503 });
  }

  const payload = manualCostItemSchema.parse(await request.json());
  const pool = getAppPool();

  await pool.query(
    `
      INSERT INTO manual_cost_items (
        code,
        name,
        unit_name,
        cost_type,
        current_cost,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        unit_name = VALUES(unit_name),
        cost_type = VALUES(cost_type),
        current_cost = VALUES(current_cost),
        notes = VALUES(notes),
        updated_at = CURRENT_TIMESTAMP
    `,
    [
      payload.code,
      payload.name,
      payload.unitName,
      payload.costType,
      payload.currentCost,
      payload.notes,
    ],
  );

  revalidatePath("/configuracion");
  revalidatePath("/costeo");

  return NextResponse.json({ ok: true });
}
