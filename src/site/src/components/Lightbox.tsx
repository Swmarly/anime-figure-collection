import { useEffect } from "react";
import { Icon } from "./Icon";

type LightboxImage = {
  src: string;
  alt: string;
  title: string;
  meta?: string;
};

type LightboxProps = {
  image: LightboxImage | null;
  onClose: () => void;
};

export const Lightbox = ({ image, onClose }: LightboxProps) => {
  useEffect(() => {
    if (!image) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.classList.add("has-lightbox");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("has-lightbox");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [image, onClose]);

  if (!image) return null;

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${image.title} image preview`}>
      <button className="lightbox__backdrop" type="button" aria-label="Close image preview" onClick={onClose} />
      <figure className="lightbox__panel">
        <button className="lightbox__close" type="button" aria-label="Close image preview" onClick={onClose}>
          ×
        </button>
        <img src={image.src} alt={image.alt} />
        <figcaption>
          <div>
            <strong>{image.title}</strong>
            {image.meta ? <span>{image.meta}</span> : null}
          </div>
          <a href={image.src} target="_blank" rel="noreferrer">
            Open image
            <Icon name="external" />
          </a>
        </figcaption>
      </figure>
    </div>
  );
};

export type { LightboxImage };
