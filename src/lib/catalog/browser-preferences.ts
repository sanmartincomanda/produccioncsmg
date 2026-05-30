import type { CatalogOption } from "@/types/production";

const STORAGE_KEY = "transformacion-catalog-browser-preferences-v1";

export const ALL_FILTER = "__ALL__";
export const FAVORITES_FILTER = "__FAVORITES__";
export const MOST_USED_FILTER = "__MOST_USED__";

export type CatalogBrowserPreferences = {
  favorites: number[];
  usage: Record<string, number>;
};

export function createEmptyCatalogBrowserPreferences(): CatalogBrowserPreferences {
  return {
    favorites: [],
    usage: {},
  };
}

export function readCatalogBrowserPreferences(): CatalogBrowserPreferences {
  if (typeof window === "undefined") {
    return createEmptyCatalogBrowserPreferences();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return createEmptyCatalogBrowserPreferences();
    }

    const parsed = JSON.parse(raw) as Partial<CatalogBrowserPreferences>;

    return {
      favorites: Array.isArray(parsed.favorites)
        ? parsed.favorites.map((value) => Number(value)).filter(Boolean)
        : [],
      usage:
        parsed.usage && typeof parsed.usage === "object"
          ? Object.fromEntries(
              Object.entries(parsed.usage).map(([key, value]) => [key, Number(value) || 0]),
            )
          : {},
    };
  } catch {
    return createEmptyCatalogBrowserPreferences();
  }
}

function writeCatalogBrowserPreferences(preferences: CatalogBrowserPreferences) {
  if (typeof window === "undefined") {
    return preferences;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  return preferences;
}

export function toggleCatalogFavorite(
  artId: number,
  current: CatalogBrowserPreferences,
) {
  const isFavorite = current.favorites.includes(artId);

  return writeCatalogBrowserPreferences({
    ...current,
    favorites: isFavorite
      ? current.favorites.filter((value) => value !== artId)
      : [...current.favorites, artId],
  });
}

export function registerCatalogUsage(
  artId: number,
  current: CatalogBrowserPreferences,
) {
  return writeCatalogBrowserPreferences({
    ...current,
    usage: {
      ...current.usage,
      [String(artId)]: (current.usage[String(artId)] ?? 0) + 1,
    },
  });
}

export function isCatalogFavorite(
  artId: number,
  current: CatalogBrowserPreferences,
) {
  return current.favorites.includes(artId);
}

export function getCatalogUsageCount(
  artId: number,
  current: CatalogBrowserPreferences,
) {
  return current.usage[String(artId)] ?? 0;
}

function normalizeToken(value: string) {
  return value.trim().toUpperCase();
}

export function getCatalogDepartmentName(option: CatalogOption) {
  return option.departmentName?.trim() || "OTROS";
}

export function getCatalogDepartmentFilters(options: CatalogOption[]) {
  const preferred = ["RES", "POLLO", "CERDO"];
  const names = Array.from(
    new Set(
      options
        .map((option) => getCatalogDepartmentName(option))
        .filter(Boolean),
    ),
  );

  return names.sort((left, right) => {
    const leftPriority = preferred.indexOf(normalizeToken(left));
    const rightPriority = preferred.indexOf(normalizeToken(right));

    if (leftPriority !== -1 || rightPriority !== -1) {
      if (leftPriority === -1) return 1;
      if (rightPriority === -1) return -1;
      return leftPriority - rightPriority;
    }

    return left.localeCompare(right, "es");
  });
}

export function filterCatalogOptions(
  options: CatalogOption[],
  query: string,
  activeFilter: string,
  preferences: CatalogBrowserPreferences,
) {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedFilter = normalizeToken(activeFilter || ALL_FILTER);

  let filtered = [...options];

  if (normalizedFilter === FAVORITES_FILTER) {
    filtered = filtered.filter((item) => isCatalogFavorite(item.artId, preferences));
  } else if (normalizedFilter === MOST_USED_FILTER) {
    filtered = filtered.filter((item) => getCatalogUsageCount(item.artId, preferences) > 0);
  } else if (normalizedFilter !== normalizeToken(ALL_FILTER)) {
    filtered = filtered.filter(
      (item) => normalizeToken(getCatalogDepartmentName(item)) === normalizedFilter,
    );
  }

  if (normalizedQuery) {
    filtered = filtered.filter((item) =>
      `${item.clave} ${item.descripcion} ${item.unidadVenta} ${item.categoryName ?? ""} ${item.departmentName ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }

  return filtered.sort((left, right) => {
    if (normalizedFilter === MOST_USED_FILTER) {
      return getCatalogUsageCount(right.artId, preferences) - getCatalogUsageCount(left.artId, preferences);
    }

    const favoriteDelta =
      Number(isCatalogFavorite(right.artId, preferences)) - Number(isCatalogFavorite(left.artId, preferences));

    if (favoriteDelta !== 0) {
      return favoriteDelta;
    }

    const usageDelta = getCatalogUsageCount(right.artId, preferences) - getCatalogUsageCount(left.artId, preferences);

    if (usageDelta !== 0) {
      return usageDelta;
    }

    return left.descripcion.localeCompare(right.descripcion, "es");
  });
}
