const form = document.getElementById("login-form");
const usernameInput = document.getElementById("login-username");
const passwordInput = document.getElementById("login-password");
const submitButton = document.getElementById("login-submit");
const message = document.getElementById("login-message");

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
          errorMessage = "The login endpoint only accepts POST requests. Something is misconfigured.";
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
