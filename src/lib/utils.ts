import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatNumber(value: number | string, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat("es-NI", options).format(Number(value || 0));
}

export function formatCurrency(value: number | string) {
  return new Intl.NumberFormat("es-NI", {
    style: "currency",
    currency: "NIO",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}
