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
const signInOverlay = document.getElementById("signin-overlay");
const signInForm = document.getElementById("signin-form");
const signInUsername = document.getElementById("signin-username");
const signInPassword = document.getElementById("signin-password");
const signInRemember = document.getElementById("signin-remember");
const signInCancel = document.getElementById("signin-cancel");
const signInMessage = document.getElementById("signin-message");
const signInButton = document.getElementById("sign-in-button");
const signOutButton = document.getElementById("sign-out-button");

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
  editing: null,
};

const AUTH_STORAGE_KEY = "figure-admin-auth";
const SIGN_IN_PROMPT = "Sign in to fetch details from MyFigureCollection.";
const UNAUTHORIZED_ERROR_CODE = "unauthorized";
const storageTargets = [
  { name: "sessionStorage", persistent: false },
  { name: "localStorage", persistent: true },
];

const getStorage = (name) => {
  if (typeof window === "undefined") return null;
  try {
    const storage = window[name];
    if (!storage || typeof storage.getItem !== "function") {
      return null;
    }
    return storage;
  } catch {
    return null;
  }
};

const readStoredAuth = () => {
  for (const target of storageTargets) {
    const storage = getStorage(target.name);
    if (!storage) continue;
    try {
      const raw = storage.getItem(AUTH_STORAGE_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.token === "string" && parsed.token.startsWith("Basic ")) {
        return { token: parsed.token, persistent: target.persistent };
      }
    } catch {
      try {
        storage.removeItem(AUTH_STORAGE_KEY);
      } catch {
        // ignore cleanup failures
      }
    }
  }
  return null;
};

let authToken = null;

const setSignInMessage = (message = "") => {
  if (!signInMessage) return;
  if (message) {
    signInMessage.textContent = message;
    signInMessage.hidden = false;
  } else {
    signInMessage.textContent = "";
    signInMessage.hidden = true;
  }
};

function updateAuthControls() {
  if (signInButton) {
    signInButton.hidden = Boolean(authToken);
  }
  if (signOutButton) {
    signOutButton.hidden = !Boolean(authToken);
  }
}

function showSignIn(message) {
  if (!signInOverlay) return;
  signInOverlay.hidden = false;
  setSignInMessage(message || SIGN_IN_PROMPT);
  const focusTarget = signInUsername || signInOverlay.querySelector("input");
  if (focusTarget && typeof focusTarget.focus === "function") {
    setTimeout(() => focusTarget.focus(), 0);
  }
}

function hideSignIn() {
  if (!signInOverlay) return;
  signInOverlay.hidden = true;
  setSignInMessage("");
  if (signInForm && typeof signInForm.reset === "function") {
    signInForm.reset();
  }
}

const saveAuthToken = (token, persistent) => {
  authToken = token;
  for (const target of storageTargets) {
    const storage = getStorage(target.name);
    if (!storage) continue;
    try {
      if (target.persistent === persistent) {
        storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token }));
      } else {
        storage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch (error) {
      if (target.persistent === persistent) {
        console.warn("Unable to persist admin credentials", error);
      }
    }
  }
  updateAuthControls();
};

