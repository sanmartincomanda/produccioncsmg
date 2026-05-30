import "server-only";

import mysql, { type Pool } from "mysql2/promise";

import { getEnv } from "@/lib/env";

const globalForSicar = globalThis as {
  sicarPool?: Pool;
};

export function getSicarPool() {
  if (!globalForSicar.sicarPool) {
    const env = getEnv();
    globalForSicar.sicarPool = mysql.createPool({
      host: env.SICAR_MYSQL_HOST,
      port: env.SICAR_MYSQL_PORT,
      user: env.SICAR_MYSQL_USER,
      password: env.SICAR_MYSQL_PASSWORD,
      database: env.SICAR_MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  return globalForSicar.sicarPool;
}
