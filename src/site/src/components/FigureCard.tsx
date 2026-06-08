import { memo, useMemo } from "react";
import { formatReleaseDate, getFigureAlt, getFigureImages, getMfcLink } from "../lib/collection";
import type { Figure, FigureStatus } from "../types";
import { Icon } from "./Icon";
import type { LightboxImage } from "./Lightbox";

type FigureCardProps = {
  figure: Figure;
  status: FigureStatus;
  onImageOpen?: (image: LightboxImage) => void;
};

const statusLabels: Record<FigureStatus, string> = {
  owned: "Owned",
  wishlist: "Wishlist"
};

const FigureCardComponent = ({ figure, status, onImageOpen }: FigureCardProps) => {
  const images = useMemo(() => getFigureImages(figure), [figure]);
  const image = images[0] ?? null;
  const mfcLink = useMemo(() => getMfcLink(figure), [figure]);
  const title = figure.name?.trim() || "Untitled figure";
  const alt = useMemo(() => getFigureAlt(figure), [figure]);
  const details = useMemo(() => [
    { label: "Series", value: figure.series },
    { label: "Maker", value: figure.manufacturer },
    { label: "Scale", value: figure.scale },
    { label: "Release", value: formatReleaseDate(figure.releaseDate) }
  ], [figure.manufacturer, figure.releaseDate, figure.scale, figure.series]);

  return (
    <article className="figure-card">
      <div className="figure-card__media">
        {image ? (
          <button
            className="figure-card__image-button"
            type="button"
            aria-label={`Open larger image for ${title}`}
            onClick={() =>
              onImageOpen?.({
                src: image,
                images,
                initialIndex: 0,
                alt,
                title,
                meta: figure.series
              })
            }
          >
            <img src={image} alt={alt} loading="lazy" decoding="async" />
          </button>
        ) : (
          <div className="figure-card__placeholder" aria-label="No figure image available">
            <Icon name="archive" />
          </div>
        )}
        <span className={`figure-card__status figure-card__status--${status}`}>{statusLabels[status]}</span>
      </div>

      <div className="figure-card__body">
        <div className="figure-card__summary">
          <p className="figure-card__eyebrow">{figure.manufacturer || "Unknown maker"}</p>
          <h3>{title}</h3>
          {figure.description ? (
            <p className="figure-card__description">{figure.description}</p>
          ) : (
            <p className="figure-card__description figure-card__description--empty" aria-hidden="true">
              {"\u00a0"}
            </p>
          )}
        </div>

        <dl className="figure-card__details">
          {details.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || "Not specified"}</dd>
            </div>
          ))}
        </dl>

        {figure.tags?.length ? (
          <ul className="tag-list" aria-label={`${title} tags`}>
            {figure.tags.map((tag) => (
              <li key={tag}>{tag}</li>
            ))}
          </ul>
        ) : null}

        {mfcLink ? (
          <a className="figure-card__link" href={mfcLink} target="_blank" rel="noreferrer">
            View on MyFigureCollection
            <Icon name="external" />
          </a>
        ) : null}
      </div>
    </article>
  );
};

export const FigureCard = memo(FigureCardComponent);
