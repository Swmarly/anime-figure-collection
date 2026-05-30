import type { SortKey } from "./types";

export const siteConfig = {
  owner: "Swmarly",
  title: "Swmarly's Figure Collection",
  eyebrow: "Figure shelf log",
  description:
    "A clean catalog of the anime figures I own, plus the wishlist entries I am tracking for future shelf updates.",
  primaryAction: { label: "Browse collection", target: "collection" },
  secondaryAction: { label: "View wishlist", target: "wishlist" },
  adminPath: "/admin",
  footerNote: "Collection data is synced from the admin panel.",
  emptyStates: {
    owned: "No figures are in the collection yet. Add the first entry in the admin panel.",
    wishlist: "No wishlist entries yet. Add future targets in the admin panel."
  }
} as const;

export const sectionContent = {
  owned: {
    id: "collection",
    kicker: "collection",
    title: "Owned figures",
    description: "Figures currently cataloged on the shelf."
  },
  wishlist: {
    id: "wishlist",
    kicker: "wishlist",
    title: "Wishlist",
    description: "Figures being tracked for future purchases."
  }
} as const;

export const sortOptions: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "release-desc", label: "Newest releases" },
  { value: "release-asc", label: "Oldest releases" },
  { value: "name-asc", label: "Name A → Z" },
  { value: "name-desc", label: "Name Z → A" }
];

export const defaultSortKey: SortKey = "release-desc";
