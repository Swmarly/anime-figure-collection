import { createDefaultCollection } from "./data/default-collection.js";

const memoryStoreSymbol = Symbol.for("figure.collection.memory");

const getMemoryStore = () => {
  if (!globalThis[memoryStoreSymbol]) {
    globalThis[memoryStoreSymbol] = { record: null };
  }
  return globalThis[memoryStoreSymbol];
};

const envMemorySymbol = Symbol.for("figure.collection.envMemory");

const getEnvMemoryStore = (env) => {
  if (!env || typeof env !== "object") {
    return null;
  }
  if (!env[envMemorySymbol]) {
    env[envMemorySymbol] = { record: null };
  }
  return env[envMemorySymbol];
};

const BASIC_REALM = "Figure Admin";
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "figureadmin";
const SESSION_COOKIE = "figure_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const PUBLIC_ADMIN_ASSETS = new Set([
  "/admin/login.html",
  "/admin/login.css",
  "/admin/login.js",
]);

const COLLECTION_KV_KEY = "collection";

const keepEmptyKeys = new Set(["tags", "notes", "alt"]);

const sanitizeTags = (value) => {
  if (value === null) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((tag) => String(tag).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return [];
};

const compactEntry = (entry) => {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  return Object.entries(entry).reduce((acc, [key, value]) => {
    if (value === undefined) {
      return acc;
    }

    if (key === "tags") {
      acc.tags = sanitizeTags(value);
      return acc;
    }

    if (key === "mfcId") {
      if (value === null || value === undefined || value === "") {
        acc.mfcId = null;
        return acc;
      }
      const numeric = Number(value);
      acc.mfcId = Number.isFinite(numeric) ? numeric : null;
      return acc;
    }

    if (value === null) {
      if (keepEmptyKeys.has(key)) {
        acc[key] = null;
      }
      return acc;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        if (keepEmptyKeys.has(key)) {
          acc[key] = "";
        }
        return acc;
      }
      acc[key] = trimmed;
      return acc;
    }

    if (Array.isArray(value)) {
      const items = value
        .map((item) => (typeof item === "string" ? item.trim() : item))
        .filter((item) => item !== undefined && item !== null && item !== "");
      if (items.length || keepEmptyKeys.has(key)) {
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

const normalizeCollection = (input) => {
  const ownedSource = Array.isArray(input?.owned) ? input.owned : [];
  const wishlistSource = Array.isArray(input?.wishlist) ? input.wishlist : [];

  const owned = ownedSource
    .map((item) => compactEntry(item))
    .filter((item) => item && Object.keys(item).length);
  const wishlist = wishlistSource
    .map((item) => compactEntry(item))
    .filter((item) => item && Object.keys(item).length);

  return { owned, wishlist };
};

const hasKvInterface = (binding) =>
  binding && typeof binding.get === "function" && typeof binding.put === "function";

const resolveCollectionBinding = (env) => {
  if (!env || typeof env !== "object") return null;
  const possibleKeys = [
    "COLLECTION",
    "FIGURE_COLLECTION",
    "FIGURE_COLLECTION_KV",
    "COLLECTION_KV",
  ];

  for (const key of possibleKeys) {
    if (hasKvInterface(env[key])) {
      return env[key];
    }
  }

  const normalizedCandidates = new Map(
    possibleKeys.map((key) => [key.toLowerCase(), key]),
  );

  for (const [rawKey, value] of Object.entries(env)) {
    const normalizedKey = rawKey?.toString().toLowerCase();
    if (!normalizedKey) continue;
    if (!normalizedCandidates.has(normalizedKey)) continue;
    if (!hasKvInterface(value)) continue;

    console.warn(
      `Resolved collection KV binding using case-insensitive match for "${rawKey}". ` +
        "Update the binding name to match one of the expected values to silence this warning.",
    );
    return value;
  }

  return null;
};

const loadCollectionFromStorage = async (env) => {
  const binding = resolveCollectionBinding(env);
  const envMemory = getEnvMemoryStore(env);
  const memory = getMemoryStore();

  if (binding) {
    try {
      const stored = await binding.get(COLLECTION_KV_KEY, { type: "json" });
      if (stored && typeof stored === "object") {
        const record = {
          owned: Array.isArray(stored.owned) ? stored.owned : [],
          wishlist: Array.isArray(stored.wishlist) ? stored.wishlist : [],
          updatedAt: stored.updatedAt ?? null,
        };
        memory.record = record;
        if (envMemory) {
          envMemory.record = record;
        }
        return record;
      }

      if (stored == null) {
        const fallback = createDefaultCollection();
        const seeded = { ...fallback, updatedAt: new Date().toISOString() };
        await binding.put(COLLECTION_KV_KEY, JSON.stringify(seeded));
        memory.record = seeded;
        if (envMemory) {
          envMemory.record = seeded;
        }
        return seeded;
      }

      console.warn(
        "Collection KV returned an unexpected value; falling back to default without persisting.",
        stored,
      );
    } catch (error) {
      console.warn("Unable to read collection from KV", error);
    }
  }

  if (envMemory?.record) {
    memory.record = envMemory.record;
    return envMemory.record;
  }

  if (!envMemory && memory.record) {
    return memory.record;
  }

  const fallback = createDefaultCollection();
  const record = { ...fallback, updatedAt: null };
  memory.record = record;
  if (envMemory) {
    envMemory.record = record;
  }
  return record;
};

const storeCollection = async (env, payload) => {
  const { owned, wishlist } = normalizeCollection(payload);
  const timestamp = new Date().toISOString();
  const record = { owned, wishlist, updatedAt: timestamp };

  const binding = resolveCollectionBinding(env);
  const envMemory = getEnvMemoryStore(env);
  if (binding) {
    try {
      await binding.put(COLLECTION_KV_KEY, JSON.stringify(record));
    } catch (error) {
      console.warn("Unable to persist collection to KV", error);
    }
  } else {
    console.warn(
      "Persisted collection KV binding is not configured. Data will only be cached in-memory and may be lost on deployment."
    );
  }

  const memory = getMemoryStore();
  memory.record = record;
  if (envMemory) {
    envMemory.record = record;
  }
  return record;
};

const cloneRequestForUrl = (request, targetUrl) => {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    headers.append(key, value);
  });

  return new Request(typeof targetUrl === "string" ? targetUrl : targetUrl.toString(), {
    method: request.method,
    headers,
  });
};

const normalizePathname = (pathname) => {
  if (!pathname) return "/";
  const normalized = pathname.replace(/\/+$/g, "");
  return normalized === "" ? "/" : normalized;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const decodeBasicAuth = (header) => {
  if (!header) return null;
  const [scheme, encoded] = header.split(" ", 2);
  if (scheme !== "Basic" || !encoded) return null;
  try {
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return null;
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
};

const encodeBytesToBase64 = (bytes) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const encodeStringToBase64 = (value) => {
  const bytes = textEncoder.encode(value);
  return encodeBytesToBase64(bytes);
};

const decodeBase64ToBytes = (value) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const decodeBase64ToString = (value) => {
  const bytes = decodeBase64ToBytes(value);
  return textDecoder.decode(bytes);
};

const timingSafeEqual = (a, b) => {
  const aBytes = textEncoder.encode(a);
  const bBytes = textEncoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let result = 0;
  for (let i = 0; i < aBytes.length; i += 1) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
};

const signPayload = async (payload, secret) => {
  const keyData = textEncoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));
  return encodeBytesToBase64(new Uint8Array(signature));
};

const sanitizeUsername = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const sanitizePassword = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\r\n]+$/g, "");
  return normalized.length > 0 ? normalized : null;
};

