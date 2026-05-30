import { z } from "zod";

const envSchema = z.object({
  SICAR_MYSQL_HOST: z.string().min(1),
  SICAR_MYSQL_PORT: z.coerce.number().int().positive(),
  SICAR_MYSQL_USER: z.string().min(1),
  SICAR_MYSQL_PASSWORD: z.string(),
  SICAR_MYSQL_DATABASE: z.string().min(1),
  APP_MYSQL_HOST: z.string().min(1),
  APP_MYSQL_PORT: z.coerce.number().int().positive(),
  APP_MYSQL_USER: z.string().min(1),
  APP_MYSQL_PASSWORD: z.string(),
  APP_MYSQL_DATABASE: z.string().min(1),
});

export const env = envSchema.parse({
  SICAR_MYSQL_HOST: process.env.SICAR_MYSQL_HOST,
  SICAR_MYSQL_PORT: process.env.SICAR_MYSQL_PORT,
  SICAR_MYSQL_USER: process.env.SICAR_MYSQL_USER,
  SICAR_MYSQL_PASSWORD: process.env.SICAR_MYSQL_PASSWORD,
  SICAR_MYSQL_DATABASE: process.env.SICAR_MYSQL_DATABASE,
  APP_MYSQL_HOST: process.env.APP_MYSQL_HOST,
  APP_MYSQL_PORT: process.env.APP_MYSQL_PORT,
  APP_MYSQL_USER: process.env.APP_MYSQL_USER,
  APP_MYSQL_PASSWORD: process.env.APP_MYSQL_PASSWORD,
  APP_MYSQL_DATABASE: process.env.APP_MYSQL_DATABASE,
});
