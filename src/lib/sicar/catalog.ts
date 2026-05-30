import "server-only";

import type { RowDataPacket } from "mysql2";

import { getSicarPool } from "@/lib/db/sicar";
import type { CatalogOption } from "@/types/production";

export type SicarCatalogFilters = {
  q?: string;
  status?: "all" | "active" | "inactive";
  page?: number;
  limit?: number;
};

export type SicarCatalogItem = {
  artId: number;
  clave: string;
  descripcion: string;
  caracteristicas: string;
  status: number;
  servicio: number;
  insumo: number;
  receta: number;
  platillo: number;
  existencia: string;
  precioCompra: string;
  preCompraProm: string;
  unidadCompra: string;
  unidadVenta: string;
};

export type SicarCatalogResult = {
  rows: SicarCatalogItem[];
  total: number;
  page: number;
  limit: number;
};

export async function getSicarCatalogOptions(): Promise<CatalogOption[]> {
  const pool = getSicarPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        a.art_id AS artId,
        a.clave,
        a.descripcion,
        uv.nombre AS unidadVenta,
        a.existencia,
        a.precioCompra,
        a.preCompraProm
      FROM articulo a
      LEFT JOIN unidad uv ON uv.uni_id = a.unidadVenta
      ORDER BY a.clave ASC
    `,
  );

  return rows.map((row) => ({
    artId: Number(row.artId),
    clave: String(row.clave),
    descripcion: String(row.descripcion),
    unidadVenta: String(row.unidadVenta ?? ""),
    existencia: Number(row.existencia ?? 0),
    precioCompra: Number(row.precioCompra ?? 0),
    preCompraProm: Number(row.preCompraProm ?? 0),
  }));
}

export async function getSicarCatalog(
  filters: SicarCatalogFilters = {},
): Promise<SicarCatalogResult> {
  const pool = getSicarPool();
  const q = (filters.q ?? "").trim();
  const status = filters.status ?? "all";
  const limit = Math.min(Math.max(filters.limit ?? 24, 1), 100);
  const page = Math.max(filters.page ?? 1, 1);
  const offset = (page - 1) * limit;
  const params: Array<string | number> = [];
  const where: string[] = [];

  if (status === "active") {
    where.push("a.status = 1");
  } else if (status === "inactive") {
    where.push("a.status <> 1");
  }

  if (q) {
    where.push(
      "(a.clave LIKE ? OR a.descripcion LIKE ? OR uc.nombre LIKE ? OR uv.nombre LIKE ? OR a.caracteristicas LIKE ?)",
    );
    const searchToken = `%${q}%`;
    params.push(searchToken, searchToken, searchToken, searchToken, searchToken);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [countRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT COUNT(*) AS total
      FROM articulo a
      LEFT JOIN unidad uc ON uc.uni_id = a.unidadCompra
      LEFT JOIN unidad uv ON uv.uni_id = a.unidadVenta
      ${whereSql}
    `,
    params,
  );

  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        a.art_id AS artId,
        a.clave,
        a.descripcion,
        a.caracteristicas,
        a.status,
        a.servicio,
        a.insumo,
        a.receta,
        a.platillo,
        a.existencia,
        a.precioCompra,
        a.preCompraProm,
        uc.nombre AS unidadCompra,
        uv.nombre AS unidadVenta
      FROM articulo a
      LEFT JOIN unidad uc ON uc.uni_id = a.unidadCompra
      LEFT JOIN unidad uv ON uv.uni_id = a.unidadVenta
      ${whereSql}
      ORDER BY a.clave ASC
      LIMIT ?
      OFFSET ?
    `,
    [...params, limit, offset],
  );

  return {
    rows: rows as unknown as SicarCatalogItem[],
    total: Number(countRows[0]?.total ?? 0),
    page,
    limit,
  };
}
