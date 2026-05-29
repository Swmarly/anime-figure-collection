export type FigureStatus = "owned" | "wishlist";

export type FigureLinkMap = {
  mfc?: string;
  [key: string]: string | undefined;
};

export type Figure = {
  id?: string;
  slug?: string;
  name?: string;
  series?: string;
  manufacturer?: string;
  scale?: string;
  releaseDate?: string;
  image?: string;
  images?: string[];
  alt?: string;
  caption?: string;
  description?: string;
  tags?: string[];
  mfcId?: number | null;
  links?: FigureLinkMap;
};

export type CollectionPayload = {
  owned: Figure[];
  wishlist: Figure[];
  updatedAt?: string | null;
};

export type SortKey = "release-desc" | "release-asc" | "name-asc" | "name-desc";

export type CollectionMetric = {
  label: string;
  value: string;
  detail: string;
};
