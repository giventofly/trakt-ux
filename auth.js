/**
 * Trakt OAuth 2.0 helpers
 */
const Auth = (() => {
  const STORAGE_KEY = "trakt_tokens";

  /**
   * Redirect the browser to Trakt's authorization page.
   */
  function login() {
    const state = crypto.randomUUID();
    sessionStorage.setItem("trakt_oauth_state", state);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: CONFIG.CLIENT_ID,
      redirect_uri: CONFIG.REDIRECT_URI,
      state,
    });

    window.location.href = `${CONFIG.AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange an authorization code for access + refresh tokens and
   * persist them in localStorage.
   *
   * @param {string} code  The ?code= value from the redirect URI.
   * @returns {Promise<object>} Token data.
   */
  async function exchangeCode(code) {
    const response = await fetch(CONFIG.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        client_id: CONFIG.CLIENT_ID,
        client_secret: CONFIG.CLIENT_SECRET,
        redirect_uri: CONFIG.REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${text}`);
    }

    const tokens = await response.json();
    // Attach an absolute expiry timestamp (seconds)
    tokens.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
    saveTokens(tokens);
    return tokens;
  }

  /**
   * Use the stored refresh_token to obtain a new access_token.
   *
   * @returns {Promise<object>} New token data.
   */
  async function refreshTokens() {
    const tokens = getTokens();
    if (!tokens?.refresh_token) throw new Error("No refresh token available.");

    const response = await fetch(CONFIG.TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refresh_token: tokens.refresh_token,
        client_id: CONFIG.CLIENT_ID,
        client_secret: CONFIG.CLIENT_SECRET,
        redirect_uri: CONFIG.REDIRECT_URI,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token refresh failed: ${response.status} ${text}`);
    }

    const newTokens = await response.json();
    newTokens.expires_at = Math.floor(Date.now() / 1000) + newTokens.expires_in;
    saveTokens(newTokens);
    return newTokens;
  }

  /**
   * Return the current access_token, refreshing it first if it is
   * within 60 seconds of expiry.
   *
   * @returns {Promise<string>} A valid access token.
   */
  async function getValidAccessToken() {
    let tokens = getTokens();
    if (!tokens) throw new Error("Not authenticated.");

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (tokens.expires_at - nowSeconds < 60) {
      tokens = await refreshTokens();
    }

    return tokens.access_token;
  }

  /** Persist token data to localStorage. */
  function saveTokens(tokens) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  }

  /** Retrieve token data from localStorage (or null). */
  function getTokens() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  /** Remove token data from localStorage. */
  function clearTokens() {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem("trakt_oauth_state");
  }

  /** True when a valid token record exists in localStorage. */
  function isLoggedIn() {
    return !!getTokens();
  }

  return { login, exchangeCode, getValidAccessToken, clearTokens, isLoggedIn };
})();
