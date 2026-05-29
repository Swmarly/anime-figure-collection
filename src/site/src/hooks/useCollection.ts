import { useEffect, useMemo, useState } from "react";
import { normalizeCollectionPayload } from "../lib/collection";
import type { CollectionPayload } from "../types";

type CollectionState = {
  collection: CollectionPayload;
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
};

const emptyCollection: CollectionPayload = { owned: [], wishlist: [], updatedAt: null };

const getApiBase = (): string => {
  const configuredBase = document.documentElement.dataset.apiBase || window.__FIGURE_COLLECTION_API_BASE__;
  return configuredBase?.replace(/\/$/, "") ?? "";
};

const buildCollectionUrl = (): string => `${getApiBase()}/api/collection`;

export const useCollection = (): CollectionState => {
  const [collection, setCollection] = useState<CollectionPayload>(emptyCollection);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const loadCollection = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(buildCollectionUrl(), {
          headers: { Accept: "application/json" },
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Collection request failed with status ${response.status}.`);
        }

        const payload = (await response.json()) as Partial<CollectionPayload>;
        setCollection(normalizeCollectionPayload(payload));
      } catch (requestError) {
        if (controller.signal.aborted) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "The collection could not be loaded."
        );
        setCollection(emptyCollection);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void loadCollection();

    return () => controller.abort();
  }, [requestId]);

  return useMemo(
    () => ({
      collection,
      isLoading,
      error,
      refresh: () => setRequestId((current) => current + 1)
    }),
    [collection, error, isLoading]
  );
};

declare global {
  interface Window {
    __FIGURE_COLLECTION_API_BASE__?: string;
  }
}
