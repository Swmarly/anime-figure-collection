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
const manager = document.getElementById("collection-manager");
const signOutButton = document.getElementById("sign-out-button");
const saveChangesButton = document.getElementById("save-changes");
const saveButtonDefaultLabel = saveChangesButton
  ? saveChangesButton.textContent.trim() || "Save changes"
  : "Save changes";

const field = (id) => document.getElementById(id);

const fields = {
  list: field("figure-list"),
  slug: field("figure-slug"),
  mfcId: field("figure-mfc-id"),
  name: field("figure-name"),
  classification: field("figure-classification"),
  productLine: field("figure-product-line"),
  origin: field("figure-origin"),
  character: field("figure-character"),
  companies: field("figure-companies"),
  version: field("figure-version"),
  releases: field("figure-releases"),
  materials: field("figure-materials"),
  dimensions: field("figure-dimensions"),
  image: field("figure-image"),
  caption: field("figure-caption"),
  description: field("figure-description"),
  tags: field("figure-tags"),
  alt: field("figure-alt"),
  notes: field("figure-notes"),
};

const slugState = {
  manual: false,
  lastGenerated: "",
};

let updatingSlugProgrammatically = false;

const resetSlugState = () => {
  slugState.manual = false;
  slugState.lastGenerated = "";
};

const setSlugField = (value, { generated = false } = {}) => {
  if (!fields.slug) return;
  updatingSlugProgrammatically = true;
  fields.slug.value = value || "";
  updatingSlugProgrammatically = false;
  if (generated) {
    slugState.manual = false;
    slugState.lastGenerated = fields.slug.value.trim();
  }
};

const autoUpdateSlugFromName = () => {
  if (!fields.name || !fields.slug) return;
  if (slugState.manual) return;
  const nameValue = fields.name.value.trim();
  const mfcValue = fields.mfcId ? fields.mfcId.value.trim() : "";
  if (!nameValue && !mfcValue) {
    if (!fields.slug.value.trim()) {
      resetSlugState();
    }
    return;
  }
  const generated = slugify({ name: nameValue, mfcId: mfcValue });
  if (!generated) return;
  if (fields.slug.value.trim() === generated) {
    setSlugField(generated, { generated: true });
    return;
  }
  setSlugField(generated, { generated: true });
};

const handleSlugInputChange = () => {
  if (!fields.slug || updatingSlugProgrammatically) return;
  const current = fields.slug.value.trim();
  if (!current) {
    resetSlugState();
    return;
  }
  slugState.manual = true;
  slugState.lastGenerated = current;
};

const state = {
  collection: { owned: [], wishlist: [] },
  loaded: false,
  additions: [],
  editing: null,
  saving: false,
  lastSavedAt: null,
  lastError: null,
  savePromise: null,
};

const LOGIN_PAGE = "/admin/login.html";
const AUTH_CHECK_ENDPOINT = "/api/auth-check";
const COLLECTION_ENDPOINT = "/api/collection";
const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please sign in again.";

const redirectToLogin = () => {
  const redirectTarget = window.location.pathname.endsWith("/")
    ? `${window.location.pathname}index.html`
    : window.location.pathname;
  const params = new URLSearchParams();
  params.set("redirect", redirectTarget.replace(/^\/+/, "/"));
  window.location.href = `${LOGIN_PAGE}?${params.toString()}`;
};

const ensureSession = async () => {
  try {
    const response = await fetch(AUTH_CHECK_ENDPOINT, {
      method: "GET",
      headers: { "Cache-Control": "no-cache" },
      credentials: "same-origin",
    });
    if (response.status === 204) {
      return true;
    }
  } catch (error) {
    console.warn("Unable to verify admin session", error);
  }
  redirectToLogin();
  return false;
};

const authorizedFetch = async (input, init = {}) => {
  const options = {
    ...init,
    headers: new Headers(init && init.headers ? init.headers : undefined),
    credentials: "same-origin",
  };

  const response = await fetch(input, options);

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Unauthorized");
  }

  return response;
};

ensureSession();

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

const parseMfcItemId = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/item\/(\d+)/i);
  if (urlMatch) return urlMatch[1];
  const digits = trimmed.replace(/\D+/g, "");
  return digits || null;
};

const identityMatches = (entry, target) => {
  if (!entry || !target) return false;
  if (entry.slug && target.slug && entry.slug === target.slug) return true;
  if (
    entry.mfcId !== undefined &&
    entry.mfcId !== null &&
    target.mfcId !== undefined &&
    target.mfcId !== null &&
    Number(entry.mfcId) === Number(target.mfcId)
  ) {
    return true;
  }
  return false;
};

const getEntryLabel = (entry) => {
  if (!entry) return "Untitled figure";
  if (entry.name && entry.name.trim()) return entry.name.trim();
  if (entry.slug && entry.slug.trim()) return entry.slug.trim();
  if (entry.mfcId) return `MFC ${entry.mfcId}`;
  return "Untitled figure";
};

