import "server-only";

export function isDirectMysqlWebEnabled() {
  return process.env.ENABLE_DIRECT_MYSQL_WEB === "true";
}

export function directMysqlWebError() {
  return "Acceso directo a MySQL deshabilitado en la web. Usa Firebase con el integrador local.";
}
