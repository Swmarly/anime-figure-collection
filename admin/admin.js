const collectionStatus = document.getElementById("collection-status");
const lookupForm = document.getElementById("mfc-lookup-form");
const lookupInput = document.getElementById("mfc-item-id");
const lookupFeedback = document.getElementById("mfc-feedback");
const clearLookupButton = document.getElementById("clear-mfc-data");
const figureForm = document.getElementById("figure-form");
const resetFormButton = document.getElementById("reset-form");
const copyEntryButton = document.getElementById("copy-entry");
const downloadButton = document.getElementById("download-json");
const sessionLog = document.getElementById("session-log");
const preview = document.getElementById("entry-preview");
const generateSlugButton = document.getElementById("generate-slug");

const field = (id) => document.getElementById(id);

const fields = {
  list: field("figure-list"),
  slug: field("figure-slug"),
  mfcId: field("figure-mfc-id"),
  name: field("figure-name"),
  series: field("figure-series"),
  manufacturer: field("figure-manufacturer"),
  scale: field("figure-scale"),
  releaseDate: field("figure-release"),
  image: field("figure-image"),
  caption: field("figure-caption"),
  description: field("figure-description"),
  tags: field("figure-tags"),
  alt: field("figure-alt"),
  notes: field("figure-notes"),
};

const state = {
  collection: { owned: [], wishlist: [] },
  loaded: false,
  additions: [],
};

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const slugify = ({ name, mfcId }) => {
  const base = (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  if (base) return base;
  if (mfcId) return `mfc-${mfcId}`;
  return `figure-${Date.now()}`;
};

const normalizeTags = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((tag) => String(tag).trim())
      .filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const compactEntry = (entry) => {
  const keepEmpty = new Set(["tags"]);
  return Object.entries(entry).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) {
      if (keepEmpty.has(key)) acc[key] = value === null ? [] : value;
      return acc;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed && !keepEmpty.has(key)) {
        if (keepEmpty.has(key)) acc[key] = "";
        return acc;
      }
      acc[key] = trimmed;
      return acc;
    }

    if (Array.isArray(value)) {
      const items = value.map((item) => String(item).trim()).filter(Boolean);
      if (items.length || keepEmpty.has(key)) {
        acc[key] = items;
      }
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});
};

const readForm = () => {
  const list = fields.list.value === "wishlist" ? "wishlist" : "owned";
  const name = fields.name.value.trim();
  const slug = fields.slug.value.trim();

  if (!name || !slug) {
    return null;
  }

  const mfcIdRaw = fields.mfcId.value.trim();
  const mfcId = mfcIdRaw ? Number(mfcIdRaw) : null;

  const entry = {
    slug,
    mfcId: Number.isFinite(mfcId) ? mfcId : null,
    name,
    series: fields.series.value,
    manufacturer: fields.manufacturer.value,
    scale: fields.scale.value,
    releaseDate: fields.releaseDate.value,
    image: fields.image.value,
    caption: fields.caption.value,
    description: fields.description.value,
    tags: normalizeTags(fields.tags.value),
    alt: fields.alt.value,
    notes: fields.notes.value,
  };

  return { list, entry: compactEntry(entry) };
};

const renderPreview = () => {
  const formData = readForm();
  if (!formData) {
    preview.innerHTML = "<p>Enter at least a name and slug to see the preview.</p>";
    return;
  }

  const json = JSON.stringify(formData.entry, null, 2);
  preview.innerHTML = `<pre>${escapeHtml(json)}</pre>`;
};

const updateStatus = () => {
  const owned = state.collection.owned?.length ?? 0;
  const wishlist = state.collection.wishlist?.length ?? 0;
  if (state.loaded) {
    collectionStatus.textContent = `${owned} owned · ${wishlist} on wishlist`;
  } else {
    collectionStatus.textContent = "Loading collection…";
  }
};

const renderSessionLog = () => {
  if (!state.additions.length) {
    sessionLog.innerHTML = "<p>No new entries yet.</p>";
    return;
  }

  const markup = state.additions
    .map((item) => {
      const tags = item.entry.tags?.length
        ? `<span>Tags: ${escapeHtml(item.entry.tags.join(", "))}</span>`
        : "";
      const mfc = item.entry.mfcId
        ? `<span>MFC: <code>${escapeHtml(String(item.entry.mfcId))}</code></span>`
        : "";
      return `
        <article class="session-entry">
          <h3>${escapeHtml(item.entry.name)}</h3>
          <div class="session-entry__meta">
            <span>List: ${escapeHtml(item.list)}</span>
            ${mfc}
            ${tags}
          </div>
          <div class="session-entry__meta">Slug: <code>${escapeHtml(item.entry.slug)}</code></div>
        </article>
      `;
    })
    .join("\n");

  sessionLog.innerHTML = markup;
};

const ensureSlug = () => {
  const slugValue = fields.slug.value.trim();
  if (slugValue) return slugValue;
  const generated = slugify({
    name: fields.name.value.trim(),
    mfcId: fields.mfcId.value.trim(),
  });
  fields.slug.value = generated;
  return generated;
};

const resetForm = () => {
  figureForm.reset();
  lookupInput.value = "";
  lookupFeedback.textContent = "";
  fields.list.value = "owned";
  renderPreview();
};

