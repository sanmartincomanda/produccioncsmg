import { NextRequest, NextResponse } from "next/server";

import { getArticleProfileDefaults } from "@/lib/production/data";
import { updateProductionOrderCosting } from "@/lib/production/orders";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const productionOrderId = Number(id);

    if (!productionOrderId) {
      return NextResponse.json({ ok: false, error: "Producción inválida." }, { status: 400 });
    }

    const payload = await request.json();
    const articleProfiles = await getArticleProfileDefaults();
    await updateProductionOrderCosting(productionOrderId, payload.draft, articleProfiles);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "No se pudo guardar el costeo.",
      },
      { status: 400 },
    );
  }
}
