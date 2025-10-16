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

const unauthorizedResponse = () =>
  new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${BASIC_REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store",
    },
  });

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
  if (!header) return null;
  const cookies = parseCookies(header);
  if (!cookies[SESSION_COOKIE]) return null;
  try {
    const decoded = decodeURIComponent(cookies[SESSION_COOKIE]);
    return await verifySessionToken(decoded, env);
  } catch (error) {
    console.warn("Unable to verify session token", error);
    return null;
  }
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

const buildLoginRedirectResponse = (request) => {
  const requestUrl = new URL(request.url);
  const loginUrl = new URL("/admin/login.html", requestUrl.origin);
  const pathname = requestUrl.pathname.endsWith("/")
    ? `${requestUrl.pathname}index.html`
    : requestUrl.pathname;
  const redirectTarget = `${pathname}${requestUrl.search}`;
  loginUrl.searchParams.set("redirect", redirectTarget);
  return Response.redirect(loginUrl, 303);
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

  const session = await getSessionFromCookies(request, env);
  if (session) {
    return null;
  }

  if (hasBasicCredentials) {
    return unauthorizedResponse();
  }

  return redirectToLogin ? buildLoginRedirectResponse(request) : unauthorizedResponse();
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
    "i"
  );
  const match = regex.exec(html);
  return match ? decodeHtml(match[1]) : null;
};

const extractField = (html, ...labels) => {
  for (const label of labels) {
    const regex = new RegExp(
      `<th[^>]*>\\s*${label}\\s*<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
      "i"
    );
    const match = regex.exec(html);
    if (match) {
      return decodeHtml(match[1]);
    }
  }
  return null;
};

const summarizeText = (value) => {
  if (!value) return null;
  const text = value.trim();
  const sentence = text.split(/(?<=[.!?])\s+/)[0] || text;
  return sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence;
};

const parseMfcHtml = (html) => {
  const name = extractMeta(html, "property", "og:title");
  const image = extractMeta(html, "property", "og:image");
  const description = extractMeta(html, "property", "og:description");
  const keywords = extractMeta(html, "name", "keywords");

  const series =
    extractField(html, "Origin", "Source", "Series") ||
    extractField(html, "Character") ||
    null;
  const manufacturer = extractField(html, "Manufacturer", "Company");
  const scale = extractField(html, "Scale", "Classification");
  const releaseDate =
    extractField(html, "Release", "Released", "Release Date", "Release date") || null;

  const tags = keywords
    ? keywords
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  return {
    name,
    image,
    description,
    caption: summarizeText(description),
    series,
    manufacturer,
    scale,
    releaseDate,
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
  return {
    data: {
      ...parseMfcHtml(html),
      links: { mfc: url },
    },
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
  const secure = shouldUseSecureCookie(request);
  headers.append("Set-Cookie", expireSessionCookie({ secure }));

  if (!secure) {
    headers.append("Set-Cookie", expireSessionCookie({ secure: true }));
  }

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
      return Response.redirect(new URL("/admin/login.html", request.url), 302);
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
