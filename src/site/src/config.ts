import type { SortKey } from "./types";

export const siteConfig = {
  owner: "Swmarly",
  title: "Swmarly's Figure Vault",
  eyebrow: "Curated anime figure archive",
  description:
    "A polished display case for owned anime figures, grails, and wishlist targets synced from the collection admin panel.",
  primaryAction: { label: "Explore collection", target: "collection" },
  secondaryAction: { label: "Open wishlist", target: "wishlist" },
  adminPath: "/admin",
  footerNote: "Made with care for every shelf upgrade.",
  emptyStates: {
    owned: "No figures are on display yet. Add your first entry in the admin panel.",
    wishlist: "The wishlist is empty for now. Save future grails in the admin panel."
  }
} as const;

export const sectionContent = {
  owned: {
    id: "collection",
    kicker: "On the shelf",
    title: "Owned collection",
    description: "Figures currently cataloged in the display cabinet."
  },
  wishlist: {
    id: "wishlist",
    kicker: "Future hunts",
    title: "Wishlist targets",
    description: "Figures marked as goals, grails, or planned additions."
  }
} as const;

export const sortOptions: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "release-desc", label: "Newest releases" },
  { value: "release-asc", label: "Oldest releases" },
  { value: "name-asc", label: "Name A → Z" },
  { value: "name-desc", label: "Name Z → A" }
];

export const defaultSortKey: SortKey = "release-desc";
