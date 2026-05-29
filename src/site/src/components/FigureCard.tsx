import { formatReleaseDate, getFigureAlt, getFigureImage, getMfcLink } from "../lib/collection";
import type { Figure, FigureStatus } from "../types";
import { Icon } from "./Icon";

type FigureCardProps = {
  figure: Figure;
  status: FigureStatus;
  onImageOpen?: (image: { src: string; alt: string; title: string; meta?: string }) => void;
};

const statusLabels: Record<FigureStatus, string> = {
  owned: "Owned",
  wishlist: "Wishlist"
};

export const FigureCard = ({ figure, status, onImageOpen }: FigureCardProps) => {
  const image = getFigureImage(figure);
  const mfcLink = getMfcLink(figure);
  const title = figure.name?.trim() || "Untitled figure";
  const details = [
    { label: "Series", value: figure.series },
    { label: "Maker", value: figure.manufacturer },
    { label: "Scale", value: figure.scale },
    { label: "Release", value: formatReleaseDate(figure.releaseDate) }
  ];

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
                alt: getFigureAlt(figure),
                title,
                meta: figure.series
              })
            }
          >
            <img src={image} alt={getFigureAlt(figure)} loading="lazy" decoding="async" />
          </button>
        ) : (
          <div className="figure-card__placeholder" aria-label="No figure image available">
            <Icon name="archive" />
          </div>
        )}
        <span className={`figure-card__status figure-card__status--${status}`}>{statusLabels[status]}</span>
      </div>

      <div className="figure-card__body">
        <div>
          <p className="figure-card__eyebrow">{figure.manufacturer || "Unknown maker"}</p>
          <h3>{title}</h3>
          {figure.description ? <p className="figure-card__description">{figure.description}</p> : null}
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
