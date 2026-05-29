import { siteConfig } from "../config";
import type { CollectionMetric } from "../types";
import { Icon } from "./Icon";

type HeroProps = {
  metrics: CollectionMetric[];
  updatedAt?: string | null;
};

const scrollToSection = (target: string) => {
  document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const formatUpdatedAt = (value?: string | null): string => {
  if (!value) return "ready for new shelf photos";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "recently tidied";
  return `last shelf tidy · ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(parsed))}`;
};

export const Hero = ({ metrics, updatedAt }: HeroProps) => (
  <header className="hero">
    <div className="hero__content">
      <p className="hero__eyebrow">
        <Icon name="spark" />
        {siteConfig.eyebrow}
      </p>
      <h1>{siteConfig.title}</h1>
      <p className="hero__description">{siteConfig.description}</p>
      <div className="hero__actions" aria-label="Page sections">
        <button type="button" onClick={() => scrollToSection(siteConfig.primaryAction.target)}>
          {siteConfig.primaryAction.label}
        </button>
        <button
          className="button-secondary"
          type="button"
          onClick={() => scrollToSection(siteConfig.secondaryAction.target)}
        >
          {siteConfig.secondaryAction.label}
        </button>
      </div>
      <ul className="hero__charms" aria-label="Collection notes">
        <li>pastel display case</li>
        <li>owned + wishlist</li>
        <li>admin synced</li>
      </ul>
    </div>

    <aside className="hero-panel" aria-label="Collection snapshot">
      <div className="hero-panel__scene" aria-hidden="true">
        <span className="hero-panel__moon">☾</span>
        <span className="hero-panel__figure hero-panel__figure--pink" />
        <span className="hero-panel__figure hero-panel__figure--blue" />
        <span className="hero-panel__figure hero-panel__figure--cream" />
        <span className="hero-panel__shelf" />
      </div>
      <p>{formatUpdatedAt(updatedAt)}</p>
      <div className="metric-grid">
        {metrics.map((metric) => (
          <div className="metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </div>
        ))}
      </div>
    </aside>
  </header>
);
