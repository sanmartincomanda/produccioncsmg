import "server-only";

import mysql, { type Pool } from "mysql2/promise";

import { env } from "@/lib/env";

const globalForAppDb = globalThis as {
  appPool?: Pool;
};

export function getAppPool() {
  if (!globalForAppDb.appPool) {
    globalForAppDb.appPool = mysql.createPool({
      host: env.APP_MYSQL_HOST,
      port: env.APP_MYSQL_PORT,
      user: env.APP_MYSQL_USER,
      password: env.APP_MYSQL_PASSWORD,
      database: env.APP_MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }

  return globalForAppDb.appPool;
}
