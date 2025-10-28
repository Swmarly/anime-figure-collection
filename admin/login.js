const form = document.getElementById("login-form");
const usernameInput = document.getElementById("login-username");
const passwordInput = document.getElementById("login-password");
const submitButton = document.getElementById("login-submit");
const message = document.getElementById("login-message");
const themeToggle = document.getElementById("theme-toggle");

const THEME_STORAGE_KEY = "afc-admin-theme";
const prefersDarkScheme = window.matchMedia
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : { matches: false, addEventListener: () => {}, removeEventListener: () => {} };

const readStoredThemePreference = () => {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") {
      return stored;
    }
  } catch (error) {
    console.warn("Unable to read stored theme preference", error);
  }
  return null;
};

let storedThemePreference = readStoredThemePreference();

const updateThemeToggleAppearance = (theme) => {
  if (!themeToggle) {
    return;
  }
  const isDark = theme === "dark";
  themeToggle.setAttribute("aria-pressed", isDark ? "true" : "false");
  const icon = themeToggle.querySelector(".theme-toggle__icon");
  const label = themeToggle.querySelector(".theme-toggle__text");
  if (icon) {
    icon.textContent = isDark ? "☀️" : "🌙";
  }
  if (label) {
    label.textContent = isDark ? "Light mode" : "Dark mode";
  }
};

const applyTheme = (theme) => {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", normalized);
  updateThemeToggleAppearance(normalized);
};

const getPreferredTheme = () => storedThemePreference ?? (prefersDarkScheme.matches ? "dark" : "light");

const setStoredThemePreference = (theme) => {
  storedThemePreference = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn("Unable to persist theme preference", error);
  }
};

applyTheme(getPreferredTheme());

if (prefersDarkScheme && typeof prefersDarkScheme.addEventListener === "function") {
  prefersDarkScheme.addEventListener("change", (event) => {
    if (storedThemePreference) {
      return;
    }
    applyTheme(event.matches ? "dark" : "light");
  });
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    setStoredThemePreference(nextTheme);
    applyTheme(nextTheme);
  });
}

const DEFAULT_REDIRECT = "/admin/index.html";

const sanitizeRedirect = (value) => {
  if (!value || typeof value !== "string") return DEFAULT_REDIRECT;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) {
      return DEFAULT_REDIRECT;
    }
    return `${url.pathname}${url.search}${url.hash}` || DEFAULT_REDIRECT;
  } catch {
    return value.startsWith("/") ? value : DEFAULT_REDIRECT;
  }
};

const params = new URLSearchParams(window.location.search);
const redirectTarget = sanitizeRedirect(params.get("redirect"));

const setMessage = (text) => {
  if (!message) return;
  if (text) {
    message.textContent = text;
    message.hidden = false;
  } else {
    message.textContent = "";
    message.hidden = true;
  }
};

const setFormDisabled = (disabled) => {
  if (usernameInput) usernameInput.disabled = disabled;
  if (passwordInput) passwordInput.disabled = disabled;
  if (submitButton) submitButton.disabled = disabled;
};

const redirectToPanel = () => {
  window.location.href = redirectTarget;
};

const checkExistingSession = async () => {
  try {
    const response = await fetch("/api/auth-check", {
      method: "GET",
      credentials: "same-origin",
      headers: { "Cache-Control": "no-cache" },
    });
    if (response.status === 204) {
      redirectToPanel();
    }
  } catch (error) {
    console.warn("Unable to verify session", error);
  }
};

checkExistingSession();

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = usernameInput?.value?.trim() || "";
    const password = passwordInput?.value || "";

    if (!username || !password) {
      setMessage("Enter both your username and password.");
      return;
    }

    setMessage("");
    setFormDisabled(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        redirectToPanel();
        return;
      }

      let errorMessage = "";
      const contentType = response.headers.get("Content-Type") || "";
      if (contentType.includes("application/json")) {
        try {
          const payload = await response.json();
          if (payload && typeof payload.error === "string" && payload.error.trim()) {
            errorMessage = payload.error.trim();
          }
        } catch (error) {
          console.warn("Unable to parse login error payload", error);
        }
      }

      if (!errorMessage) {
        if (response.status === 401) {
          errorMessage = "Invalid username or password.";
        } else if (response.status === 404) {
          errorMessage = "The login service is unavailable. Make sure the Worker backend is running.";
        } else if (response.status === 405) {
          errorMessage =
            "The login endpoint only accepts POST requests. Start the Cloudflare Worker (e.g. `npx wrangler dev`) so /api/login is handled server-side.";
        } else if (response.status >= 500) {
          errorMessage = "The server encountered an error. Please try again shortly.";
        } else {
          errorMessage = "Unexpected response from the login service. Please verify your setup.";
        }
      }

      setMessage(errorMessage);
    } catch (error) {
      console.error("Login request failed", error);
      setMessage("Unable to sign in right now. Please try again.");
    } finally {
      setFormDisabled(false);
      if (passwordInput) {
        passwordInput.focus();
        passwordInput.select();
      }
    }
  });
}

if (usernameInput && typeof usernameInput.focus === "function") {
  usernameInput.focus();
}
