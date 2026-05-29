import type { CollectionMetric, CollectionPayload, Figure, FigureStatus, SortKey } from "../types";

const releaseSortValue = (figure: Figure): number | null => {
  const value = figure.releaseDate?.trim();
  if (!value) return null;

  const monthMatch = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (monthMatch) {
    return Number(monthMatch[1]) * 100 + Number(monthMatch[2]);
  }

  const yearMatch = /^(\d{4})$/.exec(value);
  if (yearMatch) {
    return Number(yearMatch[1]) * 100;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;

  const date = new Date(parsed);
  return date.getFullYear() * 100 + date.getMonth() + 1;
};

const normalizeName = (figure: Figure): string => figure.name?.trim() || "Untitled figure";

const compareRelease = (direction: "asc" | "desc") => (a: Figure, b: Figure): number => {
  const aValue = releaseSortValue(a);
  const bValue = releaseSortValue(b);

  if (aValue === null && bValue === null) return normalizeName(a).localeCompare(normalizeName(b));
  if (aValue === null) return 1;
  if (bValue === null) return -1;

  return direction === "asc" ? aValue - bValue : bValue - aValue;
};

export const sortFigures = (figures: Figure[], sortKey: SortKey): Figure[] => {
  const sorted = [...figures];
  const sorters: Record<SortKey, (a: Figure, b: Figure) => number> = {
    "release-desc": compareRelease("desc"),
    "release-asc": compareRelease("asc"),
    "name-asc": (a, b) => normalizeName(a).localeCompare(normalizeName(b)),
    "name-desc": (a, b) => normalizeName(b).localeCompare(normalizeName(a))
  };

  return sorted.sort(sorters[sortKey]);
};

export const filterFigures = (figures: Figure[], query: string): Figure[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return figures;

  return figures.filter((figure) => {
    const searchable = [
      figure.name,
      figure.series,
      figure.manufacturer,
      figure.scale,
      figure.releaseDate,
      figure.description,
      ...(figure.tags ?? [])
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(normalizedQuery);
  });
};

export const formatReleaseDate = (value?: string): string => {
  if (!value) return "Release TBA";

  const monthMatch = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (monthMatch) {
    const date = new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1);
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
  }

  return value;
};

export const getFigureId = (figure: Figure, status: FigureStatus, index: number): string =>
  figure.slug || figure.id || `${status}-${figure.name ?? "figure"}-${index}`;

export const getFigureImages = (figure: Figure): string[] => {
  const images = [
    ...(Array.isArray(figure.images) ? figure.images : []),
    figure.image
  ]
    .map((image) => image?.trim())
    .filter((image): image is string => Boolean(image));

  return Array.from(new Set(images));
};

export const getFigureImage = (figure: Figure): string | null => getFigureImages(figure)[0] ?? null;

export const getFigureAlt = (figure: Figure): string =>
  figure.alt?.trim() || (figure.name ? `${figure.name} anime figure` : "Anime figure");

export const getMfcLink = (figure: Figure): string | null =>
  figure.links?.mfc ?? (figure.mfcId ? `https://myfigurecollection.net/item/${figure.mfcId}` : null);

const uniqueCount = (values: Array<string | undefined>): number =>
  new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))).size;

export const buildMetrics = (collection: CollectionPayload): CollectionMetric[] => {
  const allFigures = [...collection.owned, ...collection.wishlist];
  const manufacturerCount = uniqueCount(allFigures.map((figure) => figure.manufacturer));
  const seriesCount = uniqueCount(allFigures.map((figure) => figure.series));

  return [
    {
      label: "Owned",
      value: collection.owned.length.toString(),
      detail: "figures cataloged"
    },
    {
      label: "Wishlist",
      value: collection.wishlist.length.toString(),
      detail: "future additions"
    },
    {
      label: "Series",
      value: seriesCount.toString(),
      detail: "unique origins"
    },
    {
      label: "Makers",
      value: manufacturerCount.toString(),
      detail: "manufacturers tracked"
    }
  ];
};

export const normalizeCollectionPayload = (payload: Partial<CollectionPayload> | null): CollectionPayload => ({
  owned: Array.isArray(payload?.owned) ? payload.owned : [],
  wishlist: Array.isArray(payload?.wishlist) ? payload.wishlist : [],
  updatedAt: payload?.updatedAt ?? null
});