const normalizeToNfkc = (value) =>
  typeof value === "string" ? value.normalize("NFKC") : null;

const normalizeUsernameForComparison = (value) => {
  const sanitized = sanitizeUsername(value);
  if (!sanitized) return null;
  const normalized = normalizeToNfkc(sanitized);
  return normalized ? normalized.toLowerCase() : null;
};

const normalizePasswordForComparison = (value) => {
  if (typeof value !== "string") return null;
  const sanitized = sanitizePassword(value);
  const effectiveValue = sanitized !== null ? sanitized : value;
  if (!effectiveValue) return null;
  return normalizeToNfkc(effectiveValue);
};

const getAdminCredentials = (env) => {
  const username = sanitizeUsername(env.ADMIN_USERNAME) || DEFAULT_USERNAME;
  const password = sanitizePassword(env.ADMIN_PASSWORD) || DEFAULT_PASSWORD;
  const compareUsername = normalizeUsernameForComparison(username);
  const comparePassword = normalizePasswordForComparison(password);
  return { username, password, compareUsername, comparePassword };
};

const areCredentialsValid = (inputUsername, inputPassword, credentials) => {
  const expectedUsername = credentials?.compareUsername;
  const expectedPassword = credentials?.comparePassword;
  if (!expectedUsername || !expectedPassword) {
    return false;
  }

  const normalizedUsername = normalizeUsernameForComparison(inputUsername);
  const normalizedPassword = normalizePasswordForComparison(inputPassword);
  if (!normalizedUsername || !normalizedPassword) {
    return false;
  }

  return (
    timingSafeEqual(normalizedUsername, expectedUsername) &&
    timingSafeEqual(normalizedPassword, expectedPassword)
  );
};

const getSessionSecret = (env) =>
  sanitizePassword(env.SESSION_SECRET) || sanitizePassword(env.ADMIN_PASSWORD) || DEFAULT_PASSWORD;

