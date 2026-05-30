import { NextRequest, NextResponse } from "next/server";

import { directMysqlWebError, isDirectMysqlWebEnabled } from "@/lib/server/direct-mysql-web";
import { getSicarCatalog } from "@/lib/sicar/catalog";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q") ?? "";
  const status = (searchParams.get("status") ?? "all") as "all" | "active" | "inactive";
  const page = Number(searchParams.get("page") ?? "1");
  const limit = Number(searchParams.get("limit") ?? "24");

  if (!isDirectMysqlWebEnabled()) {
    return NextResponse.json(
      {
        rows: [],
        total: 0,
        page,
        limit,
        error: directMysqlWebError(),
      },
      { status: 503 },
    );
  }

  try {
    const data = await getSicarCatalog({
      q,
      status,
      page,
      limit,
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        rows: [],
        total: 0,
        page,
        limit,
        error: error instanceof Error ? error.message : "SICAR no disponible.",
      },
      { status: 503 },
    );
  }
}
