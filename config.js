/**
 * Trakt API configuration
 *
 * 1. Create a Trakt application at https://trakt.tv/oauth/applications/new
 * 2. Set the Redirect URI to match the URL where this app is served
 *    (e.g. http://localhost:8080 for local development)
 * 3. Fill in the values below.
 *
 * NOTE: The client_secret is included here only because this is a
 * client-side demo.  In a production app the token-exchange step
 * should be performed server-side so the secret is never exposed.
 */
const CONFIG = {
  CLIENT_ID: "8e72d88c3c50e600eabf4ef4dc86fa88a45553209bcd309eb8ae8dc26af8675a",
  CLIENT_SECRET: "32d4a55a9dad564cf9dc29734fe4df8ae7fa416ee86e3c7598fc1543e8b820b0",
  REDIRECT_URI: window.location.origin + window.location.pathname,
  API_BASE: "https://api.trakt.tv",
  AUTH_URL: "https://trakt.tv/oauth/authorize",
  TOKEN_URL: "https://api.trakt.tv/oauth/token",
};