const createSessionToken = async (username, env) => {
  const secret = getSessionSecret(env);
  if (!secret) {
    throw new Error("Session secret is not configured.");
  }
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${username}:${expires}`;
  const signature = await signPayload(payload, secret);
  const token = `${encodeStringToBase64(username)}.${expires}.${signature}`;
  return { token, expires };
};

const verifySessionToken = async (token, env) => {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedUsername, expiresRaw, signature] = parts;
  if (!encodedUsername || !expiresRaw || !signature) return null;

  let username;
  try {
    username = decodeBase64ToString(encodedUsername);
  } catch (error) {
    console.warn("Unable to decode session username", error);
    return null;
  }

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires)) return null;
  if (expires <= Math.floor(Date.now() / 1000)) return null;

  const secret = getSessionSecret(env);
  if (!secret) return null;

  const payload = `${username}:${expires}`;
  const expectedSignature = await signPayload(payload, secret);
  if (!timingSafeEqual(signature, expectedSignature)) {
    return null;
  }

  return { username, expires };
};

const parseCookies = (header) => {
  const cookies = {};
  if (!header) return cookies;
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    if (!part) continue;
    const [name, ...rest] = part.split("=");
    if (!name) continue;
    cookies[name] = rest.join("=");
  }
  return cookies;
};

const getSessionFromCookies = async (request, env) => {
  const header = request.headers.get("Cookie");
  if (!header) {
    return { session: null, hadSessionCookie: false };
  }

  const cookies = parseCookies(header);
  if (!cookies[SESSION_COOKIE]) {
    return { session: null, hadSessionCookie: false };
  }

  try {
    const decoded = decodeURIComponent(cookies[SESSION_COOKIE]);
    const session = await verifySessionToken(decoded, env);
    if (session) {
      return { session, hadSessionCookie: true };
    }
  } catch (error) {
    console.warn("Unable to verify session token", error);
  }

  return { session: null, hadSessionCookie: true };
};

const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

const isLocalHostname = (hostname) => {
  if (!hostname) return false;
  const normalized = hostname.toLowerCase();
  if (LOCAL_HOSTNAMES.has(normalized)) {
    return true;
  }
  return normalized.endsWith(".localhost");
};

const shouldUseSecureCookie = (request) => {
  const url = new URL(request.url);
  const hostname = url.hostname || "";

  if (url.protocol === "https:") {
    return true;
  }

  if (url.protocol === "http:" && isLocalHostname(hostname)) {
    return false;
  }

  const forwardedProto = request.headers.get("X-Forwarded-Proto");
  if (forwardedProto && forwardedProto.split(",")[0]?.trim().toLowerCase() === "https") {
    return true;
  }

  const cfVisitorHeader = request.headers.get("CF-Visitor");
  if (cfVisitorHeader) {
    try {
      const cfVisitor = JSON.parse(cfVisitorHeader);
      if (cfVisitor && typeof cfVisitor.scheme === "string") {
        return cfVisitor.scheme.toLowerCase() === "https";
      }
    } catch (error) {
      console.warn("Unable to parse CF-Visitor header", error);
    }
  }

  return false;
};

const createSessionCookie = (token, { secure = true } = {}) => {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];

  if (secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
};

const expireSessionCookie = ({ secure = true } = {}) => {
  const attributes = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
  ];

  if (secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
};

const appendSessionInvalidationCookies = (headers, request) => {
  const secure = shouldUseSecureCookie(request);
  headers.append("Set-Cookie", expireSessionCookie({ secure }));
  if (!secure) {
    headers.append("Set-Cookie", expireSessionCookie({ secure: true }));
  }
};

const ensureIndexPathname = (pathname) => {
  if (!pathname) return "/index.html";
  if (pathname.endsWith("/")) {
    return `${pathname}index.html`;
  }

  const lastSegment = pathname.split("/").pop() || "";
  if (!lastSegment.includes(".")) {
    return `${pathname}/index.html`;
  }

  return pathname;
};

const buildLoginRedirectResponse = (request, { clearSession = false } = {}) => {
  const requestUrl = new URL(request.url);
  const loginUrl = new URL("/admin/login.html", requestUrl.origin);
  const redirectPathname = ensureIndexPathname(requestUrl.pathname);
  const redirectTarget = `${redirectPathname}${requestUrl.search}`;
  loginUrl.searchParams.set("redirect", redirectTarget);
  const headers = new Headers({
    Location: loginUrl.toString(),
    "Cache-Control": "no-store",
  });

  if (clearSession) {
    appendSessionInvalidationCookies(headers, request);
  }

  return new Response(null, {
    status: 303,
    headers,
  });
};

const buildUnauthorizedResponse = (request, { clearSession = false } = {}) => {
  const headers = new Headers({ "Cache-Control": "no-store" });

  if (clearSession) {
    appendSessionInvalidationCookies(headers, request);
  }

  return new Response("Unauthorized", {
    status: 401,
    headers,
  });
};

const isHtmlRequest = (request) => {
  const destination = request.headers.get("Sec-Fetch-Dest");
  if (destination && destination !== "document") {
    return false;
  }

  const mode = request.headers.get("Sec-Fetch-Mode");
  if (mode && mode !== "navigate" && mode !== "same-origin") {
    return false;
  }

  const accept = request.headers.get("Accept") || "";
  return accept.includes("text/html");
};

const ensureAuthorized = async (request, env, { redirectToLogin = false } = {}) => {
  const credentials = getAdminCredentials(env);
  if (!credentials.password || !credentials.comparePassword) {
    return new Response("Admin password is not configured.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const headerCredentials = decodeBasicAuth(request.headers.get("Authorization"));
  const hasBasicCredentials = Boolean(headerCredentials);

  if (
    headerCredentials &&
    areCredentialsValid(
      headerCredentials.username,
      headerCredentials.password,
      credentials
    )
  ) {
    return null;
  }

  const { session, hadSessionCookie } = await getSessionFromCookies(request, env);
  if (session) {
    return null;
  }

  if (hasBasicCredentials) {
    return buildUnauthorizedResponse(request, { clearSession: hadSessionCookie });
  }

  if (redirectToLogin) {
    return buildLoginRedirectResponse(request, { clearSession: hadSessionCookie });
  }

  return buildUnauthorizedResponse(request, { clearSession: hadSessionCookie });
};

const decodeHtml = (value) =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const extractMeta = (html, attribute, name) => {
  const regex = new RegExp(
    `<meta[^>]+${attribute}="${name}"[^>]+content="([^"]*)"[^>]*>`,
    "i",
  );
  const match = regex.exec(html);
  return match ? decodeHtml(match[1]) : null;
};

const stripRoleSuffix = (value) => {
  if (!value) return value;
  const patterns = [
    /\s+(?:as|[-–])\s+(?:manufacturer|company|producer|brand)\b.*$/i,
    /\s+(?:as|[-–])\s+(?:product\s*line|line)\b.*$/i,
    /\s+(?:as|[-–])\s+(?:scale|classification|ratio)\b.*$/i,
    /\s+(?:as|[-–])\s+(?:release\s*date|release)\b.*$/i,
    /\s+(?:as|[-–])\s+(?:series|origin|source|franchise)\b.*$/i,
    /\s+(?:as|[-–])\s+(?:character)\b.*$/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(value)) {
      return value.replace(pattern, "").trim();
    }
  }

  return value;
};

const cleanFieldValue = (value) => {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  if (normalized === "-" || normalized === "n/a" || normalized === "?" || normalized === "unknown") {
    return null;
  }
  return stripRoleSuffix(trimmed);
};

