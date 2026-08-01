import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { directMysqlWebError, isDirectMysqlWebEnabled } from "@/lib/server/direct-mysql-web";
import { getSicarCatalog, type SicarCatalogItem, type SicarCatalogResult } from "@/lib/sicar/catalog";

function toNumber(value: unknown) {
  return Number(value ?? 0) || 0;
}

function mapCloudCatalogItem(data: Record<string, unknown>): SicarCatalogItem {
  return {
    artId: toNumber(data.artId),
    clave: String(data.clave ?? ""),
    descripcion: String(data.descripcion ?? ""),
    caracteristicas: String(data.caracteristicas ?? ""),
    status: toNumber(data.status),
    servicio: toNumber(data.servicio),
    insumo: toNumber(data.insumo),
    receta: toNumber(data.receta),
    platillo: toNumber(data.platillo),
    existencia: String(data.existencia ?? 0),
    precioCompra: String(data.precioCompra ?? 0),
    preCompraProm: String(data.preCompraProm ?? 0),
    categoryId:
      data.categoryId === null || data.categoryId === undefined ? null : toNumber(data.categoryId),
    categoryName: String(data.categoryName ?? ""),
    departmentId:
      data.departmentId === null || data.departmentId === undefined ? null : toNumber(data.departmentId),
    departmentName: String(data.departmentName ?? ""),
    unidadCompra: String(data.unidadCompra ?? ""),
    unidadVenta: String(data.unidadVenta ?? ""),
  };
}

async function getCloudCatalog(filters: {
  q: string;
  status: "all" | "active" | "inactive";
  page: number;
  limit: number;
}): Promise<SicarCatalogResult> {
  const db = getFirebaseAdminFirestore();
  const snapshot = await db.collection("catalog_items").orderBy("clave", "asc").limit(3000).get();
  const query = filters.q.trim().toLowerCase();
  const rows = snapshot.docs
    .map((doc) => mapCloudCatalogItem(doc.data()))
    .filter((item) => {
      const matchesStatus =
        filters.status === "all"
          ? true
          : filters.status === "active"
            ? item.status === 1
            : item.status !== 1;

      if (!matchesStatus) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [item.clave, item.descripcion, item.unidadVenta, item.caracteristicas]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  const start = (filters.page - 1) * filters.limit;

  return {
    rows: rows.slice(start, start + filters.limit),
    total: rows.length,
    page: filters.page,
    limit: filters.limit,
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q") ?? "";
  const status = (searchParams.get("status") ?? "all") as "all" | "active" | "inactive";
  const page = Number(searchParams.get("page") ?? "1");
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "24"), 1), 3000);

  if (!isDirectMysqlWebEnabled()) {
    try {
      return NextResponse.json(await getCloudCatalog({ q, status, page, limit }));
    } catch (error) {
      return NextResponse.json(
        {
          rows: [],
          total: 0,
          page,
          limit,
          error: error instanceof Error ? error.message : directMysqlWebError(),
        },
        { status: 503 },
      );
    }
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
    try {
      return NextResponse.json(await getCloudCatalog({ q, status, page, limit }));
    } catch {
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
}
