/* ============================================================
   Peezy’s Ball Numbers — app.js
   Client-only app for CFB fantasy insights (Power 5 focus)
   Uses CollegeFootballData API (https://api.collegefootballdata.com)
   ============================================================ */

(() => {
  // ---------- Config ----------
  const APP_CONFIG = JSON.parse(document.getElementById("app-config").textContent);
  const API_BASE = "https://api.collegefootballdata.com";
  let API_KEY = "";

  async function loadApiKey() {
    try {
      const res = await fetch("/api-key");
      if (!res.ok) throw new Error("Failed to load API key");
      const data = await res.json();
      API_KEY = data.key || "";
    } catch (err) {
      console.error("Unable to retrieve API key", err);
    }
  }
  const POWER_CONFS = APP_CONFIG?.conferences || ["ACC", "Big Ten", "Big 12", "SEC", "Pac-12"];

  // ---------- DOM helpers ----------
  const qs = (sel, el = document) => el.querySelector(sel);
  const qsa = (sel, el = document) => [...el.querySelectorAll(sel)];
  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };

  // ---------- Elements ----------
  const seasonSelect = qs("#seasonSelect");
  const weekSelect = qs("#weekSelect");
  const confSelect = qs("#confSelect");
  const teamSelect = qs("#teamSelect");
  const posSelect = qs("#posSelect");
  const searchInput = qs("#searchInput");
  const refreshBtn = qs("#refreshBtn");
  const exportBtn = qs("#exportBtn");
  const scoringBtn = qs("#scoringBtn");
  const favoritesBtn = qs("#favoritesBtn");
  const compareBtn = qs("#compareBtn");
  const apiStatus = qs("#apiStatus");
  const lastUpdated = qs("#lastUpdated");

  const tabPlayers = qs("#tabPlayers");
  const tabTeams = qs("#tabTeams");
  const tabBoom = qs("#tabBoom");
  const tabCompare = qs("#tabCompare");

  const playersView = qs("#playersView");
  const teamsView = qs("#teamsView");
  const boomView = qs("#boomView");
  const compareView = qs("#compareView");

  const playersTable = qs("#playersTable");
  const playersTbody = qs("#playersTbody");
  const rowCount = qs("#rowCount");
  const playersEmpty = qs("#playersEmpty");
  const playersLoading = qs("#playersLoading");
  const prevPageBtn = qs("#prevPage");
  const nextPageBtn = qs("#nextPage");
  const pageInfo = qs("#pageInfo");
  const clearFiltersBtn = qs("#clearFiltersBtn");

  const chartGameByGame = qs("#chartGameByGame");
  const chartRollingAvg = qs("#chartRollingAvg");
  const chartUsageShare = qs("#chartUsageShare");

  const chartTeamPace = qs("#chartTeamPace");
  const chartTeamEPA = qs("#chartTeamEPA");
  const chartRedZone = qs("#chartRedZone");
  const chartPaceVsOpp = qs("#chartPaceVsOpp");

  const favoritesDrawer = qs("#favoritesDrawer");
  const closeFavorites = qs("#closeFavorites");
  const favoritesList = qs("#favoritesList");

  const scoringModal = qs("#scoringModal");
  const scoringForm = qs("#scoringForm");
  const resetScoringBtn = qs("#resetScoring");
  const closeScoringBtn = qs("#closeScoring");

  const boomList = qs("#boomList");
  const recalcBoomBtn = qs("#recalcBoom");
  const boomCountSelect = qs("#boomCount");
  const boomLoading = qs("#boomLoading");
  const weightsForm = qs("#weightsForm");

  const compareSlots = qs("#compareSlots");
  const chartComparePoints = qs("#chartComparePoints");

  // ---------- State ----------
  const SKEY = {
    scoring: "pb_numbers_scoring_v1",
    weights: "pb_numbers_weights_v1",
    favorites: "pb_numbers_favs_v1",
    compare: "pb_numbers_compare_v1",
    cache: "pb_numbers_cache_v1",
  };

  let STATE = {
    season: new Date().getFullYear(),
    week: 1,
    seasonType: APP_CONFIG?.season?.includePostseason ? "both" : "regular",
    conference: "",
    team: "",
    position: "",
    search: "",
    page: 1,
    pageSize: 50,
    sortKey: "proj",
    sortDir: "desc",
    players: [], // normalized player rows for current filters/week
    teams: [],   // team metadata
    gamesIndex: {}, // key: `${team}|${week}|${season}` -> { opponent, homeAway, startDate }
    ratingsDefense: {}, // key: team -> defense rating
    pace: {}, // team -> pace
    depth: {}, // team -> depth chart info (optional)
    favorites: loadLS(SKEY.favorites, []),
    compare: loadLS(SKEY.compare, []), // array of player keys
    scoring: loadLS(SKEY.scoring, APP_CONFIG?.scoring?.custom || defaultScoring()),
    weights: loadLS(SKEY.weights, APP_CONFIG?.boomModel?.weights || defaultWeights()),
    cache: loadLS(SKEY.cache, {}),
  };

  // ---------- Utilities ----------
  function loadLS(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveLS(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
  function fmt(n, digits = 1) {
    return Number.isFinite(n) ? n.toFixed(digits) : "—";
  }
  function pct(n) { return Number.isFinite(n) ? `${(n * 100).toFixed(0)}%` : "—"; }
  function title(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

  function defaultScoring() {
    return {
      passYard: 0.04, passTd: 4, interception: -2,
      rushYard: 0.1, rushTd: 6,
      recYard: 0.1, recTd: 6,
      reception: 1, twoPt: 2, fumble: -2,
      bonuses: [
        { stat: "passYards", threshold: 300, points: 3 },
        { stat: "rushYards", threshold: 100, points: 3 },
        { stat: "recYards", threshold: 100, points: 3 },
      ],
    };
  }
  function defaultWeights() {
    return { recentForm: 0.5, opponentDefense: 0.3, homeAway: 0.1, usage: 0.1 };
  }

  function setStatus(ok, msg) {
    apiStatus.textContent = ok ? `API: OK` : `API: ${msg || "Error"}`;
    apiStatus.style.background = ok ? "linear-gradient(180deg, rgba(34,211,238,.25), rgba(34,211,238,.08))"
                                    : "linear-gradient(180deg, rgba(248,113,113,.25), rgba(248,113,113,.08))";
  }

  function updateTimestamp() {
    const d = new Date();
    lastUpdated.textContent = `Last updated ${d.toLocaleString()}`;
  }

  // Query string builder
  function qsBuild(params = {}) {
    const u = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      if (Array.isArray(v)) v.forEach(val => u.append(k, val));
      else u.append(k, v);
    });
    return u.toString();
  }

  // Basic in-memory throttling of parallel requests
  const MAX_PAR = APP_CONFIG?.data?.cache?.maxParallel || 4;
  let inflight = 0;
  const queue = [];
  async function withThrottle(fn) {
    if (inflight >= MAX_PAR) {
      await new Promise(res => queue.push(res));
    }
    inflight++;
    try {
      const res = await fn();
      return res;
    } finally {
      inflight--;
      const next = queue.shift();
      if (next) next();
    }
  }

  // Core fetch with retry/backoff + CORS headers
  async function cfbd(path, params = {}, { useCache = true } = {}) {
    const url = `${API_BASE}${path}${Object.keys(params).length ? "?" + qsBuild(params) : ""}`;
    const cacheKey = `CFBD:${url}`;
    const cached = STATE.cache[cacheKey];
    const ttlHours = APP_CONFIG?.data?.cache?.ttlHours;
    const ttlMs = ttlHours > 0 ? ttlHours * 60 * 60 * 1000 : null;
    const now = Date.now();
    if (useCache && cached) {
      const { data, ts } = cached;
      if (!ttlMs || (ts && now - ts < ttlMs)) {
        return data;
      }
      delete STATE.cache[cacheKey];
      saveLS(SKEY.cache, STATE.cache);
    }

    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    };

    const attempt = async (tryNo) => {
      const resp = await fetch(url, { headers });
      if (resp.ok) return resp.json();
      if (resp.status === 429 || resp.status >= 500) {
        // backoff
        if (tryNo < 3) {
          await sleep(400 * tryNo);
          return attempt(tryNo + 1);
        }
      }
      const txt = await resp.text();
      throw new Error(`${resp.status} ${resp.statusText}: ${txt}`);
    };

    return withThrottle(async () => {
      const data = await attempt(1);
      // cache
      STATE.cache[cacheKey] = { ts: Date.now(), data };
      saveLS(SKEY.cache, STATE.cache);
      return data;
    });
  }

  // ---------- Bootstrap ----------
  (async function init() {
    try {
      setStatus(true);
      wireEvents();
      await loadApiKey();
      await populateSeasons();
      await determineCurrentWeek();
      await populateConferences();
      await populateTeams();
      await hydrateAuxData(); // ratings (defense), pace (team)
      await refreshAll();
      updateTimestamp();
    } catch (err) {
      console.error(err);
      setStatus(false, "Init failed");
    }
  })();

  function wireEvents() {
    // Tabs
    [ [tabPlayers, playersView], [tabTeams, teamsView], [tabBoom, boomView], [tabCompare, compareView] ].forEach(([tab, view]) => {
      tab.addEventListener("click", () => {
        qsa(".tab").forEach(t => t.classList.remove("active"));
        qsa(".panel").forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        view.classList.add("active");
        if (view === compareView) renderCompareChart();
      });
    });

    // Selects & Search
    seasonSelect.addEventListener("change", async () => {
      STATE.season = Number(seasonSelect.value);
      await populateTeams(true);
      await hydrateAuxData(true);
      await refreshAll();
    });
    weekSelect.addEventListener("change", async () => {
      STATE.week = Number(weekSelect.value);
      await refreshAll();
    });
    confSelect.addEventListener("change", async () => {
      STATE.conference = confSelect.value;
      await populateTeams(true);
      await refreshAll();
    });
    teamSelect.addEventListener("change", async () => {
      STATE.team = teamSelect.value;
      await refreshAll();
    });
    posSelect.addEventListener("change", () => {
      STATE.position = posSelect.value;
      renderPlayersTable();
      renderBoomList(); // keep boom filtered by pos/team if desired
    });
    searchInput.addEventListener("input", () => {
      STATE.search = searchInput.value.trim().toLowerCase();
      STATE.page = 1;
      renderPlayersTable();
    });

    // Buttons
    refreshBtn.addEventListener("click", async () => {
      // bust week-scoped caches to force fresh pulls for players/games lines only
      softBustCacheForWeek(STATE.season, STATE.week);
      await refreshAll();
      updateTimestamp();
    });
    exportBtn.addEventListener("click", () => exportCSV());
    favoritesBtn.addEventListener("click", () => favoritesDrawer.setAttribute("aria-hidden", favoritesDrawer.getAttribute("aria-hidden") === "true" ? "false" : "true"));
    closeFavorites.addEventListener("click", () => favoritesDrawer.setAttribute("aria-hidden", "true"));
    clearFiltersBtn.addEventListener("click", async () => {
      confSelect.value = "";
      teamSelect.value = "";
      posSelect.value = "";
      searchInput.value = "";
      STATE.conference = "";
      STATE.team = "";
      STATE.position = "";
      STATE.search = "";
      STATE.page = 1;
      await populateTeams(true);
      renderPlayersTable();
      renderBoomList();
    });

    // Pagination
    prevPageBtn.addEventListener("click", () => { if (STATE.page > 1) { STATE.page--; renderPlayersTable(); } });
    nextPageBtn.addEventListener("click", () => { STATE.page++; renderPlayersTable(); });

    // Sorting
    qsa("th[data-sort]", playersTable).forEach(th => {
      th.addEventListener("click", () => {
        const key = th.getAttribute("data-sort");
        if (STATE.sortKey === key) {
          STATE.sortDir = STATE.sortDir === "asc" ? "desc" : "asc";
        } else {
          STATE.sortKey = key;
          STATE.sortDir = key === "name" ? "asc" : "desc";
        }
        qsa("th[data-sort]", playersTable).forEach(h => h.removeAttribute("aria-sort"));
        th.setAttribute("aria-sort", STATE.sortDir === "asc" ? "ascending" : "descending");
        renderPlayersTable();
      });
    });

    // Scoring modal
    scoringBtn.addEventListener("click", () => openScoring());
    closeScoringBtn.addEventListener("click", () => closeScoring());
    scoringForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(scoringForm);
      const toNum = (k) => Number(fd.get(k));
      STATE.scoring = {
        passYard: toNum("passYard"),
        passTd: toNum("passTd"),
        interception: toNum("interception"),
        rushYard: toNum("rushYard"),
        rushTd: toNum("rushTd"),
        recYard: toNum("recYard"),
        recTd: toNum("recTd"),
        reception: toNum("reception"),
        twoPt: toNum("twoPt"),
        fumble: toNum("fumble"),
        bonuses: [
          { stat: fd.get("bonusStat1"), threshold: Number(fd.get("bonusThresh1")), points: Number(fd.get("bonusPts1")) },
          { stat: fd.get("bonusStat2"), threshold: Number(fd.get("bonusThresh2")), points: Number(fd.get("bonusPts2")) },
          { stat: fd.get("bonusStat3"), threshold: Number(fd.get("bonusThresh3")), points: Number(fd.get("bonusPts3")) },
        ],
      };
      saveLS(SKEY.scoring, STATE.scoring);
      closeScoring();
      // Recompute projections/boom
      computeAllFantasy();
      renderPlayersTable();
      renderBoomList();
    });
    resetScoringBtn.addEventListener("click", () => {
      STATE.scoring = defaultScoring();
      saveLS(SKEY.scoring, STATE.scoring);
      setScoringForm(STATE.scoring);
    });

    // Boom model weights
    weightsForm.addEventListener("submit", (e) => e.preventDefault());
    qsa("input", weightsForm).forEach(inp => {
      inp.addEventListener("change", () => {
        STATE.weights = {
          recentForm: Number(qs("#wRecent").value),
          opponentDefense: Number(qs("#wDefense").value),
          homeAway: Number(qs("#wHome").value),
          usage: Number(qs("#wUsage").value),
        };
        saveLS(SKEY.weights, STATE.weights);
        renderBoomList();
      });
    });
    recalcBoomBtn.addEventListener("click", () => renderBoomList());
    boomCountSelect.addEventListener("change", () => renderBoomList());
  }

  // ---------- Populate selects ----------
  async function populateSeasons() {
    // CFBD supports many years; keep reasonable range
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear; y >= currentYear - 10; y--) years.push(y);

    seasonSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
    // default season per config
    const defaultSeason = currentYear;
    seasonSelect.value = defaultSeason;
    STATE.season = defaultSeason;

    // Weeks: 1..15 default; will refine if API returns
    weekSelect.innerHTML = Array.from({ length: 15 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
  }

  async function determineCurrentWeek() {
    try {
      // Try /calendar or /weeks to find current week in regular season
      const weeks = await cfbd("/weeks", { year: STATE.season, seasonType: "regular" });
      const current = weeks?.find(w => w?.currentWeek) || weeks?.find(w => w?.lastWeek) || weeks?.[0];
      if (current?.week) {
        STATE.week = Number(current.week);
        weekSelect.value = String(STATE.week);
      }
    } catch {
      // fallback week 1
      STATE.week = 1;
      weekSelect.value = "1";
    }
  }

  async function populateConferences() {
    const opts = [`<option value="">All Power 5</option>`]
      .concat(POWER_CONFS.map(c => `<option value="${c}">${c}</option>`));
    confSelect.innerHTML = opts.join("");
    confSelect.value = "";
    STATE.conference = "";
  }

  async function populateTeams(resetTeam = false) {
    let teams = [];
    try {
      if (STATE.conference) {
        const data = await cfbd("/teams", { year: STATE.season, conference: STATE.conference });
        teams = data || [];
      } else {
        // Load all Power 5 teams
        const lists = await Promise.all(
          POWER_CONFS.map(c => cfbd("/teams", { year: STATE.season, conference: c }))
        );
        teams = lists.flat().filter(Boolean);
      }
    } catch (e) {
      console.warn("teams", e);
    }
    STATE.teams = dedupeBy(teams, t => `${t.school}|${t.conference}`);
    const opts = [`<option value="">All Teams</option>`]
      .concat(STATE.teams.map(t => `<option value="${t.school}">${t.school}</option>`));
    teamSelect.innerHTML = opts.join("");
    if (resetTeam) {
      STATE.team = "";
      teamSelect.value = "";
    }
  }

  function dedupeBy(arr, keyFn) {
    const seen = new Set();
    const out = [];
    for (const x of arr) {
      const k = keyFn(x);
      if (!seen.has(k)) { seen.add(k); out.push(x); }
    }
    return out;
  }

  // ---------- Aux data (ratings, pace, schedule index) ----------
  async function hydrateAuxData(bust = false) {
    try {
      if (bust) softBustCache(/^CFBD:https:\/\/api\.collegefootballdata\.com\/ratings\/sp/i);
      const ratings = await cfbd("/ratings/sp", { year: STATE.season });
      STATE.ratingsDefense = {};
      ratings?.forEach(r => {
        // Use SP+ defense (lower is better). Fields can be defense?.rating or 'defense' number.
        const def = r?.spRatings?.defense?.rating ?? r?.defense ?? r?.defenseRating ?? null;
        if (def != null) STATE.ratingsDefense[r.team] = Number(def);
      });
    } catch (e) {
      console.warn("ratings", e);
    }
    try {
      const p = await cfbd("/metrics/pace", { year: STATE.season });
      STATE.pace = {};
      p?.forEach(x => {
        const team = x.team || x.school;
        const pace = Number(x?.playsPerGame ?? x?.secondsPerPlay ? (1 / Number(x.secondsPerPlay)) : x?.pace ?? 0);
        STATE.pace[team] = Number.isFinite(pace) ? pace : 0;
      });
    } catch (e) {
      console.warn("pace", e);
    }

    // Build schedule index for opponent/home/away (current week only, keep light)
    try {
      const games = await cfbd("/games", { year: STATE.season, week: STATE.week, seasonType: "regular" }, { useCache: false });
      STATE.gamesIndex = {};
      for (const g of games || []) {
        const home = g.home_team || g.homeTeam || g.home;
        const away = g.away_team || g.awayTeam || g.away;
        const start = g.start_date || g.startDate;
        if (!home || !away) continue;
        STATE.gamesIndex[`${home}|${STATE.week}|${STATE.season}`] = { opponent: away, homeAway: "H", startDate: start };
        STATE.gamesIndex[`${away}|${STATE.week}|${STATE.season}`] = { opponent: home, homeAway: "A", startDate: start };
      }
    } catch (e) {
      console.warn("games index", e);
    }
  }

  function softBustCacheForWeek(season, week) {
    const re = new RegExp(`^CFBD:${API_BASE.replace(/\//g, "\\/")}\\/.*(year|season)=${season}.*(week=${week}|week%3D${week})`, "i");
    softBustCache(re);
  }
  function softBustCache(regex) {
    Object.keys(STATE.cache).forEach(k => {
      if (regex.test(k)) delete STATE.cache[k];
    });
    saveLS(SKEY.cache, STATE.cache);
  }

  // ---------- Refresh core data ----------
  async function refreshAll() {
    setStatus(true, "Loading");
    playersLoading.classList.remove("hidden");
    try {
      const [playersWeek] = await Promise.all([
        fetchPlayersWeek(STATE.season, STATE.week, STATE.conference, STATE.team),
        // optionally prefetch prior weeks for recent form when rendering
      ]);
      STATE.players = normalizePlayers(playersWeek);
      computeAllFantasy();
      renderPlayersTable();
      renderFavoritesUI();
      await renderTeamsDash();
      renderBoomList();
      renderCompareUI(); // rehydrate compare cards
      setStatus(true, "OK");
    } catch (e) {
      console.error(e);
      setStatus(false, e.message || "Error");
    } finally {
      playersLoading.classList.add("hidden");
    }
  }

  // ---------- Fetchers ----------
  async function fetchPlayersWeek(year, week, conference = "", team = "") {
    // CFBD /games/players returns player game stats
    const params = { year, week, seasonType: "regular" };
    if (conference) params.conference = conference;
    if (team) params.team = team;
    try {
      const data = await cfbd("/games/players", params, { useCache: false });
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn("playersWeek", e);
      return [];
    }
  }

  async function fetchPlayerRecentGames(playerId, year, upToWeek, n = 3) {
    // CFBD doesn't index by playerId directly across the endpoint in a simple way from browser.
    // Fallback: pull weeks [upToWeek - n + 1 .. upToWeek] and filter by player name+team match (approx).
    // We'll pass a key object instead for better matching.
    return []; // We compute recent form from STATE.players cache or set 0 if unavailable; optional heavy pull skipped for client.
  }

  // ---------- Normalization & Fantasy ----------
  function normalizePlayers(rawRows) {
    // The /games/players format can include nested categories. We'll map defensively.
    // Unified schema per row:
    // { id, name, team, pos, opponent, homeAway, usage, stats: {...}, points, avg, proj, boomProb }
    const rows = [];

    for (const r of rawRows) {
      // Common fields across versions
      const name = r.player || r.player_name || r.athlete || r.name || "Unknown";
      const team = r.team || r.team_name || r.school || r.player_team || r.teamSchool || r.teamAbbr || r.teamId || r.team1 || r?.team?.name || "Unknown";
      const pos = (r.position || r.player_position || r.pos || "").toUpperCase();
      // Opponent/homeAway from gamesIndex if we can
      const gi = STATE.gamesIndex[`${team}|${STATE.week}|${STATE.season}`] || {};
      const opponent = r.opponent || r.opponent_team || gi.opponent || "";
      const homeAway = r.home_away || r.homeAway || gi.homeAway || "—";

      // Stats extraction (defensive defaults)
      // CFBD keys we try (case-insensitive-ish)
      const s = keyPick(r, [
        "completions", "attempts", "passCompletions", "passAttempts",
        "passingYards", "passYards", "netPassingYards", "yardsPassing",
        "passingTD", "passTD", "passingTouchdowns",
        "interceptions", "interception",
        "rushingYards", "rushYards", "yardsRushing",
        "rushingTD", "rushTD",
        "rushingAttempts", "rushAttempts", "carries",
        "receptions", "targets",
        "receivingYards", "recYards",
        "receivingTD", "recTD",
        "fumbles", "fumblesLost",
        "twoPointRush", "twoPointPass", "twoPointRecv", "twoPoint",
      ]);

      const stats = {
        passYards: num(s.passingYards ?? s.passYards ?? s.netPassingYards ?? s.yardsPassing),
        passTD: num(s.passingTD ?? s.passTD ?? s.passingTouchdowns),
        interceptions: num(s.interceptions ?? s.interception),
        rushYards: num(s.rushingYards ?? s.rushYards ?? 0),
        rushTD: num(s.rushingTD ?? s.rushTD ?? 0),
        rushAtt: num(s.rushingAttempts ?? s.rushAttempts ?? s.carries),
        receptions: num(s.receptions ?? 0),
        targets: num(s.targets ?? 0),
        recYards: num(s.receivingYards ?? s.recYards ?? 0),
        recTD: num(s.receivingTD ?? s.recTD ?? 0),
        fumbles: num(s.fumblesLost ?? s.fumbles ?? 0),
        twoPt: num(s.twoPointRush ?? 0) + num(s.twoPointPass ?? 0) + num(s.twoPointRecv ?? 0) + num(s.twoPoint ?? 0),
      };

      // Usage proxy: touches share vs approximate team total in this game
      // If we have rushAtt + targets + receptions (for WR/TE), use that; for QB, use pass attempts + rushAtt
      const touches = (stats.rushAtt || 0) + (stats.receptions || 0) + (stats.targets ? Math.max(0, stats.targets - stats.receptions) : 0);
      const qbTouches = (num(s.passAttempts ?? s.attempts) || 0) + (stats.rushAtt || 0);
      const totalProxy = qbTouches + touches || (stats.rushAtt + stats.receptions) || 1;
      const usage = pos === "QB" ? safeDiv(qbTouches, Math.max(qbTouches, 1)) : safeDiv(touches, Math.max(totalProxy, 1));

      // Compose row
      const id = `${name}|${team}|${pos}`; // stable key
      rows.push({
        id, name, team, pos, opponent, homeAway,
        stats,
        usage,
        // placeholders computed later
        points: 0,
        recent: 0,
        avg: 0,
        proj: 0,
        boom: 0,
      });
    }

    return rows;
  }

  function keyPick(obj, keys) {
    const out = {};
    for (const k of keys) {
      if (k in obj) out[k] = obj[k];
    }
    return out;
  }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  function safeDiv(a, b) { return b ? a / b : 0; }

  function computeAllFantasy() {
    // Compute week points for each player using STATE.scoring
    const sc = STATE.scoring;
    for (const p of STATE.players) {
      const s = p.stats;
      let pts = 0;
      pts += s.passYards * sc.passYard;
      pts += s.passTD * sc.passTd;
      pts += s.interceptions * sc.interception;
      pts += s.rushYards * sc.rushYard;
      pts += s.rushTD * sc.rushTd;
      pts += s.recYards * sc.recYard;
      pts += s.recTD * sc.recTd;
      pts += s.receptions * sc.reception;
      pts += s.twoPt * sc.twoPt;
      pts += s.fumbles * sc.fumble;

      // Bonuses
      sc.bonuses?.forEach(b => {
        if (!b || b.points === 0) return;
        const val = ({
          passYards: s.passYards, rushYards: s.rushYards, recYards: s.recYards,
        })[b.stat] || 0;
        if (val >= Number(b.threshold)) pts += Number(b.points);
      });

      p.points = round2(pts);
      p.recent = p.points; // For now, single-week sample; we can extend to rolling later
      p.avg = p.points;    // Season-to-date average could be fetched; keep = week pts as MVP
    }

    // Projection & boom using heuristic
    const defMin = Math.min(...Object.values(STATE.ratingsDefense || { _: 0 }));
    const defMax = Math.max(...Object.values(STATE.ratingsDefense || { _: 1 }));
    const defSpan = defMax - defMin || 1;

    for (const p of STATE.players) {
      const w = STATE.weights;
      // Opponent defense: normalize inverse (harder D -> lower score)
      const opp = p.opponent || "";
      const dRating = STATE.ratingsDefense[opp];
      const defNormInv = dRating == null ? 0.5 : (1 - ((dRating - defMin) / defSpan));
      // Home field
      const homeBump = p.homeAway === "H" ? 1 : 0;
      // Usage already 0..1ish
      const recentNorm = clamp(p.recent / Math.max(30, p.recent, 1), 0, 1); // crude norm vs 30pt game
      const usageNorm = clamp(p.usage, 0, 1);

      const score = w.recentForm * recentNorm +
                    w.opponentDefense * defNormInv +
                    w.homeAway * homeBump +
                    w.usage * usageNorm;

      // Projected = points * (0.8 + 0.6*score) -> 0.8x..1.4x
      p.proj = round2(p.points * (0.8 + 0.6 * score));
      // Boom probability = nonlinear scale of score
      p.boom = clamp(score ** 1.2, 0, 1);
    }
  }

  function round2(n) { return Math.round(n * 100) / 100; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // ---------- Rendering: Players ----------
  function renderPlayersTable() {
    // Filter
    let rows = STATE.players.slice();
    if (STATE.position) rows = rows.filter(r => r.pos === STATE.position);
    if (STATE.conference) {
      const set = new Set(STATE.teams.filter(t => t.conference === STATE.conference).map(t => t.school));
      rows = rows.filter(r => set.has(r.team));
    }
    if (STATE.team) rows = rows.filter(r => r.team === STATE.team);
    if (STATE.search) {
      const s = STATE.search;
      rows = rows.filter(r => r.name.toLowerCase().includes(s) || r.team.toLowerCase().includes(s));
    }

    // Sort
    const dir = STATE.sortDir === "asc" ? 1 : -1;
    const key = STATE.sortKey;
    rows.sort((a, b) => {
      const va = (a[key] ?? (a.stats?.[key] ?? "")).toString().toLowerCase();
      const vb = (b[key] ?? (b.stats?.[key] ?? "")).toString().toLowerCase();
      const na = Number(va), nb = Number(vb);
      if (Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * dir;
      return va.localeCompare(vb) * dir;
    });

    // Pagination
    const start = (STATE.page - 1) * STATE.pageSize;
    const pageRows = rows.slice(start, start + STATE.pageSize);
    const totalPages = Math.max(1, Math.ceil(rows.length / STATE.pageSize));
    if (STATE.page > totalPages) STATE.page = totalPages;

    // Render
    playersTbody.innerHTML = "";
    const tpl = qs("#playerRowTpl");
    for (const r of pageRows) {
      const tr = tpl.content.firstElementChild.cloneNode(true);
      tr.querySelector(".player-name").textContent = r.name;
      tr.querySelector(".team").textContent = r.team;
      tr.querySelector(".pos").textContent = r.pos || "—";
      tr.querySelector(".opp").textContent = r.opponent || "—";
      tr.querySelector(".home").textContent = r.homeAway || "—";
      tr.querySelector(".usage").textContent = pct(r.usage);
      tr.querySelector(".avg").textContent = fmt(r.avg, 1);
      tr.querySelector(".proj").textContent = fmt(r.proj, 1);
      tr.querySelector(".boom").textContent = pct(r.boom);

      // Favorite toggle
      const favBtn = tr.querySelector(".fav-btn");
      const favActive = STATE.favorites.includes(r.id);
      if (favActive) favBtn.classList.add("active");
      favBtn.addEventListener("click", () => toggleFavorite(r.id, favBtn));

      // Trend charts hook
      tr.querySelector(".trend").addEventListener("click", () => showTrendsFor(r));

      // Compare add
      tr.querySelector(".add-compare").addEventListener("click", () => addToCompare(r.id));

      playersTbody.appendChild(tr);
    }

    // UI states
    rowCount.textContent = `${rows.length} players`;
    playersEmpty.classList.toggle("hidden", rows.length > 0);
    pageInfo.textContent = `Page ${STATE.page} / ${totalPages}`;
    prevPageBtn.disabled = STATE.page <= 1;
    nextPageBtn.disabled = STATE.page >= totalPages;
  }

  function toggleFavorite(id, btn) {
    const idx = STATE.favorites.indexOf(id);
    if (idx >= 0) STATE.favorites.splice(idx, 1);
    else STATE.favorites.push(id);
    saveLS(SKEY.favorites, STATE.favorites);
    if (btn) btn.classList.toggle("active");
    renderFavoritesUI();
  }

  function renderFavoritesUI() {
    favoritesList.innerHTML = "";
    const map = new Map(STATE.players.map(p => [p.id, p]));
    for (const id of STATE.favorites) {
      const p = map.get(id);
      const li = el("li");
      if (!p) {
        li.textContent = id;
      } else {
        li.innerHTML = `<strong>${p.name}</strong> — ${p.team} • ${p.pos}<br><span class="muted">Proj: ${fmt(p.proj)} • Boom: ${pct(p.boom)}</span>`;
      }
      favoritesList.appendChild(li);
    }
  }

  // ---------- Trends (Charts) ----------
  let CHARTS = { game: null, rolling: null, usage: null, compare: null };

  async function showTrendsFor(player) {
    // MVP: show last N=1 (this week) game points and a small rolling avg with the same value
    const labels = [`Week ${STATE.week}`];
    const pts = [player.points];
    const roll = [player.points];
    const usage = [player.usage * 100];

    drawLine(chartGameByGame, "Game-by-Game Points", labels, pts, (c) => CHARTS.game = c);
    drawLine(chartRollingAvg, "Rolling Avg (3g)", labels, roll, (c) => CHARTS.rolling = c);
    drawLine(chartUsageShare, "Usage %", labels, usage, (c) => CHARTS.usage = c);
  }

  function drawLine(canvas, label, labels, data, setRef) {
    if (!canvas) return;
    const prev = getChartFor(canvas);
    if (prev) prev.destroy();
    const c = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [{ label, data, tension: 0.25, fill: false }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#9FB0C8" }, grid: { display: false } },
          y: { ticks: { color: "#9FB0C8" }, grid: { color: "rgba(255,255,255,0.06)" } },
        }
      }
    });
    setRef?.(c);
  }
  function getChartFor(canvas) {
    // Chart.js 4 keeps registry; easier to stash manually in our refs
    if (canvas === chartGameByGame) return CHARTS.game;
    if (canvas === chartRollingAvg) return CHARTS.rolling;
    if (canvas === chartUsageShare) return CHARTS.usage;
    if (canvas === chartComparePoints) return CHARTS.compare;
    return null;
  }

  // ---------- Teams dashboard ----------
  async function renderTeamsDash() {
    try {
      // Build arrays from STATE.pace and STATE.ratingsDefense for teams in current filter
      const curTeams = (STATE.team ? [STATE.team] :
        (STATE.conference
          ? STATE.teams.filter(t => t.conference === STATE.conference).map(t => t.school)
          : STATE.teams.map(t => t.school)));

      const labels = curTeams.slice(0, 20); // keep chart light
      const pace = labels.map(t => STATE.pace[t] ?? 0);
      const def = labels.map(t => STATE.ratingsDefense[t] ?? null);
      const defAdj = normalizeInverse(def);

      drawBar(chartTeamPace, "Pace (proxy)", labels, pace);
      drawBar(chartTeamEPA, "Defense (harder→higher)", labels, defAdj);
      // RedZone: not fetched in MVP; stub with zeros
      drawBar(chartRedZone, "Red Zone (placeholder)", labels, labels.map(() => 0));

      // Pace vs Opp for selected team
      const team = STATE.team || labels[0];
      const opp = STATE.gamesIndex[`${team}|${STATE.week}|${STATE.season}`]?.opponent || "—";
      const paceTeam = STATE.pace[team] ?? 0;
      const paceOpp = STATE.pace[opp] ?? 0;
      drawBar(chartPaceVsOpp, `Pace: ${team} vs ${opp}`, [team, opp], [paceTeam, paceOpp]);
      qs("#matchupSummary").textContent = team ? `${team} vs ${opp || "TBD"}` : "Select a team to view matchup.";
    } catch (e) {
      console.warn("teams dash", e);
    }
  }

  function drawBar(canvas, label, labels, data) {
    if (!canvas) return;
    const prev = getChartFor(canvas);
    if (prev) prev.destroy();
    const c = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: { labels, datasets: [{ label, data }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#9FB0C8" }, grid: { display: false } },
          y: { ticks: { color: "#9FB0C8" }, grid: { color: "rgba(255,255,255,0.06)" } },
        }
      }
    });
    // no ref saved for team mini charts
  }

  function normalizeInverse(arr) {
    const clean = arr.map(v => (v == null ? null : Number(v)));
    const finite = clean.filter(Number.isFinite);
    const mn = Math.min(...finite);
    const mx = Math.max(...finite);
    const span = mx - mn || 1;
    return clean.map(v => v == null ? 0.5 : (1 - ((v - mn) / span)));
  }

  // ---------- Boom list ----------
  function renderBoomList() {
    boomLoading.classList.remove("hidden");
    const n = Number(boomCountSelect.value) || (APP_CONFIG?.boomModel?.outputCount || 20);

    // Filter by current controls (pos/team/conf/search)
    let rows = STATE.players.slice();
    if (STATE.position) rows = rows.filter(r => r.pos === STATE.position);
    if (STATE.team) rows = rows.filter(r => r.team === STATE.team);
    if (STATE.conference) {
      const confTeams = new Set(STATE.teams.filter(t => t.conference === STATE.conference).map(t => t.school));
      rows = rows.filter(r => confTeams.has(r.team));
    }
    if (STATE.search) {
      const s = STATE.search;
      rows = rows.filter(r => r.name.toLowerCase().includes(s));
    }

    // Score already computed as p.boom; sort desc
    rows.sort((a, b) => (b.boom - a.boom));
    const top = rows.slice(0, n);

    boomList.innerHTML = "";
    top.forEach((p, i) => {
      const li = el("li");
      li.innerHTML = `<strong>#${i + 1} ${p.name}</strong> — ${p.team} • ${p.pos}
        <span class="muted">vs ${p.opponent || "TBD"} (${p.homeAway || "—"})</span>
        <div class="muted">Proj: ${fmt(p.proj)} • Boom: ${pct(p.boom)} • Usage: ${pct(p.usage)}</div>`;
      boomList.appendChild(li);
    });
    boomLoading.classList.add("hidden");
  }

  // ---------- Compare ----------
  function renderCompareUI() {
    compareBtn.querySelector("#compareCount").textContent = String(STATE.compare.length);
    compareSlots.innerHTML = "";
    const map = new Map(STATE.players.map(p => [p.id, p]));
    for (const id of STATE.compare) {
      const p = map.get(id);
      if (!p) continue;
      const tpl = qs("#compareCardTpl");
      const card = tpl.content.firstElementChild.cloneNode(true);
      card.querySelector(".name").textContent = p.name;
      card.querySelector(".team").textContent = p.team;
      card.querySelector(".pos").textContent = p.pos;
      card.querySelector(".remove").addEventListener("click", () => removeFromCompare(id));
      // mini chart with single point (MVP)
      const ctx = card.querySelector(".miniChart");
      new Chart(ctx.getContext("2d"), {
        type: "line",
        data: { labels: [`W${STATE.week}`], datasets: [{ label: "Pts", data: [p.points], tension: 0.3, fill: false }] },
        options: { plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } } }
      });
      compareSlots.appendChild(card);
    }
  }

  function addToCompare(id) {
    if (STATE.compare.includes(id)) return;
    if (STATE.compare.length >= 3) {
      alert("You can compare up to 3 players.");
      return;
    }
    STATE.compare.push(id);
    saveLS(SKEY.compare, STATE.compare);
    renderCompareUI();
  }

  function removeFromCompare(id) {
    const i = STATE.compare.indexOf(id);
    if (i >= 0) STATE.compare.splice(i, 1);
    saveLS(SKEY.compare, STATE.compare);
    renderCompareUI();
    renderCompareChart();
  }

  function renderCompareChart() {
    const labels = [`Week ${STATE.week}`];
    const map = new Map(STATE.players.map(p => [p.id, p]));
    const datasets = STATE.compare.map((id, idx) => {
      const p = map.get(id);
      return { label: p ? p.name : `Player ${idx + 1}`, data: [p ? p.points : 0], tension: 0.25, fill: false };
    });
    if (!datasets.length) return;
    if (CHARTS.compare) CHARTS.compare.destroy();
    CHARTS.compare = new Chart(chartComparePoints.getContext("2d"), {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: { legend: { display: true } },
        scales: {
          x: { ticks: { color: "#9FB0C8" }, grid: { display: false } },
          y: { ticks: { color: "#9FB0C8" }, grid: { color: "rgba(255,255,255,0.06)" } },
        }
      }
    });
  }

  // ---------- Scoring Modal Helpers ----------
  function openScoring() {
    setScoringForm(STATE.scoring);
    scoringModal.setAttribute("aria-hidden", "false");
  }
  function closeScoring() {
    scoringModal.setAttribute("aria-hidden", "true");
  }
  function setScoringForm(s) {
    scoringForm.passYard.value = s.passYard;
    scoringForm.passTd.value = s.passTd;
    scoringForm.interception.value = s.interception;
    scoringForm.rushYard.value = s.rushYard;
    scoringForm.rushTd.value = s.rushTd;
    scoringForm.recYard.value = s.recYard;
    scoringForm.recTd.value = s.recTd;
    scoringForm.reception.value = s.reception;
    scoringForm.twoPt.value = s.twoPt;
    scoringForm.fumble.value = s.fumble;

    const [b1, b2, b3] = s.bonuses || [];
    if (b1) { scoringForm.bonusStat1.value = b1.stat; scoringForm.bonusThresh1.value = b1.threshold; scoringForm.bonusPts1.value = b1.points; }
    if (b2) { scoringForm.bonusStat2.value = b2.stat; scoringForm.bonusThresh2.value = b2.threshold; scoringForm.bonusPts2.value = b2.points; }
    if (b3) { scoringForm.bonusStat3.value = b3.stat; scoringForm.bonusThresh3.value = b3.threshold; scoringForm.bonusPts3.value = b3.points; }
  }

  // ---------- Export ----------
  function exportCSV() {
    const headers = ["Player", "Team", "Pos", "Opp", "H/A", "Usage%", "Avg", "Proj", "Boom%"];
    const rows = qsa("#playersTbody tr").map(tr => {
      const tds = qsa("td", tr);
      return [
        tds[0]?.querySelector(".player-name")?.textContent || "",
        tds[1]?.textContent || "",
        tds[2]?.textContent || "",
        tds[3]?.textContent || "",
        tds[4]?.textContent || "",
        tds[5]?.textContent || "",
        tds[6]?.textContent || "",
        tds[7]?.textContent || "",
        tds[8]?.textContent || "",
      ];
    });

    const csv = [headers.join(","), ...rows.map(r => r.map(csvEscape).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = `peezy_ball_numbers_${STATE.season}_w${STATE.week}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  function csvEscape(s) {
    s = String(s ?? "");
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

})();