const normalizeLabel = (value) =>
  value
    ? value
        .toLowerCase()
        .replace(/&nbsp;/g, " ")
        .replace(/[:：]+$/g, "")
        .replace(/[^a-z0-9/ ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";

const fieldLabelMatches = (rawHeading, labels) => {
  const heading = cleanFieldValue(decodeHtml(rawHeading));
  if (!heading) return false;
  const headingNormalized = normalizeLabel(heading);
  const headingParts = headingNormalized.split("/").map((part) => part.trim()).filter(Boolean);
  return labels.some(
    (label) =>
      headingNormalized === label ||
      headingNormalized === `${label} date` ||
      headingNormalized.startsWith(`${label} `) ||
      headingParts.some((part) => part === label || part === `${label} date`),
  );
};


const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const extractTextFieldValues = (html, labels) => {
  const text = decodeHtml(html);
  if (!text) return [];

  const knownLabels = [
    "origin",
    "source",
    "series",
    "origin of character",
    "character",
    "manufacturer",
    "company",
    "producer",
    "scale",
    "classification",
    "ratio",
    "size",
    "release",
    "released",
    "release date",
    "original release",
    "re-release",
  ];
  const boundary = knownLabels.map(escapeRegex).join("|");
  const values = [];

  for (const label of labels) {
    const pattern = new RegExp(
      `(?:^|\\s)${escapeRegex(label)}(?:\\s*/\\s*(?:${boundary}))*\\s*[:：]\\s*([\\s\\S]*?)(?=\\s+(?:${boundary})(?:\\s*/\\s*(?:${boundary}))*\\s*[:：]|$)`,
      "gi",
    );
    let match;
    while ((match = pattern.exec(text))) {
      const value = cleanFieldValue(match[1]);
      if (value) values.push(value);
    }
  }

  return values;
};

const extractFieldValues = (html, ...labels) => {
  if (!html) return [];
  const normalizedLabels = labels
    .filter(Boolean)
    .map((label) => normalizeLabel(label))
    .filter(Boolean);

  if (!normalizedLabels.length) return [];

  const extractValue = (rawValue) => cleanFieldValue(decodeHtml(rawValue));
  const values = [];
  const addValue = (rawHeading, rawValue) => {
    if (!fieldLabelMatches(rawHeading, normalizedLabels)) return;
    const value = extractValue(rawValue);
    if (value) values.push(value);
  };

  const patterns = [
    /<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi,
    /<tr[^>]*>\s*<td[^>]*class=["'][^"']*(?:label|field|key)[^"']*["'][^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi,
    /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi,
    /<(?:div|span|li)[^>]*class=["'][^"']*(?:label|header|title|field-name|field-label|item-label)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|li)>\s*<(?:div|span|li)[^>]*class=["'][^"']*(?:value|content|data|field-value|item-value)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|li)>/gi,
    /<(?:div|span|li)[^>]*class=["'][^"']*(?:label|field-name|field-label|item-label)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|li)>\s*<(?:a|span|div)[^>]*>([\s\S]*?)<\/(?:a|span|div)>/gi,
    /<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>\s*<(?:a|span|div|time)[^>]*>([\s\S]*?)<\/(?:a|span|div|time)>/gi,
    /<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>\s*([^<]{1,240})/gi,
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(html))) {
      addValue(match[1], match[2]);
    }
  }

  values.push(...extractTextFieldValues(html, normalizedLabels));

  return Array.from(new Set(values));
};

const extractField = (html, ...labels) => extractFieldValues(html, ...labels)[0] ?? null;

const normalizeScaleValue = (value) => {
  const cleaned = cleanFieldValue(value);
  if (!cleaned) return null;

  const scaleMatch = cleaned.replace(/\s+/g, "").match(/\b1\/(?:\d+(?:\.\d+)?)\b/);
  return scaleMatch ? scaleMatch[0] : cleaned;
};

const extractMfcScaleValues = (html) => {
  if (!html) return [];
  const values = [];
  const anchorRegex = /<a\b(?=[^>]*(?:class=["'][^"']*item-scale[^"']*["']|title=["']Scale["']))[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(html))) {
    const value = normalizeScaleValue(decodeHtml(match[1]));
    if (value) values.push(value);
  }

  const scaleParamRegex = /[?&amp;]scale=(\d+(?:\.\d+)?)/gi;
  while ((match = scaleParamRegex.exec(html))) {
    values.push(`1/${match[1]}`);
  }

  return Array.from(new Set(values));
};

const extractMfcCalendarReleaseValues = (html) => {
  if (!html) return [];
  const values = [];
  const anchorRegex = /<a\b([^>]*(?:class=["'][^"']*\btime\b[^"']*["'][^>]*|tab=calendar[^>]*))>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(html))) {
    const tag = decodeJsonHtmlEntities(match[1]);
    const yearMatch = /[?&]year=(\d{4})\b/i.exec(tag);
    const monthMatch = /[?&]month=(\d{1,2})\b/i.exec(tag);
    if (yearMatch) {
      const candidate = normalizeDateCandidate(yearMatch[1], monthMatch?.[1] ?? null);
      if (candidate) values.push(candidate);
      continue;
    }

    const text = decodeHtml(match[2]);
    values.push(...extractReleaseDateCandidates(text));
  }

  return Array.from(new Set(values));
};


const decodeJsonHtmlEntities = (value) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\u0026/g, "&");

const parseJsonLd = (html) => {
  const results = [];
  const scriptRegex =
    /<script[^>]+type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html))) {
    const raw = match[1] ? decodeJsonHtmlEntities(match[1].trim()) : "";
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => results.push(item));
      } else {
        results.push(parsed);
      }
    } catch (error) {
      console.warn("Unable to parse JSON-LD block", error);
    }
  }
  return results;
};

const pickFirstString = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const picked = pickFirstString(item);
      if (picked) return picked;
    }
    return null;
  }
  if (typeof value === "object") {
    if (typeof value.name === "string") {
      const cleaned = stripRoleSuffix(value.name.trim());
      return cleaned || null;
    }
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const cleaned = stripRoleSuffix(trimmed);
    return cleaned || null;
  }
  return null;
};

const flattenToStrings = (value) => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenToStrings(item));
  }
  if (typeof value === "object") {
    if (typeof value.name === "string") {
      const cleaned = stripRoleSuffix(value.name.trim());
      return cleaned ? [cleaned] : [];
    }
    return [];
  }
  if (typeof value === "string") {
    const cleaned = stripRoleSuffix(value.trim());
    return cleaned ? [cleaned] : [];
  }
  return [];
};

const normalizeMfcImageUrl = (value) => {
  if (!value || typeof value !== "string") return null;
  const decoded = decodeJsonHtmlEntities(value).trim();
  if (!decoded || decoded.startsWith("data:")) return null;
  return decoded.startsWith("//") ? `https:${decoded}` : decoded;
};

