import { defaultSortKey, sectionContent, siteConfig } from "../config";
import { filterFigures, getFigureId, sortFigures } from "../lib/collection";
import type { Figure, FigureStatus, SortKey } from "../types";
import { CollectionControls } from "./CollectionControls";
import { FigureCard } from "./FigureCard";
import type { LightboxImage } from "./Lightbox";

type CollectionSectionProps = {
  status: FigureStatus;
  figures: Figure[];
  query: string;
  sortKey: SortKey;
  isLoading: boolean;
  onQueryChange: (query: string) => void;
  onSortChange: (sortKey: SortKey) => void;
  onImageOpen?: (image: LightboxImage) => void;
};

const skeletonCards = Array.from({ length: 6 }, (_, index) => `skeleton-${index}`);

export const CollectionSection = ({
  status,
  figures,
  query,
  sortKey,
  isLoading,
  onQueryChange,
  onSortChange,
  onImageOpen
}: CollectionSectionProps) => {
  const content = sectionContent[status];
  const visibleFigures = sortFigures(filterFigures(figures, query), sortKey || defaultSortKey);
  const emptyMessage = query
    ? "No matching figures found. Try a different name, series, maker, or tag."
    : siteConfig.emptyStates[status];

  return (
    <section className="collection-section" id={content.id} aria-labelledby={`${content.id}-title`}>
      <div className="section-heading">
        <p className="section-heading__kicker">{content.kicker}</p>
        <div>
          <h2 id={`${content.id}-title`}>{content.title}</h2>
          <p>{content.description}</p>
        </div>
      </div>

      <CollectionControls
        label={content.title}
        query={query}
        sortKey={sortKey}
        onQueryChange={onQueryChange}
        onSortChange={onSortChange}
      />

      {isLoading ? (
        <div className="figure-grid" aria-label="Loading figures">
          {skeletonCards.map((key) => (
            <div className="skeleton-card" key={key} />
          ))}
        </div>
      ) : visibleFigures.length ? (
        <div className="figure-grid">
          {visibleFigures.map((figure, index) => (
            <FigureCard
              key={getFigureId(figure, status, index)}
              figure={figure}
              status={status}
              onImageOpen={onImageOpen}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>{emptyMessage}</strong>
          <span>{query ? "Filters are applied only in this browser." : "The public API is ready for new entries."}</span>
        </div>
      )}
    </section>
  );
};
