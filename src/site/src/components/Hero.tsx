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
  if (!value) return "Synced on demand";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "Recently synced";
  return `Synced ${new Intl.DateTimeFormat(undefined, {
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
    </div>

    <aside className="hero-panel" aria-label="Collection snapshot">
      <div className="hero-panel__orb" aria-hidden="true" />
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
