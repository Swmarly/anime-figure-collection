import type { SortKey } from "./types";

export const siteConfig = {
  owner: "Swmarly",
  title: "Swmarly's figure shelf",
  eyebrow: "♡ little shelf diary ♡",
  description:
    "A soft, cozy catalog for my anime figures: the cuties already on display, the grails I am saving for, and every tiny shelf upgrade in between.",
  primaryAction: { label: "See the shelf", target: "collection" },
  secondaryAction: { label: "Peek at wishlist", target: "wishlist" },
  adminPath: "/admin",
  footerNote: "Made with love, shelf dusting, and way too many preorders ♡",
  emptyStates: {
    owned: "The display shelf is waiting for its first cutie. Add one in the admin panel.",
    wishlist: "No grails are pinned yet. Save future dream figures in the admin panel."
  }
} as const;

export const sectionContent = {
  owned: {
    id: "collection",
    kicker: "in the cabinet",
    title: "My figure shelf",
    description: "The figures currently living rent-free in the display case."
  },
  wishlist: {
    id: "wishlist",
    kicker: "dream shelf",
    title: "Wishlist cuties",
    description: "Grails, maybes, and future preorders I keep daydreaming about."
  }
} as const;

export const sortOptions: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: "release-desc", label: "Newest releases" },
  { value: "release-asc", label: "Oldest releases" },
  { value: "name-asc", label: "Name A → Z" },
  { value: "name-desc", label: "Name Z → A" }
];

export const defaultSortKey: SortKey = "release-desc";
