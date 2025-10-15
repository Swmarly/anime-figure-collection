const BASIC_REALM = "Figure Admin";
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "figures-admin";

const unauthorizedResponse = new Response("Unauthorized", {
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

const getAdminCredentials = (env) => {
  const username = env.ADMIN_USERNAME || DEFAULT_USERNAME;
  const password = env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
  return { username, password };
};

const ensureAuthorized = (request, env) => {
  const { username, password } = getAdminCredentials(env);
  if (!password) {
    return new Response("Admin password is not configured.", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const credentials = decodeBasicAuth(request.headers.get("Authorization"));
  if (!credentials) return unauthorizedResponse;
  if (credentials.username !== username || credentials.password !== password) {
    return unauthorizedResponse;
  }
  return null;
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

    if (url.pathname.startsWith("/api/mfc")) {
      const auth = ensureAuthorized(request, env);
      if (auth) return auth;
      if (request.method !== "GET") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "GET" },
        });
      }
      return handleMfcRequest(request, env);
    }

    if (url.pathname.startsWith("/admin")) {
      const auth = ensureAuthorized(request, env);
      if (auth) return auth;
      return serveAsset(request, env, ctx);
    }

    return serveAsset(request, env, ctx);
  },
};
