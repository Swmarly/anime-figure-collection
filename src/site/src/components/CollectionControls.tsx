import { sortOptions } from "../config";
import type { SortKey } from "../types";
import { Icon } from "./Icon";

type CollectionControlsProps = {
  label: string;
  query: string;
  sortKey: SortKey;
  onQueryChange: (query: string) => void;
  onSortChange: (sortKey: SortKey) => void;
};

export const CollectionControls = ({
  label,
  query,
  sortKey,
  onQueryChange,
  onSortChange
}: CollectionControlsProps) => (
  <div className="collection-controls" aria-label={`${label} controls`}>
    <label className="field field--search">
      <span>Search</span>
      <Icon name="search" />
      <input
        type="search"
        value={query}
        placeholder="Name, series, maker, tag…"
        onChange={(event) => onQueryChange(event.target.value)}
      />
    </label>

    <label className="field">
      <span>Sort by</span>
      <select value={sortKey} onChange={(event) => onSortChange(event.target.value as SortKey)}>
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  </div>
);
