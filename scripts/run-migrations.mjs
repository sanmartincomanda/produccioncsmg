import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import mysql from "mysql2/promise";

function parseEnvFile(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .reduce((acc, line) => {
      const separator = line.indexOf("=");

      if (separator === -1) {
        return acc;
      }

      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      acc[key] = value;
      return acc;
    }, {});
}

async function loadConfig() {
  const envPath = resolve(process.cwd(), ".env.local");
  const fileEnv = parseEnvFile(await readFile(envPath, "utf8"));
  const pick = (key, fallback = "") => process.env[key] ?? fileEnv[key] ?? fallback;

  return {
    host: pick("APP_MYSQL_HOST", "127.0.0.1"),
    port: Number(pick("APP_MYSQL_PORT", "3306")),
    user: pick("APP_MYSQL_USER"),
    password: pick("APP_MYSQL_PASSWORD"),
    database: pick("APP_MYSQL_DATABASE", "transformacion_app"),
  };
}

async function main() {
  const config = await loadConfig();

  if (!config.user) {
    throw new Error("APP_MYSQL_USER is required.");
  }

  const admin = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    multipleStatements: true,
  });

  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  );
  await admin.end();

  const db = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    multipleStatements: true,
  });

  const migrationsDir = resolve(process.cwd(), "db", "migrations");
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await db.query(sql);
    console.log(`Applied migration: ${file}`);
  }

  await db.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
