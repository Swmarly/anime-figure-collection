import { figures } from "./figures.js";

const grid = document.getElementById("figure-grid");
const sortSelect = document.getElementById("sort-select");
const cardTemplate = document.getElementById("figure-card-template");

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

const renderFigures = (items) => {
  grid.innerHTML = "";
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.figureId = item.id;
    const image = card.querySelector(".figure-card__image");
    const caption = card.querySelector(".figure-card__caption");

    image.src = item.image;
    image.alt = `${item.name} placeholder image`;
    caption.textContent = item.caption;

    card.querySelector(".figure-card__name").textContent = item.name;
    card.querySelector(".figure-card__series").textContent = item.series;
    card.querySelector(".figure-card__manufacturer").textContent = item.manufacturer;
    card.querySelector(".figure-card__scale").textContent = item.scale;
    card.querySelector(".figure-card__release").textContent = formatRelease(item.releaseDate);
    const descriptionEl = card.querySelector(".figure-card__description");
    if (item.description) {
      descriptionEl.textContent = item.description;
      descriptionEl.hidden = false;
    } else {
      descriptionEl.hidden = true;
    }

    const tagsList = card.querySelector(".figure-card__tags");
    (item.tags ?? []).forEach((tag) => {
      const tagEl = document.createElement("li");
      tagEl.textContent = tag;
      tagsList.append(tagEl);
    });

    fragment.append(card);
  });

  grid.append(fragment);

  observer.disconnect();
  document
    .querySelectorAll(".figure-card article")
    .forEach((card) => observer.observe(card));
};

const applySorting = () => {
  const selected = sortSelect.value;
  const sorter = sorters[selected] ?? sorters["release-desc"];
  const sorted = [...figures].sort(sorter);
  renderFigures(sorted);
};

sortSelect.addEventListener("change", applySorting);

document.querySelectorAll('[data-scroll-to]').forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.getAttribute("data-scroll-to");
    const target = document.getElementById(targetId);
    target?.scrollIntoView({ behavior: "smooth" });
  });
});

// Intersection Observer for card animations
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

const init = () => {
  applySorting();
};

init();
