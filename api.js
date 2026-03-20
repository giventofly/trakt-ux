/**
 * Trakt API helpers
 */
const TraktAPI = (() => {
  /**
   * Build headers required by every Trakt API request.
   *
   * @param {string|null} accessToken  Include when an authenticated endpoint is needed.
   * @returns {HeadersInit}
   */
  function buildHeaders(accessToken = null) {
    const headers = {
      "Content-Type": "application/json",
      "trakt-api-key": CONFIG.CLIENT_ID,
      "trakt-api-version": "2",
    };
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    return headers;
  }

  /**
   * Generic GET helper.
   *
   * @param {string} path     API path (e.g. "/users/me/watched/shows").
   * @param {object} [params] Query-string parameters.
   * @param {boolean} [auth]  Whether to attach the user's access token.
   * @returns {Promise<any>}
   */
  async function get(path, params = {}, auth = false) {
    const url = new URL(`${CONFIG.API_BASE}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const accessToken = auth ? await Auth.getValidAccessToken() : null;

    const response = await fetch(url.toString(), {
      headers: buildHeaders(accessToken),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API error ${response.status}: ${text}`);
    }

    // 204 No Content – return empty array
    if (response.status === 204) return [];

    return response.json();
  }

  /**
   * Fetch the authenticated user's profile.
   *
   * @returns {Promise<object>}
   */
  function getProfile() {
    return get("/users/me", { extended: "full" }, true);
  }

  /**
   * Fetch the user's watched-shows list with play counts and
   * episode-level progress.
   *
   * @returns {Promise<Array>}
   */
  function getWatchedShows() {
    return get("/users/me/watched/shows", { extended: "noseasons" }, true);
  }

  /**
   * Fetch detailed watched-episode progress for a single show.
   *
   * @param {string|number} showId  Trakt show ID (or slug).
   * @returns {Promise<object>}
   */
  function getShowProgress(showId) {
    return get(`/shows/${showId}/progress/watched`, {}, true);
  }

  /**
   * Fetch the user's watch history (recently watched).
   *
   * @param {number} [limit]  Max items to return.
   * @returns {Promise<Array>}
   */
  function getHistory(limit = 20) {
    return get("/users/me/history/shows", { limit }, true);
  }

  return { getProfile, getWatchedShows, getShowProgress, getHistory };
})();