const applyEntryToForm = (entry = {}) => {
  if (entry.list) {
    fields.list.value = entry.list;
  }
  if (entry.slug) fields.slug.value = entry.slug;
  if (entry.mfcId) fields.mfcId.value = entry.mfcId;
  if (entry.name) fields.name.value = entry.name;
  if (entry.series) fields.series.value = entry.series;
  if (entry.manufacturer) fields.manufacturer.value = entry.manufacturer;
  if (entry.scale) fields.scale.value = entry.scale;
  if (entry.releaseDate) fields.releaseDate.value = entry.releaseDate;
  if (entry.image) fields.image.value = entry.image;
  if (entry.caption) fields.caption.value = entry.caption;
  if (entry.description) fields.description.value = entry.description;
  if (entry.tags) fields.tags.value = Array.isArray(entry.tags)
    ? entry.tags.join(", ")
    : String(entry.tags);
  if (entry.alt) fields.alt.value = entry.alt;
  if (entry.notes) fields.notes.value = entry.notes;
  renderPreview();
};

const fetchCollection = async () => {
  try {
    const response = await fetch("../data/collection.json?ts=" + Date.now(), {
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
    });
    if (!response.ok) {
      throw new Error(`Unable to load collection (status ${response.status})`);
    }
    const data = await response.json();
    state.collection = {
      owned: Array.isArray(data.owned) ? [...data.owned] : [],
      wishlist: Array.isArray(data.wishlist) ? [...data.wishlist] : [],
    };
    state.loaded = true;
    updateStatus();
  } catch (error) {
    state.loaded = false;
    collectionStatus.textContent = error.message;
  }
};

const mergeEntryIntoCollection = (list, entry) => {
  if (!state.loaded) return false;
  const target = state.collection[list];
  if (!Array.isArray(target)) return false;

  const index = target.findIndex(
    (item) => item.slug === entry.slug || (entry.mfcId && item.mfcId === entry.mfcId)
  );

  if (index >= 0) {
    target.splice(index, 1, { ...target[index], ...entry });
  } else {
    target.push(entry);
  }

  state.additions.unshift({ list, entry });
  updateStatus();
  renderSessionLog();
  return true;
};

const handleCopyEntry = async () => {
  const formData = readForm();
  if (!formData) {
    lookupFeedback.textContent = "Enter a name and slug before copying.";
    return;
  }
  try {
    await navigator.clipboard.writeText(JSON.stringify(formData.entry, null, 2));
    lookupFeedback.textContent = "Entry copied to clipboard.";
  } catch (error) {
    lookupFeedback.textContent = "Unable to copy entry automatically.";
  }
};

const handleDownload = () => {
  if (!state.loaded) {
    lookupFeedback.textContent = "Load the collection before downloading.";
    return;
  }
  const blob = new Blob([JSON.stringify(state.collection, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "collection.json";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const handleLookup = async (event) => {
  event.preventDefault();
  const itemId = lookupInput.value.trim();
  if (!itemId) return;

  lookupFeedback.textContent = "Fetching item details…";

  try {
    const response = await fetch(`/api/mfc?item=${encodeURIComponent(itemId)}`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const message = response.headers.get("X-Error") || `Lookup failed (status ${response.status})`;
      throw new Error(message);
    }

    const data = await response.json();
    fields.mfcId.value = itemId;
    fields.name.value = data.name ?? fields.name.value;
    fields.series.value = data.series ?? fields.series.value;
    fields.manufacturer.value = data.manufacturer ?? fields.manufacturer.value;
    fields.scale.value = data.scale ?? fields.scale.value;
    fields.releaseDate.value = data.releaseDate ?? fields.releaseDate.value;
    fields.image.value = data.image ?? fields.image.value;
    fields.caption.value = data.caption ?? fields.caption.value;
    fields.description.value = data.description ?? fields.description.value;

    if (Array.isArray(data.tags)) {
      const existingTags = normalizeTags(fields.tags.value);
      const merged = Array.from(new Set([...existingTags, ...data.tags]));
      fields.tags.value = merged.join(", ");
    }

    if (!fields.slug.value.trim()) {
      fields.slug.value = slugify({ name: data.name, mfcId: itemId });
    }

    lookupFeedback.textContent = "Details imported. Review and adjust below.";
    renderPreview();
  } catch (error) {
    lookupFeedback.textContent =
      error.message || "Unable to fetch details. Please add the figure manually.";
  }
};

const handleFormSubmit = (event) => {
  event.preventDefault();
  ensureSlug();
  const formData = readForm();
  if (!formData) {
    lookupFeedback.textContent = "Name and slug are required.";
    return;
  }

  if (!state.loaded) {
    lookupFeedback.textContent = "Collection not loaded yet. Try refreshing the page.";
    return;
  }

  mergeEntryIntoCollection(formData.list, formData.entry);
  lookupFeedback.textContent = `Saved to ${formData.list}. Download the JSON when you're ready.`;
  renderPreview();
};

lookupForm.addEventListener("submit", handleLookup);
clearLookupButton.addEventListener("click", () => {
  lookupInput.value = "";
  lookupFeedback.textContent = "Lookup fields cleared.";
});
figureForm.addEventListener("input", renderPreview);
figureForm.addEventListener("change", renderPreview);
figureForm.addEventListener("submit", handleFormSubmit);
resetFormButton.addEventListener("click", () => {
  resetForm();
});
copyEntryButton.addEventListener("click", handleCopyEntry);
downloadButton.addEventListener("click", handleDownload);
generateSlugButton.addEventListener("click", () => {
  fields.slug.value = slugify({
    name: fields.name.value.trim(),
    mfcId: fields.mfcId.value.trim(),
  });
  renderPreview();
});

fetchCollection().then(renderPreview);
renderSessionLog();
