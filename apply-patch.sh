 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/app.js b/app.js
index 4b9b27d1522a016ae7be44c5d8426e7985d2af58..4fe7879bd3b89ef0f42e85211902dcbfd73884f2 100644
--- a/app.js
+++ b/app.js
@@ -374,104 +374,138 @@
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
 
-    seasonSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
+    // Populate season options safely
+    seasonSelect.replaceChildren(
+      ...years.map(y => {
+        const opt = el("option");
+        opt.value = String(y);
+        opt.textContent = String(y);
+        return opt;
+      })
+    );
     // default season per config
     const defaultSeason = currentYear;
     seasonSelect.value = defaultSeason;
     STATE.season = defaultSeason;
 
     // Weeks: 1..15 default; will refine if API returns
-    weekSelect.innerHTML = Array.from({ length: 15 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
+    weekSelect.replaceChildren(
+      ...Array.from({ length: 15 }, (_, i) => {
+        const opt = el("option");
+        const val = String(i + 1);
+        opt.value = val;
+        opt.textContent = val;
+        return opt;
+      })
+    );
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
-    const opts = [`<option value="">All Power 5</option>`]
-      .concat(POWER_CONFS.map(c => `<option value="${c}">${c}</option>`));
-    confSelect.innerHTML = opts.join("");
+    // Build conference options without using innerHTML
+    confSelect.replaceChildren();
+    const defaultOpt = el("option");
+    defaultOpt.value = "";
+    defaultOpt.textContent = "All Power 5";
+    confSelect.appendChild(defaultOpt);
+    POWER_CONFS.forEach(c => {
+      const opt = el("option");
+      opt.value = c;
+      opt.textContent = c;
+      confSelect.appendChild(opt);
+    });
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
-    const opts = [`<option value="">All Teams</option>`]
-      .concat(STATE.teams.map(t => `<option value="${t.school}">${t.school}</option>`));
-    teamSelect.innerHTML = opts.join("");
+    // Populate team options using DOM methods to avoid unsafe HTML
+    teamSelect.replaceChildren();
+    const defaultOpt = el("option");
+    defaultOpt.value = "";
+    defaultOpt.textContent = "All Teams";
+    teamSelect.appendChild(defaultOpt);
+    STATE.teams.forEach(t => {
+      const opt = el("option");
+      opt.value = t.school;
+      opt.textContent = t.school;
+      teamSelect.appendChild(opt);
+    });
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
@@ -725,106 +759,113 @@
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
-    playersTbody.innerHTML = "";
+    playersTbody.replaceChildren();
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
-    favoritesList.innerHTML = "";
+    favoritesList.replaceChildren();
     const map = new Map(STATE.players.map(p => [p.id, p]));
     for (const id of STATE.favorites) {
       const p = map.get(id);
       const li = el("li");
       if (!p) {
         li.textContent = id;
       } else {
-        li.innerHTML = `<strong>${p.name}</strong> — ${p.team} • ${p.pos}<br><span class="muted">Proj: ${fmt(p.proj)} • Boom: ${pct(p.boom)}</span>`;
+        const nameEl = el("strong");
+        nameEl.textContent = p.name;
+        li.appendChild(nameEl);
+        li.appendChild(document.createTextNode(` — ${p.team} • ${p.pos}`));
+        li.appendChild(el("br"));
+        const span = el("span", "muted");
+        span.textContent = `Proj: ${fmt(p.proj)} • Boom: ${pct(p.boom)}`;
+        li.appendChild(span);
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
@@ -912,65 +953,72 @@
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
 
-    boomList.innerHTML = "";
+    boomList.replaceChildren();
     top.forEach((p, i) => {
       const li = el("li");
-      li.innerHTML = `<strong>#${i + 1} ${p.name}</strong> — ${p.team} • ${p.pos}
-        <span class="muted">vs ${p.opponent || "TBD"} (${p.homeAway || "—"})</span>
-        <div class="muted">Proj: ${fmt(p.proj)} • Boom: ${pct(p.boom)} • Usage: ${pct(p.usage)}</div>`;
+      const strong = el("strong");
+      strong.textContent = `#${i + 1} ${p.name}`;
+      li.appendChild(strong);
+      li.appendChild(document.createTextNode(` — ${p.team} • ${p.pos} `));
+      const span = el("span", "muted");
+      span.textContent = `vs ${p.opponent || "TBD"} (${p.homeAway || "—"})`;
+      li.appendChild(span);
+      const div = el("div", "muted");
+      div.textContent = `Proj: ${fmt(p.proj)} • Boom: ${pct(p.boom)} • Usage: ${pct(p.usage)}`;
+      li.appendChild(div);
       boomList.appendChild(li);
     });
     boomLoading.classList.add("hidden");
   }
 
   // ---------- Compare ----------
   function renderCompareUI() {
     compareBtn.querySelector("#compareCount").textContent = String(STATE.compare.length);
-    compareSlots.innerHTML = "";
+    compareSlots.replaceChildren();
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
 
EOF
)
