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
  value ? value.toLowerCase().replace(/\s+/g, " ").trim() : "";

const extractField = (html, ...labels) => {
  if (!html) return null;
  const normalizedLabels = labels
    .filter(Boolean)
    .map((label) => normalizeLabel(label))
    .filter(Boolean);

  if (!normalizedLabels.length) return null;

  const checkMatch = (rawHeading) => {
    const heading = cleanFieldValue(decodeHtml(rawHeading));
    if (!heading) return false;
    const headingNormalized = normalizeLabel(heading);
    return normalizedLabels.some(
      (label) =>
        headingNormalized === label ||
        headingNormalized.includes(label) ||
        label.includes(headingNormalized),
    );
  };

  const extractValue = (rawValue) => cleanFieldValue(decodeHtml(rawValue));

  const patterns = [
    /<tr[^>]*>\s*<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi,
    /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi,
    /<div[^>]*class="[^"]*(?:label|header|title)[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="[^"]*(?:value|content|data)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(html))) {
      if (!checkMatch(match[1])) continue;
      const value = extractValue(match[2]);
      if (value) {
        return value;
      }
    }
  }

  const fallbackRegex = />([^<]+?)<\/?[^>]*>([^<]+?)</gi;
  let match;
  while ((match = fallbackRegex.exec(html))) {
    if (!checkMatch(match[1])) continue;
    const value = cleanFieldValue(match[2]);
    if (value) {
      return value;
    }
  }

  return null;
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

const normalizeJsonDate = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return normalizeReleaseDate(trimmed);
};

const parseDescriptionFields = (description) => {
  if (!description) return {};
  const entries = description
    .split(/\s*[•\-|\n]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  const mapping = {};
  for (const entry of entries) {
    const parts = entry.split(/:\s*/);
    if (parts.length < 2) continue;
    const key = normalizeLabel(parts[0]);
    const value = cleanFieldValue(parts.slice(1).join(": "));
    if (!key || !value) continue;
    mapping[key] = value;
  }
  const series = mapping["origin"] || mapping["series"] || mapping["source"] || null;
  const manufacturer = mapping["manufacturer"] || mapping["company"] || mapping["producer"] || null;
  const scale = mapping["scale"] || mapping["classification"] || mapping["ratio"] || null;
  const releaseDate = normalizeReleaseDate(
    mapping["release"] || mapping["release date"] || mapping["released"] || null,
  );
  return { series, manufacturer, scale, releaseDate };
};

function normalizeReleaseDate(value) {
  const cleaned = cleanFieldValue(value);
  if (!cleaned) return null;

  const numericMatch = cleaned.match(/(\d{4})[-/](\d{1,2})/);
  if (numericMatch) {
    const [, year, month] = numericMatch;
    return `${year}-${month.padStart(2, "0")}`;
  }

  const monthMatch = cleaned.match(
    /(jan(?:uary)?\.?|feb(?:ruary)?\.?|mar(?:ch)?\.?|apr(?:il)?\.?|may\.?|jun(?:e)?\.?|jul(?:y)?\.?|aug(?:ust)?\.?|sep(?:tember)?\.?|oct(?:ober)?\.?|nov(?:ember)?\.?|dec(?:ember)?\.?)\s+(\d{4})/i,
  );
  if (monthMatch) {
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
    const monthKey = monthMatch[1].toLowerCase().replace(/\./g, "").slice(0, 3);
    const year = monthMatch[2];
    const monthNumber = monthNames[monthKey];
    if (monthNumber) {
      return `${year}-${monthNumber}`;
    }
  }

  const yearMatch = cleaned.match(/\b(\d{4})\b/);
  if (yearMatch) {
    return `${yearMatch[1]}`;
  }

  return cleaned;
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

const parseMfcHtml = (html) => {
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
  const productImage = pickFirstString(productEntry?.image);
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
  const productRelease =
    normalizeJsonDate(productEntry?.releaseDate) ||
    normalizeJsonDate(productEntry?.productionDate) ||
    normalizeJsonDate(productEntry?.offers?.releaseDate);

  const htmlSeries =
    extractField(html, "Origin", "Source", "Series", "Origin of Character") ||
    extractField(html, "Character") ||
    null;
  const htmlManufacturer = extractField(html, "Manufacturer", "Company", "Producer");
  const htmlScale = extractField(html, "Scale", "Classification", "Ratio", "Size");
  const htmlRelease = normalizeReleaseDate(
    extractField(
      html,
      "Release",
      "Released",
      "Release Date",
      "Release date",
      "Original release",
    ),
  );

  const descriptionFields = parseDescriptionFields(productDescription || metaDescription || "");

  const combinedDescription = productDescription || metaDescription || null;
  const combinedName = productName || metaName || null;
  const combinedImage = productImage || metaImage || null;
  const combinedSeries = htmlSeries || productSeries || descriptionFields.series || null;
  const combinedManufacturer =
    htmlManufacturer || productManufacturer || descriptionFields.manufacturer || null;
  const combinedScale = htmlScale || productScale || descriptionFields.scale || null;
  const combinedRelease = htmlRelease || productRelease || descriptionFields.releaseDate || null;

  const tags = parseKeywords(metaKeywords, productKeywords, productEntry?.category);

  return {
    name: combinedName,
    image: combinedImage,
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

  const parsed = parseMfcHtml(html);
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
