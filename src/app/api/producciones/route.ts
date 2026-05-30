import { NextRequest, NextResponse } from "next/server";

import { directMysqlWebError, isDirectMysqlWebEnabled } from "@/lib/server/direct-mysql-web";
import { getArticleProfileDefaults } from "@/lib/production/data";
import { createProductionOrder } from "@/lib/production/orders";

export async function POST(request: NextRequest) {
  if (!isDirectMysqlWebEnabled()) {
    return NextResponse.json({ ok: false, error: directMysqlWebError() }, { status: 503 });
  }

  try {
    const payload = await request.json();
    const articleProfiles = await getArticleProfileDefaults();
    const result = await createProductionOrder(payload.draft, articleProfiles);

    return NextResponse.json({
      ok: true,
      productionOrderId: result.productionOrderId,
      folio: result.folio,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "No se pudo guardar la producción.",
      },
      { status: 400 },
    );
  }
}
