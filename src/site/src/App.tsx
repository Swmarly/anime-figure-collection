import { useCallback, useMemo, useState } from "react";
import { siteConfig } from "./config";
import { CollectionSection } from "./components/CollectionSection";
import { Hero } from "./components/Hero";
import { Icon } from "./components/Icon";
import { Lightbox, type LightboxImage } from "./components/Lightbox";
import { ThemeToggle } from "./components/ThemeToggle";
import { useCollection } from "./hooks/useCollection";
import { buildMetrics } from "./lib/collection";
import type { SortKey } from "./types";
import { defaultSortKey } from "./config";

export const App = () => {
  const { collection, error, isLoading, refresh } = useCollection();
  const metrics = useMemo(() => buildMetrics(collection), [collection]);
  const [queryBySection, setQueryBySection] = useState({ owned: "", wishlist: "" });
  const [sortKey, setSortKey] = useState<SortKey>(defaultSortKey);
  const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(null);
  const closeLightbox = useCallback(() => setLightboxImage(null), []);
  const updateOwnedQuery = useCallback(
    (query: string) => setQueryBySection((current) => ({ ...current, owned: query })),
    []
  );
  const updateWishlistQuery = useCallback(
    (query: string) => setQueryBySection((current) => ({ ...current, wishlist: query })),
    []
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#collection">
        Skip to collection
      </a>
      <div className="ambient ambient--one" aria-hidden="true" />
      <div className="ambient ambient--two" aria-hidden="true" />
      <div className="sticker-cloud sticker-cloud--one" aria-hidden="true">★</div>
      <div className="sticker-cloud sticker-cloud--two" aria-hidden="true">✦</div>

      <nav className="site-nav" aria-label="Primary navigation">
        <a className="brand" href="/" aria-label={`${siteConfig.title} home`}>
          <span aria-hidden="true">★</span>
          <span>{siteConfig.owner}</span>
        </a>
        <div className="site-nav__links">
          <a href="#collection">Collection</a>
          <a href="#wishlist">Wishlist</a>
          <a href={siteConfig.adminPath}>Admin</a>
          <ThemeToggle />
        </div>
      </nav>

      <main>
        <Hero metrics={metrics} updatedAt={collection.updatedAt} />

        {error ? (
          <div className="notice" role="status">
            <div>
              <strong>Collection sync failed</strong>
              <p>{error}</p>
            </div>
            <button type="button" onClick={refresh}>
              <Icon name="refresh" />
              Retry
            </button>
          </div>
        ) : null}

        <CollectionSection
          status="owned"
          figures={collection.owned}
          query={queryBySection.owned}
          sortKey={sortKey}
          isLoading={isLoading}
          onQueryChange={updateOwnedQuery}
          onSortChange={setSortKey}
          onImageOpen={setLightboxImage}
        />

        <CollectionSection
          status="wishlist"
          figures={collection.wishlist}
          query={queryBySection.wishlist}
          sortKey={sortKey}
          isLoading={isLoading}
          onQueryChange={updateWishlistQuery}
          onSortChange={setSortKey}
          onImageOpen={setLightboxImage}
        />
      </main>

      <Lightbox image={lightboxImage} onClose={closeLightbox} />

      <footer className="site-footer">
        <p>{siteConfig.footerNote}</p>
        <a href={siteConfig.adminPath}>Manage collection</a>
      </footer>
    </div>
  );
};