const sortEntries = (entries = []) =>
  [...entries].sort((a, b) => getEntryLabel(a).localeCompare(getEntryLabel(b)));

const formatListName = (list) => (list === "wishlist" ? "Wishlist" : "Owned");

const findEditingEntry = () => {
  if (!state.editing || !state.editing.list) return null;
  const collection = state.collection?.[state.editing.list];
  if (!Array.isArray(collection)) return null;
  return (
    collection.find((item) => identityMatches(item, state.editing)) || null
  );
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

const splitLines = (value) =>
  String(value)
    .split(/\r?\n|[•;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const parseCompaniesField = (value) => {
  if (!value) return [];
  const lines = Array.isArray(value) ? value : splitLines(value);
  const entries = lines
    .map((line) => {
      const trimmed = String(line).trim();
      if (!trimmed) return null;
      let name = trimmed;
      let role = null;
      const parenMatch = trimmed.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      if (parenMatch) {
        name = parenMatch[1].trim();
        role = parenMatch[2].trim();
      } else {
        const asMatch = trimmed.match(/^(.*?)\s*(?:-|–|—|as)\s+(.+)$/i);
        if (asMatch) {
          name = asMatch[1].trim();
          role = asMatch[2].trim();
        }
      }
      if (!name) return null;
      return { name, role: role || null };
    })
    .filter(Boolean);
  const unique = new Map();
  entries.forEach((entry) => {
    const key = `${entry.name.toLowerCase()}::${(entry.role || "").toLowerCase()}`;
    if (!unique.has(key)) {
      unique.set(key, entry);
    }
  });
  return Array.from(unique.values());
};

const formatCompaniesField = (companies) => {
  if (!Array.isArray(companies)) return "";
  return companies
    .map((company) => {
      if (!company || typeof company !== "object") return "";
      const name = String(company.name || "").trim();
      const role = company.role ? String(company.role).trim() : "";
      if (!name && !role) return "";
      return role ? `${name} as ${role}`.trim() : name;
    })
    .filter(Boolean)
    .join("\n");
};

const parseMaterialsField = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value)
    .split(/[,•]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseDimensionsField = (value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (Array.isArray(value)) {
    const joined = value.map((item) => String(item).trim()).filter(Boolean).join("\n");
    return joined || null;
  }
  if (value && typeof value === "object" && value.text) {
    const trimmed = String(value.text).trim();
    return trimmed || null;
  }
  return null;
};

const parseReleaseLine = (line) => {
  const text = String(line).trim();
  if (!text) return null;
  const dateMatch = text.match(/(\d{4}[./-]\d{1,2}(?:[./-]\d{1,2})?|\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4})/);
  const rawDate = dateMatch ? dateMatch[1] : null;
  const normalizeDate = (value) => {
    if (!value) return null;
    const cleaned = value.replace(/[.]/g, "-").replace(/\//g, "-");
    let match = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      const [, year, month, day] = match;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    match = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (match) {
      const [, month, day, year] = match;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    match = cleaned.match(/^(\d{4})-(\d{1,2})$/);
    if (match) {
      const [, year, month] = match;
      return `${year}-${month.padStart(2, "0")}`;
    }
    match = cleaned.match(/^(\d{4})$/);
    if (match) {
      return match[1];
    }
    return null;
  };
  let remainder = text;
  if (rawDate) {
    remainder = remainder.replace(rawDate, " ").trim();
  }
  let region = null;
  const regionMatch = remainder.match(/\(([^)]+)\)\s*$/);
  if (regionMatch) {
    region = regionMatch[1].trim() || null;
    remainder = remainder.slice(0, regionMatch.index).trim();
  }
  let type = null;
  const typeMatch = remainder.match(/(?:as|[-–—])\s*([^()]+)$/i);
  if (typeMatch) {
    type = typeMatch[1].trim() || null;
    remainder = remainder.slice(0, typeMatch.index).trim();
  }
  if (!type && remainder) {
    type = remainder.trim();
    remainder = "";
  }
  return {
    label: text,
    date: normalizeDate(rawDate),
    type: type || null,
    region,
  };
};

const parseReleasesField = (value) => {
  if (!value) return [];
  const lines = Array.isArray(value) ? value : splitLines(value);
  return lines
    .map((line) => parseReleaseLine(line))
    .filter(Boolean);
};

const formatReleasesField = (releases) => {
  if (!Array.isArray(releases)) return "";
  return releases
    .map((release) => {
      if (!release) return "";
      if (typeof release === "string") return release.trim();
      if (release.label) return release.label.trim();
      const parts = [];
      if (release.date) parts.push(release.date);
      if (release.type) parts.push(release.type);
      if (release.region) parts.push(`(${release.region})`);
      return parts.join(" ").trim();
    })
    .filter(Boolean)
    .join("\n");
};

const deriveReleaseDate = (releases) => {
  if (!Array.isArray(releases)) return null;
  const normalized = releases
    .map((release) => {
      if (!release) return null;
      if (typeof release === "string") {
        const parsed = parseReleaseLine(release);
        return parsed?.date || null;
      }
      return release.date || null;
    })
    .filter(Boolean)
    .sort();
  if (!normalized.length) return null;
  const first = normalized[0];
  if (first.length === 10) {
    return first.slice(0, 7);
  }
  return first;
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
      const items = value
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object") {
            const cleaned = compactEntry(item);
            return cleaned && Object.keys(cleaned).length ? cleaned : null;
          }
          return null;
        })
        .filter((item) => item && (typeof item !== "string" || item));
      if (items.length || keepEmpty.has(key)) {
        acc[key] = items;
      }
      return acc;
    }

    if (typeof value === "object") {
      const nested = compactEntry(value);
      if (nested && Object.keys(nested).length) {
        acc[key] = nested;
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

  const companies = parseCompaniesField(fields.companies?.value ?? "");
  const releases = parseReleasesField(fields.releases?.value ?? "");
  const materials = parseMaterialsField(fields.materials?.value ?? "");
  const dimensions = parseDimensionsField(fields.dimensions?.value ?? "");

  let releaseDate = deriveReleaseDate(releases);
  if (!releaseDate && releases.length === 0) {
    const editingEntry = findEditingEntry();
    if (editingEntry && editingEntry.releaseDate) {
      releaseDate = editingEntry.releaseDate;
    }
  }

  const entry = {
    slug,
    mfcId: Number.isFinite(mfcId) ? mfcId : null,
    name,
    classification: fields.classification?.value ?? "",
    productLine: fields.productLine?.value ?? "",
    origin: fields.origin?.value ?? "",
    character: fields.character?.value ?? "",
    companies,
    version: fields.version?.value ?? "",
    releases,
    releaseDate,
    materials,
    dimensions,
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

const buildCollectionPayload = () => ({
  owned: Array.isArray(state.collection.owned)
    ? state.collection.owned.map((item) => ({ ...item }))
    : [],
  wishlist: Array.isArray(state.collection.wishlist)
    ? state.collection.wishlist.map((item) => ({ ...item }))
    : [],
});

const persistCollection = async () => {
  if (!state.loaded) {
    throw new Error("Collection is not loaded yet.");
  }

  if (state.savePromise) {
    return state.savePromise;
  }

  const payload = buildCollectionPayload();

  state.saving = true;
  state.lastError = null;
  updateStatus();

  const saveTask = (async () => {
    try {
      const response = await authorizedFetch(COLLECTION_ENDPOINT, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await response
          .json()
          .catch(() => ({ error: response.statusText || "Unable to save collection." }));
        throw new Error(message.error || `Unable to save collection (status ${response.status}).`);
      }

      const result = await response.json().catch(() => ({}));
      state.lastSavedAt = result.updatedAt || new Date().toISOString();
      state.lastError = null;
      return { success: true, updatedAt: state.lastSavedAt };
    } catch (error) {
      state.lastError = error;
      throw error;
    } finally {
      state.saving = false;
      state.savePromise = null;
      updateStatus();
    }
  })();

  state.savePromise = saveTask;
  return saveTask;
};

const updateSaveButton = () => {
  if (!saveChangesButton) return;
  if (!state.loaded) {
    saveChangesButton.disabled = true;
    saveChangesButton.textContent = saveButtonDefaultLabel;
    return;
  }

  if (state.saving) {
    saveChangesButton.disabled = true;
    saveChangesButton.textContent = "Saving…";
    return;
  }

  saveChangesButton.disabled = false;
  saveChangesButton.textContent = saveButtonDefaultLabel;
};

const updateStatus = () => {
  const owned = state.collection.owned?.length ?? 0;
  const wishlist = state.collection.wishlist?.length ?? 0;
  if (!state.loaded) {
    collectionStatus.textContent = "Loading collection…";
    updateSaveButton();
    return;
  }

  if (state.saving) {
    collectionStatus.textContent = `${owned} owned · ${wishlist} on wishlist · Saving…`;
    updateSaveButton();
    return;
  }

  if (state.lastError) {
    collectionStatus.textContent = `${owned} owned · ${wishlist} on wishlist · Sync failed`;
    updateSaveButton();
    return;
  }

  if (state.lastSavedAt) {
    const date = new Date(state.lastSavedAt);
    const formatted = Number.isNaN(date.getTime())
      ? state.lastSavedAt
      : date.toLocaleString();
    collectionStatus.textContent = `${owned} owned · ${wishlist} on wishlist · Last saved ${formatted}`;
    updateSaveButton();
    return;
  }

  collectionStatus.textContent = `${owned} owned · ${wishlist} on wishlist`;
  updateSaveButton();
};

const renderSessionLog = () => {
  if (!state.additions.length) {
    sessionLog.innerHTML = "<p>No new entries yet.</p>";
    return;
  }

  const markup = state.additions
    .map((item) => {
      const actionLabel = (() => {
        switch (item.action) {
          case "updated":
            return "Updated";
          case "moved":
            return "Moved";
          case "deleted":
            return "Deleted";
          default:
            return "Added";
        }
      })();
      const listLabel = formatListName(item.list);
      const tags = item.entry.tags?.length
        ? `<span>Tags: ${escapeHtml(item.entry.tags.join(", "))}</span>`
        : "";
      const mfc = item.entry.mfcId
        ? `<span>MFC: <code>${escapeHtml(String(item.entry.mfcId))}</code></span>`
        : "";
      const from = item.from ? `<span>From: ${escapeHtml(formatListName(item.from))}</span>` : "";
      return `
        <article class="session-entry">
          <h3>${escapeHtml(item.entry.name)}</h3>
          <div class="session-entry__meta">
            <span>Action: ${escapeHtml(actionLabel)}</span>
            <span>List: ${escapeHtml(listLabel)}</span>
            ${from}
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

const renderManagerSection = (title, listKey, items = []) => {
  const safeTitle = escapeHtml(title);
  if (!Array.isArray(items) || !items.length) {
    return `
      <section class="manager__section">
        <h3>${safeTitle}</h3>
        <p class="manager__empty">No figures yet.</p>
      </section>
    `;
  }

  const sorted = sortEntries(items);
  const listItems = sorted
    .map((entry) => {
      const isActive =
        state.editing && state.editing.list === listKey && identityMatches(entry, state.editing);
      const metaParts = [];
      if (entry.slug) {
        metaParts.push(`Slug: <code>${escapeHtml(entry.slug)}</code>`);
      }
      if (entry.mfcId) {
        metaParts.push(`MFC: <code>${escapeHtml(String(entry.mfcId))}</code>`);
      }
      if (entry.origin) {
        metaParts.push(escapeHtml(entry.origin));
      }
      if (entry.classification) {
        metaParts.push(escapeHtml(entry.classification));
      }
      if (!entry.origin && entry.character) {
        metaParts.push(escapeHtml(entry.character));
      }
      const meta = metaParts.length
        ? `<div class="manager__meta">${metaParts.join(" · ")}</div>`
        : "";
      const slugAttr = entry.slug ? escapeHtml(entry.slug) : "";
      const mfcAttr = entry.mfcId ? escapeHtml(String(entry.mfcId)) : "";
      const deleteDisabled = state.saving ? " disabled" : "";
      return `
        <li>
          <div class="manager__item-row">
            <button
              type="button"
              class="manager__item${isActive ? " manager__item--active" : ""}"
              data-action="edit-entry"
              data-list="${escapeHtml(listKey)}"
              data-slug="${slugAttr}"
              data-mfc-id="${mfcAttr}"
            >
              <span class="manager__name">${escapeHtml(getEntryLabel(entry))}</span>
              ${meta}
            </button>
            <button
              type="button"
              class="manager__delete"
              data-action="delete-entry"
              data-list="${escapeHtml(listKey)}"
              data-slug="${slugAttr}"
              data-mfc-id="${mfcAttr}"
              ${deleteDisabled}
            >
              Delete
            </button>
          </div>
        </li>
      `;
    })
    .join("\n");

  return `
    <section class="manager__section">
      <h3>${safeTitle}</h3>
      <ul class="manager__list">
        ${listItems}
      </ul>
    </section>
  `;
};

const renderManager = () => {
  if (!manager) return;
  if (!state.loaded) {
    manager.innerHTML = '<p class="manager__placeholder">Loading collection…</p>';
    return;
  }

  let editingEntry = null;
  if (state.editing && state.editing.list) {
    editingEntry = state.collection[state.editing.list]?.find((item) =>
      identityMatches(item, state.editing)
    );
    if (!editingEntry) {
      state.editing = null;
    }
  }
  const editingLabel = editingEntry ? getEntryLabel(editingEntry) : null;

  const statusMarkup = editingLabel
    ? `
        <div class="manager__status">
          <span>
            Currently editing <strong>${escapeHtml(editingLabel)}</strong>
            <span>(${escapeHtml(formatListName(state.editing.list))})</span>
          </span>
          <button type="button" class="manager__clear" data-action="clear-editing">Stop editing</button>
        </div>
      `
    : '<p class="manager__placeholder">Select a figure to load it into the form.</p>';

  manager.innerHTML = `
    ${statusMarkup}
    <div class="manager__lists">
      ${renderManagerSection("Owned figures", "owned", state.collection.owned)}
      ${renderManagerSection("Wishlist", "wishlist", state.collection.wishlist)}
    </div>
  `;
};

const ensureSlug = () => {
  const slugValue = fields.slug.value.trim();
  if (slugValue) return slugValue;
  const generated = slugify({
    name: fields.name.value.trim(),
    mfcId: fields.mfcId.value.trim(),
  });
  setSlugField(generated, { generated: true });
  return generated;
};

const resetForm = ({ keepLookup = false } = {}) => {
  figureForm.reset();
  resetSlugState();
  if (!keepLookup) {
    lookupInput.value = "";
    lookupFeedback.textContent = "";
  }
  fields.list.value = "owned";
  state.editing = null;
  renderPreview();
  renderManager();
  if (fields.name && typeof fields.name.focus === "function") {
    fields.name.focus();
  }
};

const applyEntryToForm = (entry = {}) => {
  if (entry.list) {
    fields.list.value = entry.list;
  }
  if (entry.slug) {
    setSlugField(entry.slug);
    slugState.manual = true;
    slugState.lastGenerated = fields.slug.value.trim();
  } else {
    setSlugField("", { generated: true });
  }
  if (fields.mfcId) fields.mfcId.value = entry.mfcId ?? "";
  if (fields.name) fields.name.value = entry.name ?? "";
  if (fields.classification) {
    fields.classification.value = entry.classification ?? "";
  }
  if (fields.productLine) {
    fields.productLine.value = entry.productLine ?? "";
  }
  if (fields.origin) {
    fields.origin.value = entry.origin ?? "";
  }
  if (fields.character) {
    fields.character.value = entry.character ?? "";
  }
  if (fields.companies) {
    fields.companies.value = formatCompaniesField(entry.companies);
  }
  if (fields.version) {
    fields.version.value = entry.version ?? "";
  }
  if (fields.releases) {
    fields.releases.value = formatReleasesField(entry.releases);
  }
  if (fields.materials) {
    const materials = Array.isArray(entry.materials)
      ? entry.materials.join(", ")
      : entry.materials ?? "";
    fields.materials.value = materials;
  }
  if (fields.dimensions) {
    const dimensions = typeof entry.dimensions === "string"
      ? entry.dimensions
      : Array.isArray(entry.dimensions)
      ? entry.dimensions.join("\n")
      : entry.dimensions?.text ?? "";
    fields.dimensions.value = dimensions;
  }
  if (fields.image) fields.image.value = entry.image ?? "";
  if (fields.caption) fields.caption.value = entry.caption ?? "";
  if (fields.description) fields.description.value = entry.description ?? "";
  if (fields.tags) {
    if (Array.isArray(entry.tags)) {
      fields.tags.value = entry.tags.join(", ");
    } else if (entry.tags) {
      fields.tags.value = String(entry.tags);
    } else {
      fields.tags.value = "";
    }
  }
  if (fields.alt) fields.alt.value = entry.alt ?? "";
  if (fields.notes) fields.notes.value = entry.notes ?? "";
  if (entry.releaseDate && !deriveReleaseDate(entry.releases || [])) {
    // Preserve legacy release dates for display and sorting if releases are absent
    if (fields.releases && !fields.releases.value.trim()) {
      fields.releases.value = entry.releaseDate;
    }
  }
  renderPreview();
};

const fetchCollection = async () => {
  try {
    const response = await authorizedFetch(COLLECTION_ENDPOINT, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-store",
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
    state.lastError = null;
    state.lastSavedAt = data.updatedAt ?? null;
    updateStatus();
    renderManager();
  } catch (error) {
    state.loaded = false;
    state.lastError = error;
    collectionStatus.textContent = error.message;
    if (manager) {
      manager.innerHTML = `<p class="manager__placeholder">${escapeHtml(error.message)}</p>`;
    }
    updateSaveButton();
  }
};

const mergeEntryIntoCollection = (list, entry, previous = null) => {
  if (!state.loaded) return { success: false };
  const target = state.collection[list];
  if (!Array.isArray(target)) return { success: false };

  const matchesNew = (item) =>
    (entry.slug && item.slug === entry.slug) ||
    (entry.mfcId && item.mfcId && Number(item.mfcId) === Number(entry.mfcId));

  let index = target.findIndex(matchesNew);

  const allowFallback =
    previous &&
    previous.list === list &&
    (previous.allowIdentityChange === true || identityMatches(entry, previous));

  if (index === -1 && allowFallback) {
    index = target.findIndex((item) => identityMatches(item, previous));
  }

  let action = index >= 0 ? "updated" : "added";
  if (index >= 0) {
    target.splice(index, 1, { ...target[index], ...entry });
  } else {
    target.push(entry);
    index = target.length - 1;
  }

  let from = null;
  if (previous && previous.list) {
    const source = state.collection[previous.list];
    if (Array.isArray(source)) {
      const removeIndex = source.findIndex((item, idx) => {
        if (previous.list === list && idx === index) return false;
        return identityMatches(item, previous);
      });
      if (removeIndex >= 0) {
        source.splice(removeIndex, 1);
        if (previous.list !== list) {
          from = previous.list;
          action = "moved";
        }
      }
    }
  }

  state.additions.unshift({ list, entry, action, from });
  state.additions = state.additions.slice(0, 20);
  updateStatus();
  renderSessionLog();
  return { success: true, action, from };
};

const describeEntryChange = ({
  entry,
  list,
  action,
  from,
  includeDownloadHint = true,
}) => {
  const listLabel = formatListName(list);
  const entryLabel = getEntryLabel(entry);

  if (action === "updated") {
    return `Updated ${entryLabel} in ${listLabel}.`;
  }

  if (action === "moved") {
    const fromLabel = from ? formatListName(from) : "previous list";
    return `Moved ${entryLabel} from ${fromLabel} to ${listLabel}.`;
  }

  if (includeDownloadHint) {
    return `Saved to ${listLabel}. Download the JSON when you're ready.`;
  }

  return `Saved ${entryLabel} to ${listLabel}.`;
};

const removeEntryFromCollection = (list, slug) => {
  if (!state.loaded) return { success: false };
  const target = state.collection[list];
  if (!Array.isArray(target)) return { success: false };

  const index = target.findIndex((item) => item.slug === slug);
  if (index === -1) return { success: false };

  const [removed] = target.splice(index, 1);
  if (!removed) return { success: false };

  const removedEntry = { ...removed };

  const wasEditing =
    state.editing &&
    state.editing.list === list &&
    identityMatches(removed, state.editing);

  if (wasEditing) {
    figureForm.reset();
    fields.list.value = "owned";
    state.editing = null;
    renderPreview();
  }

  state.additions.unshift({ list, entry: removedEntry, action: "deleted" });
  state.additions = state.additions.slice(0, 20);
  updateStatus();
  renderSessionLog();
  renderManager();
  return { success: true, removed: removedEntry, wasEditing };
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
  anchor.download = "collection-backup.json";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  lookupFeedback.textContent = "Downloaded a JSON backup of the Cloudflare collection.";
};

const handleManualSave = async () => {
  if (!state.loaded) {
    lookupFeedback.textContent = "Load the collection before saving.";
    return;
  }

  let statusPrefix = "";
  let syncMessage = "Saving collection to Cloudflare…";

  const formData = readForm();
  if (formData) {
    const previous = state.editing
      ? {
          list: state.editing.list,
          slug: state.editing.slug,
          mfcId:
            state.editing.mfcId !== undefined && state.editing.mfcId !== null
              ? state.editing.mfcId
              : null,
          allowIdentityChange: state.editing.allowIdentityChange === true,
        }
      : null;

    const mergeResult = mergeEntryIntoCollection(formData.list, formData.entry, previous);
    if (!mergeResult.success) {
      lookupFeedback.textContent = "Unable to update the collection. Please try again.";
      return;
    }

    state.editing = {
      list: formData.list,
      slug: formData.entry.slug,
      mfcId:
        formData.entry.mfcId !== undefined && formData.entry.mfcId !== null
          ? formData.entry.mfcId
          : null,
      allowIdentityChange: previous?.allowIdentityChange === true,
    };

    renderManager();
    renderPreview();

    statusPrefix = describeEntryChange({
      entry: formData.entry,
      list: formData.list,
      action: mergeResult.action,
      from: mergeResult.from,
      includeDownloadHint: false,
    });

    syncMessage = `${statusPrefix} Saving to Cloudflare…`;
  }

  lookupFeedback.textContent = syncMessage;

  try {
    const result = await persistCollection();
    if (result?.updatedAt) {
      const savedDate = new Date(result.updatedAt);
      const formatted = Number.isNaN(savedDate.getTime())
        ? result.updatedAt
        : savedDate.toLocaleString();
      lookupFeedback.textContent = statusPrefix
        ? `${statusPrefix} Synced at ${formatted}.`
        : `Collection synced at ${formatted}.`;
    } else {
      lookupFeedback.textContent = statusPrefix
        ? `${statusPrefix} Synced.`
        : "Collection synced.";
    }
  } catch (error) {
    lookupFeedback.textContent = statusPrefix
      ? `${statusPrefix} Saved locally but sync failed: ${error.message}`
      : `Unable to save collection: ${error.message}`;
  }
};

const handleLookup = async (event) => {
  event.preventDefault();
  const rawItemId = lookupInput.value;
  const itemId = parseMfcItemId(rawItemId);
  if (!itemId) {
    lookupFeedback.textContent = "Enter a valid MyFigureCollection item number or URL.";
    return;
  }

  lookupInput.value = itemId;

  lookupFeedback.textContent = "Fetching item details…";

  try {
    const response = await authorizedFetch(`/api/mfc?item=${encodeURIComponent(itemId)}`, {
      headers: { Accept: "application/json" },
    });

    const contentType = response.headers.get("Content-Type") || "";
    const bodyText = await response.text();

    if (!response.ok) {
      let message =
        response.headers.get("X-Error") || `Lookup failed (status ${response.status})`;

      if (!message && contentType.includes("application/json")) {
        try {
          const parsedError = JSON.parse(bodyText);
          if (parsedError && typeof parsedError.error === "string") {
            message = parsedError.error;
          }
        } catch (parseError) {
          console.warn("Unable to parse error response as JSON", parseError);
        }
      }

      if (!message && bodyText) {
        const trimmed = bodyText.trim();
        if (trimmed) {
          message =
            trimmed.length > 160
              ? `${trimmed.slice(0, 157)}…`
              : trimmed;
        }
      }

      throw new Error(message || "Lookup failed. Please try again.");
    }

    if (!contentType.includes("application/json")) {
      throw new Error(
        "The server returned an unexpected response. Check that the worker is running and you're signed in, then try again."
      );
    }

    let data;
    try {
      data = JSON.parse(bodyText);
    } catch (parseError) {
      console.warn("Unable to parse lookup response as JSON", parseError);
      throw new Error("Received malformed data from the server. Please try again.");
    }
    fields.mfcId.value = itemId;
    fields.name.value = data.name ?? fields.name.value;
    if (fields.classification && data.classification) {
      fields.classification.value = data.classification;
    }
    if (fields.productLine && data.productLine) {
      fields.productLine.value = data.productLine;
    }
    if (fields.origin && data.origin) {
      fields.origin.value = data.origin;
    }
    if (fields.character && data.character) {
      fields.character.value = data.character;
    }
    if (fields.version && data.version) {
      fields.version.value = data.version;
    }
    if (fields.companies && Array.isArray(data.companies)) {
      fields.companies.value = formatCompaniesField(data.companies);
    }
    if (fields.releases && Array.isArray(data.releases)) {
      fields.releases.value = formatReleasesField(data.releases);
    } else if (fields.releases && data.releaseDate && !fields.releases.value.trim()) {
      fields.releases.value = data.releaseDate;
    }
    if (fields.materials && Array.isArray(data.materials)) {
      fields.materials.value = data.materials.join(", ");
    }
    if (fields.dimensions && data.dimensions) {
      if (typeof data.dimensions === "string") {
        fields.dimensions.value = data.dimensions;
      } else if (Array.isArray(data.dimensions)) {
        fields.dimensions.value = data.dimensions.join("\n");
      } else if (data.dimensions.text) {
        fields.dimensions.value = data.dimensions.text;
      }
    }
    fields.image.value = data.image ?? fields.image.value;
    fields.caption.value = data.caption ?? fields.caption.value;
    fields.description.value = data.description ?? fields.description.value;

    if (Array.isArray(data.tags)) {
      const existingTags = normalizeTags(fields.tags.value);
      const merged = Array.from(new Set([...existingTags, ...data.tags]));
      fields.tags.value = merged.join(", ");
    }

    if (!fields.slug.value.trim()) {
      setSlugField(slugify({ name: data.name, mfcId: itemId }), { generated: true });
    }

    lookupFeedback.textContent = "Details imported. Review and adjust below.";
    renderPreview();
  } catch (error) {
    if (error?.message === "Unauthorized") {
      lookupFeedback.textContent = SESSION_EXPIRED_MESSAGE;
      return;
    }
    lookupFeedback.textContent =
      error.message || "Unable to fetch details. Please add the figure manually.";
  }
};

const handleFormSubmit = async (event) => {
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

  const previousEditing = state.editing;
  const wasEditing = Boolean(previousEditing);
  const previous = previousEditing
    ? {
        list: previousEditing.list,
        slug: previousEditing.slug,
        mfcId:
          previousEditing.mfcId !== undefined && previousEditing.mfcId !== null
            ? previousEditing.mfcId
            : null,
        allowIdentityChange: previousEditing.allowIdentityChange === true,
      }
    : null;

  const result = mergeEntryIntoCollection(formData.list, formData.entry, previous);
  if (!result.success) {
    lookupFeedback.textContent = "Unable to update the collection. Please try again.";
    return;
  }

  state.editing = wasEditing
    ? {
        list: formData.list,
        slug: formData.entry.slug,
        mfcId:
          formData.entry.mfcId !== undefined && formData.entry.mfcId !== null
            ? formData.entry.mfcId
            : null,
        allowIdentityChange: previousEditing?.allowIdentityChange === true,
      }
    : null;

  renderManager();

  const message = describeEntryChange({
    entry: formData.entry,
    list: formData.list,
    action: result.action,
    from: result.from,
  });

  lookupFeedback.textContent = `${message} Saving to Cloudflare…`;
  if (!wasEditing) {
    resetForm({ keepLookup: true });
  } else {
    renderPreview();
  }
  try {
    const result = await persistCollection();
    if (result?.updatedAt) {
      const savedDate = new Date(result.updatedAt);
      const formatted = Number.isNaN(savedDate.getTime())
        ? result.updatedAt
        : savedDate.toLocaleString();
      lookupFeedback.textContent = `${message} Synced at ${formatted}.`;
    } else {
      lookupFeedback.textContent = `${message} Synced.`;
    }
  } catch (error) {
    lookupFeedback.textContent = `${message} Saved locally but sync failed: ${error.message}`;
  }
};

const startEditingEntry = (list, slug) => {
  if (!list || !slug) return;
  const entries = state.collection[list];
  if (!Array.isArray(entries)) return;
  const entry = entries.find((item) => item.slug === slug);
  if (!entry) return;

  figureForm.reset();
  resetSlugState();
  fields.list.value = list;
  applyEntryToForm({ ...entry, list });
  state.editing = {
    list,
    slug: entry.slug,
    mfcId: entry.mfcId ?? null,
    allowIdentityChange: true,
  };

  lookupInput.value = entry.mfcId ? String(entry.mfcId) : "";

  lookupFeedback.textContent = `Editing “${getEntryLabel(entry)}” from ${formatListName(list)}.`;
  renderManager();
  if (fields.name && typeof fields.name.focus === "function") {
    fields.name.focus();
  }
};

const handleDeleteEntry = async (list, slug) => {
  if (!list || !slug) return;
  if (!state.loaded) {
    lookupFeedback.textContent = "Load the collection before deleting.";
    return;
  }

  const entries = state.collection[list];
  const existing = Array.isArray(entries) ? entries.find((item) => item.slug === slug) : null;
  const listLabel = formatListName(list);
  const label = existing
    ? getEntryLabel(existing)
    : slug
    ? `slug ${slug}`
    : "this figure";

  const shouldDelete =
    typeof window !== "undefined" && typeof window.confirm === "function"
      ? window.confirm(`Remove “${label}” from ${listLabel}? This cannot be undone.`)
      : true;

  if (!shouldDelete) return;

  const removal = removeEntryFromCollection(list, slug);
  if (!removal.success) {
    lookupFeedback.textContent = "Unable to delete the selected figure. Please try again.";
    return;
  }

  const removedLabel = getEntryLabel(removal.removed);
  const message = `Deleted ${removedLabel} from ${listLabel}.`;
  lookupFeedback.textContent = `${message} Saving to Cloudflare…`;

  try {
    const result = await persistCollection();
    if (result?.updatedAt) {
      const savedDate = new Date(result.updatedAt);
      const formatted = Number.isNaN(savedDate.getTime())
        ? result.updatedAt
        : savedDate.toLocaleString();
      lookupFeedback.textContent = `${message} Synced at ${formatted}.`;
    } else {
      lookupFeedback.textContent = `${message} Synced.`;
    }
  } catch (error) {
    lookupFeedback.textContent = `${message} Removed locally but sync failed: ${error.message}`;
  }
};

if (fields.name) {
  fields.name.addEventListener("input", autoUpdateSlugFromName);
  fields.name.addEventListener("change", autoUpdateSlugFromName);
}

if (fields.mfcId) {
  fields.mfcId.addEventListener("input", autoUpdateSlugFromName);
  fields.mfcId.addEventListener("change", autoUpdateSlugFromName);
}

if (fields.slug) {
  fields.slug.addEventListener("input", handleSlugInputChange);
  fields.slug.addEventListener("change", handleSlugInputChange);
}

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
  lookupFeedback.textContent = "Form reset. Start a new entry above.";
});
copyEntryButton.addEventListener("click", handleCopyEntry);
downloadButton.addEventListener("click", handleDownload);
if (saveChangesButton) {
  saveChangesButton.addEventListener("click", handleManualSave);
}
generateSlugButton.addEventListener("click", () => {
  setSlugField(
    slugify({
      name: fields.name.value.trim(),
      mfcId: fields.mfcId.value.trim(),
    }),
    { generated: true },
  );
  renderPreview();
});

if (signOutButton) {
  signOutButton.addEventListener("click", async () => {
    try {
      await fetch("/api/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch (error) {
      console.warn("Unable to sign out cleanly", error);
    } finally {
      redirectToLogin();
    }
  });
}

if (manager) {
  manager.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "edit-entry") {
      const list = button.dataset.list;
      const slug = button.dataset.slug;
      if (list && slug) {
        startEditingEntry(list, slug);
      }
    } else if (action === "clear-editing") {
      state.editing = null;
      renderManager();
      lookupFeedback.textContent = "Editing cleared. Select a figure to edit or fill the form to add a new one.";
    } else if (action === "delete-entry") {
      const list = button.dataset.list;
      const slug = button.dataset.slug;
      if (list && slug) {
        handleDeleteEntry(list, slug);
      }
    }
  });
}

updateSaveButton();

fetchCollection().then(() => {
  renderPreview();
  renderManager();
});
renderSessionLog();