const parseMfcUploadImage = (value) => {
  const normalized = normalizeMfcImageUrl(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (!url.hostname.toLowerCase().endsWith("myfigurecollection.net")) {
      return null;
    }

    const itemMatch = url.pathname.match(/\/upload\/items\/(\d+)\/([^/]+)$/i);
    if (itemMatch) {
      return {
        size: Number(itemMatch[1]),
        imageKey: `item:${itemMatch[2]}`,
      };
    }

    const pictureMatch = url.pathname.match(/\/upload\/pictures\/(.+)$/i);
    if (pictureMatch) {
      return {
        size: null,
        imageKey: `picture:${pictureMatch[1].replace(/\/thumbnails\//i, "/")}`,
      };
    }

    return null;
  } catch {
    return null;
  }
};

const buildFullSizeMfcImageUrl = (value) => {
  const normalized = normalizeMfcImageUrl(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    if (!host.endsWith("myfigurecollection.net")) {
      return normalized;
    }

    url.protocol = "https:";
    url.pathname = url.pathname
      .replace(/\/upload\/items\/\d+\/([^/]+)$/i, "/upload/items/2/$1")
      .replace(/\/upload\/pictures\/(.+?)\/thumbnails\/([^/]+)$/i, "/upload/pictures/$1/$2")
      .replace(
        /\/pics\/(figure|picture)\/(?:tiny|thumb|thumbnail|small|regular|medium|large|big)\/([^/]+)$/i,
        "/pics/$1/big/$2",
      )
      .replace(/\/pics\/(figure|picture)\/([^/]+)$/i, "/pics/$1/big/$2");
    url.search = "";
    return url.toString();
  } catch {
    return normalized;
  }
};


const canonicalizeMfcImageUrl = (value) => {
  const normalized = normalizeMfcImageUrl(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (url.hostname.toLowerCase().endsWith("myfigurecollection.net")) {
      url.protocol = "https:";
      url.search = "";
      return url.toString();
    }
    return normalized;
  } catch {
    return normalized;
  }
};

const shouldVerifyMfcImageUpgrade = (original, upgraded) => {
  if (!original || !upgraded || original === upgraded) return false;

  try {
    const originalUrl = new URL(original);
    const upgradedUrl = new URL(upgraded);
    if (originalUrl.hostname.toLowerCase() !== upgradedUrl.hostname.toLowerCase()) return false;

    const originalMatch = originalUrl.pathname.match(/\/upload\/items\/(\d+)\/([^/]+)$/i);
    const upgradedMatch = upgradedUrl.pathname.match(/\/upload\/items\/(\d+)\/([^/]+)$/i);
    return Boolean(originalMatch && upgradedMatch && originalMatch[1] !== "2" && upgradedMatch[1] === "2");
  } catch {
    return false;
  }
};

const mfcImageRequestHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  Referer: "https://myfigurecollection.net/",
};

const isImageResponse = (response) => {
  if (!response.ok) return false;
  const contentType = response.headers.get("Content-Type") || "";
  return !contentType || contentType.toLowerCase().startsWith("image/");
};

const mfcImageExists = async (url) => {
  try {
    const headResponse = await fetch(url, {
      method: "HEAD",
      headers: mfcImageRequestHeaders,
      cf: { cacheTtl: 3600, cacheEverything: false },
    });
    if (isImageResponse(headResponse)) return true;
    if (headResponse.status !== 405 && headResponse.status !== 403) return false;
  } catch (error) {
    console.warn("Unable to verify MFC image with HEAD", error);
  }

  try {
    const getResponse = await fetch(url, {
      headers: { ...mfcImageRequestHeaders, Range: "bytes=0-0" },
      cf: { cacheTtl: 3600, cacheEverything: false },
    });
    return isImageResponse(getResponse);
  } catch (error) {
    console.warn("Unable to verify MFC image with GET", error);
    return false;
  }
};

const resolveFullSizeMfcImageUrl = async (value) => {
  const original = canonicalizeMfcImageUrl(value);
  const upgraded = buildFullSizeMfcImageUrl(value);
  if (!upgraded) return null;
  if (!shouldVerifyMfcImageUpgrade(original, upgraded)) return upgraded;

  return (await mfcImageExists(upgraded)) ? upgraded : original;
};

