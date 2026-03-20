/**
 * app.js – main application entry point
 *
 * Handles:
 *  - OAuth callback (exchanges ?code= for tokens and stores them)
 *  - Rendering the login screen vs. the progress dashboard
 *  - Logout
 */

/* ------------------------------------------------------------------ */
/*  DOM helpers                                                         */
/* ------------------------------------------------------------------ */

const $ = (selector) => document.querySelector(selector);

function showSection(id) {
  document.querySelectorAll(".section").forEach((el) => {
    el.hidden = el.id !== id;
  });
}

function setStatus(message, isError = false) {
  const el = $("#status");
  el.textContent = message;
  el.className = isError ? "status error" : "status";
}

/* ------------------------------------------------------------------ */
/*  OAuth callback handling                                             */
/* ------------------------------------------------------------------ */

async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");

  if (error) {
    setStatus(`Authorization denied: ${error}`, true);
    showSection("login-section");
    return;
  }

  if (!code) return; // Not a callback – continue normal init

  // Verify state to prevent CSRF
  const savedState = sessionStorage.getItem("trakt_oauth_state");
  if (state !== savedState) {
    setStatus("Invalid state parameter. Please try logging in again.", true);
    showSection("login-section");
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }

  showSection("loading-section");
  setStatus("Exchanging authorization code for tokens…");

  try {
    await Auth.exchangeCode(code);
    // Clean up the URL so the code isn't visible after refresh
    window.history.replaceState({}, document.title, window.location.pathname);
    await renderDashboard();
  } catch (err) {
    setStatus(`Login failed: ${err.message}`, true);
    showSection("login-section");
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                           */
/* ------------------------------------------------------------------ */

async function renderDashboard() {
  showSection("loading-section");
  setStatus("Loading your progress…");

  try {
    const [profile, watchedShows] = await Promise.all([
      TraktAPI.getProfile(),
      TraktAPI.getWatchedShows(),
    ]);

    renderProfile(profile);
    renderProgress(watchedShows);
    showSection("dashboard-section");
    $("#logout-btn").hidden = false;
    setStatus("");
  } catch (err) {
    setStatus(`Failed to load data: ${err.message}`, true);
    showSection("login-section");
  }
}

function renderProfile(profile) {
  const el = $("#profile");
  const avatar = profile.images?.avatar?.full ?? "";
  const username = profile.username ?? "Unknown";
  const name = profile.name ?? username;

  el.innerHTML = `
    <div class="profile">
      ${avatar ? `<img class="avatar" src="${escapeHtml(avatar)}" alt="${escapeHtml(username)}">` : ""}
      <div class="profile-info">
        <span class="profile-name">${escapeHtml(name)}</span>
        <span class="profile-username">@${escapeHtml(username)}</span>
      </div>
    </div>`;
}

function renderProgress(shows) {
  const container = $("#progress-list");

  if (!shows.length) {
    container.innerHTML = "<p class='empty'>No watched shows found.</p>";
    return;
  }

  // Sort by last-watched date descending
  shows.sort((a, b) => {
    const aTime = a.last_watched_at ? new Date(a.last_watched_at).getTime() : 0;
    const bTime = b.last_watched_at ? new Date(b.last_watched_at).getTime() : 0;
    return bTime - aTime;
  });

  const items = shows.map((entry) => {
    const show = entry.show;
    const title = escapeHtml(show.title ?? "Unknown");
    const year = show.year ? ` (${show.year})` : "";
    const plays = entry.plays ?? 0;
    const seasons = entry.seasons ?? [];
    const episodeCount = seasons.reduce(
      (sum, s) => sum + (s.episodes?.length ?? 0),
      0
    );
    const lastWatched = entry.last_watched_at
      ? new Date(entry.last_watched_at).toLocaleDateString()
      : "–";
    const traktId = show.ids?.trakt ?? "";

    return `
      <li class="show-card" data-id="${escapeHtml(String(traktId))}">
        <div class="show-header">
          <h3 class="show-title">${title}<span class="show-year">${year}</span></h3>
          <span class="show-plays">${plays} play${plays !== 1 ? "s" : ""}</span>
        </div>
        <div class="show-meta">
          <span>Episodes watched: <strong>${episodeCount}</strong></span>
          <span>Last watched: <strong>${lastWatched}</strong></span>
        </div>
      </li>`;
  });

  container.innerHTML = `<ul class="show-list">${items.join("")}</ul>`;
}

/* ------------------------------------------------------------------ */
/*  Utility                                                             */
/* ------------------------------------------------------------------ */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ------------------------------------------------------------------ */
/*  Event listeners                                                     */
/* ------------------------------------------------------------------ */

document.addEventListener("DOMContentLoaded", async () => {
  // Wire up buttons
  $("#login-btn")?.addEventListener("click", () => Auth.login());
  $("#logout-btn")?.addEventListener("click", () => {
    Auth.clearTokens();
    $("#logout-btn").hidden = true;
    showSection("login-section");
    setStatus("");
  });

  const params = new URLSearchParams(window.location.search);
  const hasCode = params.has("code") || params.has("error");

  if (hasCode) {
    // OAuth redirect callback – let handleOAuthCallback take over
    await handleOAuthCallback();
  } else if (Auth.isLoggedIn()) {
    await renderDashboard();
  } else {
    showSection("login-section");
  }
});