const clearAuthToken = () => {
  authToken = null;
  for (const target of storageTargets) {
    const storage = getStorage(target.name);
    if (!storage) continue;
    try {
      storage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  updateAuthControls();
};

const encodeBasicCredentials = (username, password) => {
  const value = `${username}:${password}`;
  try {
    return btoa(value);
  } catch {
    if (typeof TextEncoder === "function") {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(value);
      let binary = "";
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      return btoa(binary);
    }
    throw new Error("Unable to encode credentials.");
  }
};

const createUnauthorizedError = (message) => {
  const error = new Error(message);
  error.code = UNAUTHORIZED_ERROR_CODE;
  return error;
};

const authorizedFetch = async (input, init = {}) => {
  if (!authToken) {
    showSignIn();
    throw createUnauthorizedError(SIGN_IN_PROMPT);
  }

  const options = {
    ...init,
    headers: new Headers(init && init.headers ? init.headers : undefined),
  };

  options.headers.set("Authorization", authToken);

  const response = await fetch(input, options);

  if (response.status === 401) {
    clearAuthToken();
    showSignIn("Your credentials were rejected. Please sign in again.");
    throw createUnauthorizedError(SIGN_IN_PROMPT);
  }

  return response;
};

const storedAuth = readStoredAuth();
if (storedAuth) {
  authToken = storedAuth.token;
}
updateAuthControls();

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
      const actionLabel =
        item.action === "updated"
          ? "Updated"
          : item.action === "moved"
          ? "Moved"
          : "Added";
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
      if (entry.series) {
        metaParts.push(escapeHtml(entry.series));
      }
      const meta = metaParts.length
        ? `<div class="manager__meta">${metaParts.join(" · ")}</div>`
        : "";
      return `
        <li>
          <button
            type="button"
            class="manager__item${isActive ? " manager__item--active" : ""}"
            data-action="edit-entry"
            data-list="${escapeHtml(listKey)}"
            data-slug="${entry.slug ? escapeHtml(entry.slug) : ""}"
          >
            <span class="manager__name">${escapeHtml(getEntryLabel(entry))}</span>
            ${meta}
          </button>
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
  fields.slug.value = generated;
  return generated;
};

const resetForm = ({ keepLookup = false } = {}) => {
  figureForm.reset();
  if (!keepLookup) {
    lookupInput.value = "";
    lookupFeedback.textContent = "";
  }
  fields.list.value = "owned";
  state.editing = null;
  renderPreview();
  renderManager();
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
    renderManager();
  } catch (error) {
    state.loaded = false;
    collectionStatus.textContent = error.message;
    if (manager) {
      manager.innerHTML = `<p class="manager__placeholder">${escapeHtml(error.message)}</p>`;
    }
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

  if (index === -1 && previous && previous.list === list) {
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
    if (error?.code === UNAUTHORIZED_ERROR_CODE) {
      lookupFeedback.textContent = error.message || SIGN_IN_PROMPT;
      return;
    }
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

  const result = mergeEntryIntoCollection(formData.list, formData.entry, state.editing);
  if (!result.success) {
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
  };

  renderManager();

  let message = `Saved to ${formatListName(formData.list)}. Download the JSON when you're ready.`;
  if (result.action === "updated") {
    message = `Updated ${formData.entry.name} in ${formatListName(formData.list)}.`;
  } else if (result.action === "moved") {
    const fromLabel = result.from ? formatListName(result.from) : "previous list";
    message = `Moved ${formData.entry.name} from ${fromLabel} to ${formatListName(
      formData.list
    )}.`;
  }

  lookupFeedback.textContent = message;
  renderPreview();
};

const startEditingEntry = (list, slug) => {
  if (!list || !slug) return;
  const entries = state.collection[list];
  if (!Array.isArray(entries)) return;
  const entry = entries.find((item) => item.slug === slug);
  if (!entry) return;

  figureForm.reset();
  fields.list.value = list;
  applyEntryToForm({ ...entry, list });
  state.editing = {
    list,
    slug: entry.slug,
    mfcId: entry.mfcId ?? null,
  };

  lookupInput.value = entry.mfcId ? String(entry.mfcId) : "";

  lookupFeedback.textContent = `Editing “${getEntryLabel(entry)}” from ${formatListName(list)}.`;
  renderManager();
  if (fields.name && typeof fields.name.focus === "function") {
    fields.name.focus();
  }
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
  lookupFeedback.textContent = "Form reset. Start a new entry above.";
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

if (signInButton) {
  signInButton.addEventListener("click", () => {
    showSignIn();
  });
}

if (signOutButton) {
  signOutButton.addEventListener("click", () => {
    clearAuthToken();
    showSignIn("Signed out. Sign in again to use the MyFigureCollection lookup.");
    if (lookupFeedback) {
      lookupFeedback.textContent = SIGN_IN_PROMPT;
    }
  });
}

if (signInCancel) {
  signInCancel.addEventListener("click", () => {
    hideSignIn();
    if (lookupFeedback) {
      lookupFeedback.textContent =
        "You can still manage your collection without signing in.";
    }
  });
}

if (signInForm) {
  signInForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = signInUsername?.value?.trim() || "";
    const password = signInPassword?.value || "";
    if (!username || !password) {
      setSignInMessage("Enter both your username and password.");
      return;
    }

    let encoded;
    try {
      encoded = encodeBasicCredentials(username, password);
    } catch (error) {
      console.warn("Unable to encode credentials", error);
      setSignInMessage("Unable to encode credentials. Please try again.");
      return;
    }

    saveAuthToken(`Basic ${encoded}`, Boolean(signInRemember?.checked));
    hideSignIn();
    if (lookupFeedback) {
      lookupFeedback.textContent =
        "Signed in. You can now use the MyFigureCollection lookup.";
    }
  });
}

if (signInOverlay) {
  signInOverlay.addEventListener("click", (event) => {
    if (event.target === signInOverlay) {
      hideSignIn();
    }
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && signInOverlay && !signInOverlay.hidden) {
    hideSignIn();
  }
});

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
    }
  });
}

fetchCollection().then(() => {
  renderPreview();
  renderManager();
});
renderSessionLog();
if (!authToken) {
  showSignIn();
}
