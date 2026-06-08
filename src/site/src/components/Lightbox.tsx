import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";

type LightboxImage = {
  src: string;
  images?: string[];
  initialIndex?: number;
  alt: string;
  title: string;
  meta?: string;
};

type LightboxProps = {
  image: LightboxImage | null;
  onClose: () => void;
};

const normalizeLightboxImages = (image: LightboxImage): string[] => {
  const sources = [...(image.images ?? []), image.src]
    .map((source) => source.trim())
    .filter(Boolean);

  return Array.from(new Set(sources));
};

const clampInitialIndex = (image: LightboxImage, imageCount: number) => {
  if (!imageCount) return 0;
  const requestedIndex = image.initialIndex ?? 0;
  return Math.min(Math.max(requestedIndex, 0), imageCount - 1);
};

const preloadedImages = new Set<string>();

const preloadImage = (src: string) => {
  if (preloadedImages.has(src)) return;

  preloadedImages.add(src);
  const image = new Image();
  image.decoding = "async";
  image.src = src;
};

const getAdjacentImages = (images: string[], activeIndex: number): string[] => {
  if (images.length <= 1) return [];

  const previous = images[(activeIndex - 1 + images.length) % images.length];
  const next = images[(activeIndex + 1) % images.length];

  return Array.from(new Set([previous, next].filter((source): source is string => Boolean(source))));
};

const LightboxContent = ({ image, onClose }: { image: LightboxImage; onClose: () => void }) => {
  const images = useMemo(() => normalizeLightboxImages(image), [image]);
  const [activeIndex, setActiveIndex] = useState(() => clampInitialIndex(image, images.length));
  const hasMultipleImages = images.length > 1;
  const activeSrc = images[activeIndex] ?? image.src;

  const showPrevious = useCallback(() => {
    setActiveIndex((current) => (current - 1 + images.length) % images.length);
  }, [images.length]);

  const showNext = useCallback(() => {
    setActiveIndex((current) => (current + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (!hasMultipleImages) return;
      if (event.key === "ArrowLeft") {
        showPrevious();
      }
      if (event.key === "ArrowRight") {
        showNext();
      }
    };

    document.body.classList.add("has-lightbox");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("has-lightbox");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasMultipleImages, onClose, showNext, showPrevious]);

  useEffect(() => {
    getAdjacentImages(images, activeIndex).forEach(preloadImage);
  }, [activeIndex, images]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${image.title} image preview`}>
      <button className="lightbox__backdrop" type="button" aria-label="Close image preview" onClick={onClose} />
      <figure className="lightbox__panel">
        <button className="lightbox__close" type="button" aria-label="Close image preview" onClick={onClose}>
          ×
        </button>
        <div className="lightbox__image-wrap">
          {hasMultipleImages ? (
            <button
              className="lightbox__nav lightbox__nav--prev"
              type="button"
              aria-label="Show previous image"
              onClick={showPrevious}
            >
              ‹
            </button>
          ) : null}
          <img src={activeSrc} alt={image.alt} loading="eager" decoding="async" fetchPriority="high" />
          {hasMultipleImages ? (
            <button
              className="lightbox__nav lightbox__nav--next"
              type="button"
              aria-label="Show next image"
              onClick={showNext}
            >
              ›
            </button>
          ) : null}
        </div>
        <figcaption>
          <div>
            <strong>{image.title}</strong>
            {image.meta ? <span>{image.meta}</span> : null}
          </div>
          <div className="lightbox__actions">
            {hasMultipleImages ? (
              <span className="lightbox__counter" aria-live="polite">
                {activeIndex + 1} / {images.length}
              </span>
            ) : null}
            <a href={activeSrc} target="_blank" rel="noreferrer">
              Open image
              <Icon name="external" />
            </a>
          </div>
        </figcaption>
      </figure>
    </div>
  );
};

export const Lightbox = ({ image, onClose }: LightboxProps) => {
  if (!image) return null;

  return <LightboxContent key={`${image.src}-${image.initialIndex ?? 0}`} image={image} onClose={onClose} />;
};

export type { LightboxImage };
