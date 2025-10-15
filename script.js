import { figures, wishlist } from "./figures.js";

const grid = document.getElementById("figure-grid");
const wishlistGrid = document.getElementById("wishlist-grid");
const sortSelect = document.getElementById("sort-select");
const cardTemplate = document.getElementById("figure-card-template");
const themeToggle = document.querySelector("[data-theme-toggle]");
const themeToggleIcon = themeToggle?.querySelector("[data-theme-toggle-icon]");
const themeToggleText = themeToggle?.querySelector("[data-theme-toggle-text]");

const releaseValue = (figure) => figure.releaseDate ?? "";

const sorters = {
  "release-desc": (a, b) => (releaseValue(a) < releaseValue(b) ? 1 : -1),
  "release-asc": (a, b) => (releaseValue(a) > releaseValue(b) ? 1 : -1),
  "name-asc": (a, b) => a.name.localeCompare(b.name),
  "name-desc": (a, b) => b.name.localeCompare(a.name),
};

const formatRelease = (value) => {
  if (!value) return "TBA";
  if (!value.includes("-")) return value;
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1);
  return date.toLocaleString(undefined, { month: "long", year: "numeric" });
};

const createCard = (item) => {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  card.dataset.figureId = item.id;

  const image = card.querySelector(".figure-card__image");
  const caption = card.querySelector(".figure-card__caption");
  const descriptionEl = card.querySelector(".figure-card__description");
  const tagsList = card.querySelector(".figure-card__tags");
  const actions = card.querySelector(".figure-card__actions");
  const mfcLink = card.querySelector("[data-figure-mfc-link]");

  image.src = item.image;
  const fallbackAlt = item.name ? `${item.name} figure` : "Anime figure";
  image.alt = item.alt ?? fallbackAlt;

  if (item.caption) {
    caption.textContent = item.caption;
    caption.hidden = false;
  } else {
    caption.hidden = true;
  }

  card.querySelector(".figure-card__name").textContent = item.name;
  card.querySelector(".figure-card__series").textContent = item.series;
  card.querySelector(".figure-card__manufacturer").textContent = item.manufacturer;
  card.querySelector(".figure-card__scale").textContent = item.scale;
  card.querySelector(".figure-card__release").textContent = formatRelease(item.releaseDate);

  if (item.description) {
    descriptionEl.textContent = item.description;
    descriptionEl.hidden = false;
  } else {
    descriptionEl.hidden = true;
  }

  const tags = item.tags ?? [];
  if (tags.length) {
    tagsList.hidden = false;
    tags.forEach((tag) => {
      const tagEl = document.createElement("li");
      tagEl.textContent = tag;
      tagsList.append(tagEl);
    });
  } else {
    tagsList.hidden = true;
  }

  if (actions && mfcLink) {
    const mfcUrl = item.links?.mfc ?? (item.mfcId ? `https://myfigurecollection.net/item/${item.mfcId}` : null);
    if (mfcUrl) {
      const linkLabel = item.name
        ? `View ${item.name} on MyFigureCollection`
        : "View on MyFigureCollection";
      mfcLink.href = mfcUrl;
      mfcLink.textContent = linkLabel;
      mfcLink.setAttribute("aria-label", linkLabel);
      actions.hidden = false;
    } else {
      actions.hidden = true;
    }
  }

  return card;
};

const renderList = (container, items) => {
  if (!container) return;
  container.innerHTML = "";
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    fragment.append(createCard(item));
  });

  container.append(fragment);
};

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  { threshold: 0.2 }
);

const refreshCardObservations = () => {
  observer.disconnect();
  document
    .querySelectorAll(".figure-card article")
    .forEach((card) => observer.observe(card));
};

const applySorting = () => {
  const selected = sortSelect?.value ?? "release-desc";
  const sorter = sorters[selected] ?? sorters["release-desc"];

  const sortedFigures = [...figures].sort(sorter);
  const sortedWishlist = [...wishlist].sort(sorter);

  renderList(grid, sortedFigures);
  renderList(wishlistGrid, sortedWishlist);
  refreshCardObservations();
};

sortSelect?.addEventListener("change", applySorting);

document
  .querySelectorAll("[data-scroll-to]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.getAttribute("data-scroll-to");
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ behavior: "smooth" });
    });
  });

const THEME_STORAGE_KEY = "kawaii-theme-preference";
const prefersDarkScheme = window.matchMedia("(prefers-color-scheme: dark)");
let storedTheme = null;
let currentTheme = "light";

const updateToggleLabels = (theme) => {
  if (!themeToggle) return;
  const nextTheme = theme === "dark" ? "light" : "dark";
  const actionLabel = `Switch to ${nextTheme} mode`;

  themeToggle.setAttribute("aria-label", actionLabel);
  themeToggle.setAttribute(
    "title",
    `${actionLabel} (right-click to follow system theme)`
  );
  themeToggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");

  if (themeToggleIcon) {
    themeToggleIcon.textContent = theme === "dark" ? "☀️" : "🌙";
  }

  if (themeToggleText) {
    themeToggleText.textContent = `${nextTheme[0].toUpperCase()}${nextTheme.slice(1)} mode`;
  }
};

const setTheme = (theme, { persist = false } = {}) => {
  currentTheme = theme;

  if (theme === "dark") {
    document.documentElement.dataset.theme = "dark";
  } else {
    delete document.documentElement.dataset.theme;
  }

  updateToggleLabels(theme);

  if (persist) {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    storedTheme = theme;
  }
};

const loadThemePreference = () => {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    storedTheme = stored;
    setTheme(storedTheme);
    return;
  }

  storedTheme = null;
  setTheme(prefersDarkScheme.matches ? "dark" : "light");
};

prefersDarkScheme.addEventListener("change", (event) => {
  if (storedTheme === "light" || storedTheme === "dark") return;
  setTheme(event.matches ? "dark" : "light");
});

themeToggle?.addEventListener("click", () => {
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  setTheme(nextTheme, { persist: true });
});

themeToggle?.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  localStorage.removeItem(THEME_STORAGE_KEY);
  storedTheme = null;
  setTheme(prefersDarkScheme.matches ? "dark" : "light");
});

const init = () => {
  loadThemePreference();
  applySorting();
};

init();