const extractElementsByClassNames = (html, tagName, classNames) => {
  const sections = [];
  const tagRegex = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  let match;

  while ((match = tagRegex.exec(html))) {
    const tag = match[0];
    const classMatch = /class\s*=\s*(["'])([^"']*)\1/i.exec(tag);
    const classes = classMatch ? classMatch[2].split(/\s+/).filter(Boolean) : [];
    if (!classNames.every((className) => classes.includes(className))) {
      continue;
    }

    const sectionStart = match.index;
    let cursor = tagRegex.lastIndex;
    let depth = 1;
    const boundaryRegex = new RegExp(`</?${tagName}\\b[^>]*>`, "gi");
    boundaryRegex.lastIndex = cursor;

    let boundary;
    while ((boundary = boundaryRegex.exec(html))) {
      if (boundary[0].startsWith(`</${tagName}`)) {
        depth -= 1;
        if (depth === 0) {
          sections.push(html.slice(sectionStart, boundaryRegex.lastIndex));
          cursor = boundaryRegex.lastIndex;
          break;
        }
      } else {
        depth += 1;
      }
    }

    tagRegex.lastIndex = cursor;
  }

  return sections;
};

const decodeAttributeValue = (value) => {
  if (!value) return "";
  const decoded = decodeHtml(value);
  try {
    return decodeURIComponent(decoded);
  } catch {
    return decoded;
  }
};

const extractMfcPictureGalleryImages = (html) => {
  const candidates = [];
  const metaRegex = /<meta[^>]+name\s*=\s*(["'])pictures\1[^>]+content\s*=\s*(["'])([\s\S]*?)\2[^>]*>/gi;
  let match;

  while ((match = metaRegex.exec(html))) {
    const decoded = decodeAttributeValue(match[3]);
    if (!decoded) continue;

    try {
      const parsed = JSON.parse(decoded);
      candidates.push(...collectImageCandidateRecords(parsed));
    } catch (error) {
      console.warn("Unable to parse MFC picture gallery metadata", error);
    }
  }

  return candidates;
};

const extractScopedMfcImageCandidates = (html) => {
  const sections = extractElementsByClassNames(html, "div", ["split-left", "righter"]);
  return sections.flatMap((section) => {
    const galleryImages = extractMfcPictureGalleryImages(section);
    return galleryImages.length ? galleryImages : extractImageUrlsFromHtml(section);
  });
};

const normalizeImageDimension = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const collectImageCandidateRecords = (value, inheritedDimensions = {}) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectImageCandidateRecords(item, inheritedDimensions));
  }
  if (typeof value === "object") {
    const dimensions = {
      width: normalizeImageDimension(value.width ?? value.w) ?? inheritedDimensions.width ?? null,
      height: normalizeImageDimension(value.height ?? value.h) ?? inheritedDimensions.height ?? null,
    };

    return [
      ...collectImageCandidateRecords(value.src, dimensions),
      ...collectImageCandidateRecords(value.url, dimensions),
      ...collectImageCandidateRecords(value.contentUrl, dimensions),
      ...collectImageCandidateRecords(value.thumbnailUrl, dimensions),
      ...collectImageCandidateRecords(value.image, dimensions),
    ];
  }
  if (typeof value === "string") {
    const normalized = normalizeMfcImageUrl(value);
    return normalized
      ? [
          {
            url: normalized,
            width: inheritedDimensions.width ?? null,
            height: inheritedDimensions.height ?? null,
          },
        ]
      : [];
  }
  return [];
};

const collectImageCandidates = (value) =>
  collectImageCandidateRecords(value).map((candidate) => candidate.url);

const extractImageUrlsFromHtml = (html) => {
  const urls = [];
  const attributeRegex =
    /(?:src|data-src|data-original|data-large|data-full|href|content)\s*=\s*(["'])([^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)\1/gi;
  let match;
  while ((match = attributeRegex.exec(html))) {
    const normalized = normalizeMfcImageUrl(match[2]);
    if (normalized) urls.push(normalized);
  }
  return urls;
};

const normalizeImageCandidateRecords = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeImageCandidateRecords(item));
  }
  if (value && typeof value === "object" && typeof value.url === "string") {
    return [value];
  }
  return collectImageCandidateRecords(value);
};

const pickMfcImages = async (...candidateGroups) => {
  const candidates = candidateGroups.flatMap((group) => normalizeImageCandidateRecords(group));
  const seenUrls = new Set();
  const seenImageKeys = new Set();
  const images = [];

  for (const candidate of candidates) {
    const fullSize = await resolveFullSizeMfcImageUrl(candidate.url);
    if (!fullSize || seenUrls.has(fullSize)) continue;

    const uploadImage = parseMfcUploadImage(fullSize);
    const imageKey = uploadImage?.imageKey || fullSize;
    if (seenImageKeys.has(imageKey)) continue;

    seenUrls.add(fullSize);
    seenImageKeys.add(imageKey);
    images.push(fullSize);
  }

  return images;
};


const parseKeywords = (...values) => {
  const raw = values.flatMap((value) => flattenToStrings(value));
  return Array.from(
    new Set(
      raw
        .flatMap((item) => String(item).split(/[,;\n]/))
        .map((item) => stripRoleSuffix(item.trim()))
        .filter(Boolean),
    ),
  );
};

const flattenReleaseValues = (value) => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenReleaseValues(item));
  if (typeof value === "object") {
    return [
      ...flattenReleaseValues(value.releaseDate),
      ...flattenReleaseValues(value.productionDate),
      ...flattenReleaseValues(value.datePublished),
      ...flattenReleaseValues(value.availabilityStarts),
    ];
  }
  if (typeof value === "string") {
    const cleaned = cleanFieldValue(value);
    return cleaned ? [cleaned] : [];
  }
  return [];
};

const normalizeDateCandidate = (year, month = null) => {
  const normalizedYear = Number(year);
  if (!Number.isInteger(normalizedYear) || normalizedYear < 1900 || normalizedYear > 2200) return null;

  if (month === null || month === undefined || month === "") return String(normalizedYear);
  const normalizedMonth = Number(month);
  if (!Number.isInteger(normalizedMonth) || normalizedMonth < 1 || normalizedMonth > 12) return String(normalizedYear);
  return `${normalizedYear}-${String(normalizedMonth).padStart(2, "0")}`;
};

