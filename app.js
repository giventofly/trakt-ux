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
    setStatus("Fetching up-next episodes…");

    const upNextItems = await fetchUpNext(watchedShows);
    renderUpNext(upNextItems);
    showSection("dashboard-section");
    $("#logout-btn").hidden = false;
    setStatus("");
  } catch (err) {
    setStatus(`Failed to load data: ${err.message}`, true);
    showSection("login-section");
  }
}

/**
 * Fetch watched-episode progress for every show in parallel, then
 * return only the entries that have a next episode to watch.
 *
 * @param {Array} watchedShows  Raw list from TraktAPI.getWatchedShows().
 * @returns {Promise<Array>}
 */
async function fetchUpNext(watchedShows) {
  // Sort by most-recently-watched first so the list order feels natural
  const sorted = [...watchedShows].sort((a, b) => {
    const aTime = a.last_watched_at ? new Date(a.last_watched_at).getTime() : 0;
    const bTime = b.last_watched_at ? new Date(b.last_watched_at).getTime() : 0;
    return bTime - aTime;
  });

  // Fetch per-show progress in parallel; ignore individual failures
  const results = await Promise.allSettled(
    sorted.map(async (entry) => {
      const showId = entry.show.ids?.trakt;
      if (!showId) return null;
      const progress = await TraktAPI.getShowProgress(showId);
      return { ...progress, show: entry.show };
    })
  );

  return results
    .filter((r) => r.status === "fulfilled" && r.value?.next_episode)
    .map((r) => r.value);
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

/**
 * Render the "Up Next" grid – one card per show that still has unseen episodes.
 *
 * @param {Array} items  Output of fetchUpNext().
 */
function renderUpNext(items) {
  const container = $("#progress-list");

  if (!items.length) {
    container.innerHTML = "<p class='empty'>You're all caught up! No episodes left to watch.</p>";
    return;
  }

  const cards = items.map((item) => {
    const show = item.show;
    const title = escapeHtml(show.title ?? "Unknown");
    const year = show.year ? ` (${show.year})` : "";
    const showId = show.ids?.trakt ?? "";

    const next = item.next_episode;
    const episodeId = next.ids?.trakt ?? "";
    const seasonNum = next.season ?? 0;
    const episodeNum = next.number ?? 0;
    const epLabel = `${seasonNum}x${String(episodeNum).padStart(2, "0")}`;
    const epTitle = next.title ? escapeHtml(next.title) : "TBA";

    const completed = item.completed ?? 0;
    const aired = item.aired ?? 0;
    const left = aired - completed;
    const pct = aired > 0 ? Math.round((completed / aired) * 100) : 0;

    return `
      <li class="show-card up-next-card" data-id="${escapeHtml(String(showId))}">
        <div class="show-header">
          <h3 class="show-title">${title}<span class="show-year">${escapeHtml(year)}</span></h3>
          ${left > 0 ? `<span class="episodes-left">${left} left</span>` : ""}
        </div>
        <div class="next-episode">
          <span class="next-ep-badge">▶ ${escapeHtml(epLabel)}</span>
          <span class="next-ep-title">${epTitle}</span>
        </div>
        ${aired > 0 ? `
        <div class="progress-bar-wrap" title="${completed} / ${aired} episodes watched">
          <div class="progress-bar" style="width:${pct}%"></div>
        </div>
        <div class="show-meta">
          <span>${completed} / ${aired} episodes &nbsp;·&nbsp; ${pct}%</span>
        </div>` : ""}
        <div class="card-actions">
          <button
            class="btn btn-watched"
            data-episode-id="${escapeHtml(String(episodeId))}"
            data-show-id="${escapeHtml(String(showId))}"
            aria-label="Mark ${escapeHtml(epLabel)} of ${title} as watched"
          >✓ Mark as Watched</button>
        </div>
      </li>`;
  });

  container.innerHTML = `<ul class="show-list">${cards.join("")}</ul>`;

  // Attach mark-as-watched handlers after rendering
  container.querySelectorAll(".btn-watched").forEach((btn) => {
    btn.addEventListener("click", handleMarkWatched);
  });
}

/**
 * Handle a "Mark as Watched" button click:
 * calls the API, then either updates the card to show the new next episode
 * or removes the card when the show is fully caught up.
 *
 * @param {MouseEvent} event
 */
async function handleMarkWatched(event) {
  const btn = event.currentTarget;
  const episodeId = Number(btn.dataset.episodeId);
  const showId = btn.dataset.showId;
  const card = btn.closest(".show-card");

  btn.disabled = true;
  btn.textContent = "Marking…";

  try {
    await TraktAPI.markEpisodeWatched(episodeId);

    // Re-fetch this show's progress to find the new next episode
    const progress = await TraktAPI.getShowProgress(showId);

    if (progress.next_episode) {
      const next = progress.next_episode;
      const newEpisodeId = next.ids?.trakt ?? "";
      const epLabel = `${next.season}x${String(next.number).padStart(2, "0")}`;
      const epTitle = next.title ?? "TBA";

      const completed = progress.completed ?? 0;
      const aired = progress.aired ?? 0;
      const left = aired - completed;
      const pct = aired > 0 ? Math.round((completed / aired) * 100) : 0;

      card.querySelector(".next-ep-badge").textContent = `▶ ${epLabel}`;
      card.querySelector(".next-ep-title").textContent = epTitle;

      const leftEl = card.querySelector(".episodes-left");
      if (leftEl) leftEl.textContent = left > 0 ? `${left} left` : "";

      const barEl = card.querySelector(".progress-bar");
      if (barEl) barEl.style.width = `${pct}%`;

      const metaEl = card.querySelector(".show-meta span");
      if (metaEl) metaEl.textContent = `${completed}\u00a0/\u00a0${aired} episodes\u00a0\u00b7\u00a0${pct}%`;

      btn.dataset.episodeId = String(newEpisodeId);
      btn.disabled = false;
      btn.textContent = "✓ Mark as Watched";
    } else {
      // No more episodes – animate the card out then remove it
      card.classList.add("card-done");
      card.addEventListener("transitionend", () => card.remove(), { once: true });
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "✓ Mark as Watched";
    setStatus(`Failed to mark as watched: ${err.message}`, true);
  }
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
