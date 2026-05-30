import { NextRequest, NextResponse } from "next/server";

import { getSicarCatalog } from "@/lib/sicar/catalog";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q") ?? "";
  const status = (searchParams.get("status") ?? "all") as "all" | "active" | "inactive";
  const page = Number(searchParams.get("page") ?? "1");
  const limit = Number(searchParams.get("limit") ?? "24");

  const data = await getSicarCatalog({
    q,
    status,
    page,
    limit,
  });

  return NextResponse.json(data);
}