const extractReleaseDateCandidates = (value) => {
  const monthNames = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const candidates = [];

  for (const rawValue of flattenReleaseValues(value)) {
    const cleaned = rawValue.replace(/\b(?:released?|release date|original release|re-release|rerelease)\b/gi, " ");

    for (const match of cleaned.matchAll(/\b(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?\b/g)) {
      const candidate = normalizeDateCandidate(match[1], match[2]);
      if (candidate) candidates.push(candidate);
    }

    for (const match of cleaned.matchAll(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/g)) {
      const candidate = normalizeDateCandidate(match[3], Number(match[1]) > 12 ? match[2] : match[1]);
      if (candidate) candidates.push(candidate);
    }

    const monthRegex = /\b(jan(?:uary)?\.?|feb(?:ruary)?\.?|mar(?:ch)?\.?|apr(?:il)?\.?|may\.?|jun(?:e)?\.?|jul(?:y)?\.?|aug(?:ust)?\.?|sep(?:tember)?\.?|oct(?:ober)?\.?|nov(?:ember)?\.?|dec(?:ember)?\.?)\s+(?:\d{1,2},?\s+)?(\d{4})\b/gi;
    for (const match of cleaned.matchAll(monthRegex)) {
      const monthKey = match[1].toLowerCase().replace(/\./g, "").slice(0, 3);
      const candidate = normalizeDateCandidate(match[2], monthNames[monthKey]);
      if (candidate) candidates.push(candidate);
    }

    for (const match of cleaned.matchAll(/\b(\d{4})\b/g)) {
      const alreadyCapturedWithMonth = candidates.some((candidate) => candidate.startsWith(`${match[1]}-`));
      if (!alreadyCapturedWithMonth) {
        const candidate = normalizeDateCandidate(match[1]);
        if (candidate) candidates.push(candidate);
      }
    }
  }

  return Array.from(new Set(candidates));
};

const releaseSortValue = (value) => {
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 100 + Number(match[2] || "01");
};

const pickOldestReleaseDate = (...values) => {
  const candidates = values.flatMap((value) => extractReleaseDateCandidates(value));
  if (!candidates.length) return null;
  return candidates.sort((a, b) => releaseSortValue(a) - releaseSortValue(b))[0];
};

const normalizeJsonDate = (value) => pickOldestReleaseDate(value);

const parseDescriptionFields = (description) => {
  if (!description) return {};
  const knownDescriptionKeys =
    "origin|series|source|franchise|manufacturer|company|producer|brand|scale|classification|ratio|release|released|release date|original release";
  const entries = description
    .split(
      new RegExp(
        String.raw`\s*(?:[•|;\n]|[-–](?=\s*(?:${knownDescriptionKeys})\s*:)|,(?=\s*(?:(?:${knownDescriptionKeys})\s*:|[^,]+?\s+(?:as|[-–])\s+)))\s*`,
        "i",
      ),
    )
    .map((item) => item.trim())
    .filter(Boolean);
  const mapping = {};
  for (const entry of entries) {
    const parts = entry.split(/:\s*/);
    const roleMatch = !entry.includes(":") ? /^(.+?)\s+(?:as|[-–])\s+(.+)$/i.exec(entry) : null;
    const key = roleMatch ? normalizeLabel(roleMatch[2]) : normalizeLabel(parts[0]);
    const value = roleMatch ? cleanFieldValue(roleMatch[1]) : cleanFieldValue(parts.slice(1).join(": "));
    if (!key || !value) continue;
    mapping[key] = value;
  }
  const series = mapping["origin"] || mapping["series"] || mapping["source"] || mapping["franchise"] || null;
  const manufacturer = mapping["manufacturer"] || mapping["company"] || mapping["producer"] || mapping["brand"] || null;
  const scale = mapping["scale"] || mapping["classification"] || mapping["ratio"] || null;
  const releaseDate = pickOldestReleaseDate(
    mapping["release"],
    mapping["release date"],
    mapping["released"],
    mapping["original release"],
  );
  return { series, manufacturer, scale, releaseDate };
};

function normalizeReleaseDate(value) {
  return pickOldestReleaseDate(value) || cleanFieldValue(value);
}

const summarizeText = (value) => {
  if (!value) return null;
  const text = value.trim();
  const sentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  return sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence;
};

const isCloudflareChallenge = (html) => {
  if (!html) return false;
  const lower = html.toLowerCase();
  if (lower.includes("just a moment") && lower.includes("cloudflare")) return true;
  if (lower.includes("cf-error-1020") || lower.includes("cf-chl-jschl")) return true;
  if (lower.includes("attention required")) return true;
  return false;
};

const parseMfcHtml = async (html) => {
  const metaName = extractMeta(html, "property", "og:title");
  const metaImage = extractMeta(html, "property", "og:image");
  const metaDescription = extractMeta(html, "property", "og:description");
  const metaKeywords = extractMeta(html, "name", "keywords");

  const jsonLdEntries = parseJsonLd(html);
  const productEntry = jsonLdEntries.find((entry) => {
    const type = entry?.["@type"];
    if (!type) return false;
    if (typeof type === "string") {
      return type.toLowerCase() === "product";
    }
    if (Array.isArray(type)) {
      return type.some(
        (item) => typeof item === "string" && item.toLowerCase() === "product",
      );
    }
    return false;
  });

  const productName = pickFirstString(productEntry?.name);
  const productImageCandidates = collectImageCandidates(productEntry?.image);
  const productDescription = pickFirstString(productEntry?.description);
  const productKeywords = productEntry?.keywords;
  const productSeries =
    pickFirstString(productEntry?.isRelatedTo) ||
    pickFirstString(productEntry?.category) ||
    pickFirstString(productEntry?.genre) ||
    null;
  const productManufacturer =
    pickFirstString(productEntry?.brand) ||
    pickFirstString(productEntry?.manufacturer) ||
    null;
  const productScale = pickFirstString(productEntry?.scale) || pickFirstString(productEntry?.size) || null;
  const productRelease = pickOldestReleaseDate(
    productEntry?.releaseDate,
    productEntry?.productionDate,
    productEntry?.offers,
  );

  const htmlSeries =
    extractField(html, "Origin", "Source", "Series", "Origin of Character") ||
    extractField(html, "Character") ||
    null;
  const htmlManufacturer = extractField(html, "Manufacturer", "Company", "Producer");
  const htmlScale =
    extractMfcScaleValues(html)[0] || extractField(html, "Scale", "Classification", "Ratio", "Size");
  const htmlRelease = pickOldestReleaseDate(
    extractMfcCalendarReleaseValues(html),
    extractFieldValues(
      html,
      "Release",
      "Released",
      "Release Date",
      "Release date",
      "Original release",
      "Re-release",
    ),
  );

  const descriptionFields = parseDescriptionFields(productDescription || metaDescription || "");

  const combinedDescription = productDescription || metaDescription || null;
  const combinedName = productName || metaName || null;
  const scopedImageCandidates = extractScopedMfcImageCandidates(html);
  const combinedImages = scopedImageCandidates.length ? await pickMfcImages(scopedImageCandidates) : [];
  const combinedImage = combinedImages[0] ?? null;
  const combinedSeries = htmlSeries || productSeries || descriptionFields.series || null;
  const combinedManufacturer =
    htmlManufacturer || productManufacturer || descriptionFields.manufacturer || null;
  const combinedScale = htmlScale || productScale || descriptionFields.scale || null;
  const combinedRelease = htmlRelease || productRelease || descriptionFields.releaseDate || null;

  const tags = parseKeywords(metaKeywords, productKeywords, productEntry?.category);

  return {
    name: combinedName,
    image: combinedImage,
    images: combinedImages,
    description: combinedDescription,
    caption: summarizeText(combinedDescription),
    series: combinedSeries,
    manufacturer: combinedManufacturer,
    scale: combinedScale,
    releaseDate: combinedRelease,
    tags,
  };
};

const fetchMfcDetails = async (itemId) => {
  const url = `https://myfigurecollection.net/item/${itemId}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    cf: {
      cacheTtl: 3600,
      cacheEverything: false,
    },
  });

  if (!response.ok) {
    return {
      error: `MyFigureCollection responded with status ${response.status}`,
      status: response.status === 404 ? 404 : 502,
    };
  }

  const html = await response.text();
  if (isCloudflareChallenge(html)) {
    return {
      error:
        "MyFigureCollection returned a protection page. Please try again in a few moments or complete the request manually.",
      status: 503,
    };
  }

  const parsed = await parseMfcHtml(html);
  if (
    !parsed ||
    Object.values(parsed).every(
      (value) =>
        value === null ||
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0),
    )
  ) {
    return {
      error: "Unable to parse MyFigureCollection details from the response.",
      status: 502,
    };
  }

  return {
    data: { ...parsed, links: { mfc: url } },
  };
};

const handleMfcRequest = async (request, env) => {
  const url = new URL(request.url);
  const item = url.searchParams.get("item");
  if (!item || !/^\d+$/.test(item)) {
    return new Response(JSON.stringify({ error: "A numeric MyFigureCollection item number is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await fetchMfcDetails(item);
  if (result.error) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: result.status || 502,
      headers: {
        "Content-Type": "application/json",
        "X-Error": result.error,
      },
    });
  }

  return new Response(JSON.stringify(result.data), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};

const handleLoginRequest = async (request, env) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const inputUsername =
    typeof body?.username === "string" ? sanitizeUsername(body.username) || "" : "";
  const rawPassword = typeof body?.password === "string" ? body.password : "";
  const normalizedPassword = sanitizePassword(rawPassword);
  const inputPassword = normalizedPassword !== null ? normalizedPassword : rawPassword;

  if (!inputUsername || rawPassword.length === 0) {
    return new Response(JSON.stringify({ error: "Enter both your username and password." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const credentials = getAdminCredentials(env);
  if (!credentials.password || !credentials.comparePassword) {
    return new Response(JSON.stringify({ error: "Admin password is not configured." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!areCredentialsValid(inputUsername, inputPassword, credentials)) {
    return new Response(JSON.stringify({ error: "Invalid username or password." }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const session = await createSessionToken(credentials.username, env);
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    headers.append(
      "Set-Cookie",
      createSessionCookie(session.token, { secure: shouldUseSecureCookie(request) })
    );
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Unable to create admin session", error);
    return new Response(JSON.stringify({ error: "Unable to create session." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

const handleLogoutRequest = async (request) => {
  const headers = new Headers({ "Cache-Control": "no-store" });
  appendSessionInvalidationCookies(headers, request);

  return new Response(null, {
    status: 204,
    headers,
  });
};

const handleAuthCheckRequest = async (request, env) => {
  const auth = await ensureAuthorized(request, env);
  if (auth) {
    return auth;
  }
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
};

const handleCollectionGetRequest = async (request, env) => {
  const collection = await loadCollectionFromStorage(env);
  return new Response(JSON.stringify(collection), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};

const handleCollectionPutRequest = async (request, env) => {
  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return new Response(JSON.stringify({ error: "A JSON body is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const saved = await storeCollection(env, payload);
    return new Response(JSON.stringify({ success: true, updatedAt: saved.updatedAt }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Unable to store collection", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unable to save collection." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};

const serveAsset = async (request, env) => {
  const response = await env.ASSETS.fetch(request);
  if (response.status !== 404) {
    return response;
  }

  const url = new URL(request.url);
  url.pathname = "/index.html";
  return env.ASSETS.fetch(
    new Request(url.toString(), {
      headers: request.headers,
      method: "GET",
    })
  );
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const pathname = normalizePathname(url.pathname);

    if (pathname === "/api/login") {
      return handleLoginRequest(request, env);
    }

    if (pathname === "/api/logout") {
      return handleLogoutRequest(request);
    }

    if (pathname === "/api/auth-check") {
      return handleAuthCheckRequest(request, env);
    }

    if (pathname === "/api/collection") {
      if (request.method === "GET") {
        return handleCollectionGetRequest(request, env);
      }
      if (request.method === "PUT") {
        const auth = await ensureAuthorized(request, env);
        if (auth) return auth;
        return handleCollectionPutRequest(request, env);
      }
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: { Allow: "GET, PUT, OPTIONS" },
        });
      }
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, PUT, OPTIONS" },
      });
    }

    if (pathname.startsWith("/api/mfc")) {
      const auth = await ensureAuthorized(request, env);
      if (auth) return auth;
      if (request.method !== "GET") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "GET" },
        });
      }
      return handleMfcRequest(request, env);
    }

    if (pathname === "/admin") {
      const auth = await ensureAuthorized(request, env, {
        redirectToLogin: isHtmlRequest(request),
      });
      if (auth) return auth;

      const indexUrl = new URL(request.url);
      indexUrl.pathname = "/admin/index.html";
      return serveAsset(cloneRequestForUrl(request, indexUrl), env, ctx);
    }

    if (pathname === "/admin/login") {
      const loginUrl = new URL(request.url);
      loginUrl.pathname = "/admin/login.html";
      return serveAsset(cloneRequestForUrl(request, loginUrl), env, ctx);
    }

    if (PUBLIC_ADMIN_ASSETS.has(url.pathname)) {
      return serveAsset(request, env, ctx);
    }

    if (pathname.startsWith("/admin")) {
      const auth = await ensureAuthorized(request, env, {
        redirectToLogin: isHtmlRequest(request),
      });
      if (auth) return auth;
      return serveAsset(request, env, ctx);
    }

    return serveAsset(request, env, ctx);
  },
};
