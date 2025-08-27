// scripts/build-players.mjs
const yards = num(row.yards ?? row.yds ?? row.y ?? 0);
const attempts = num(row.attempts ?? row.att ?? 0);
const carries = num(row.carries ?? row.rush_att ?? 0);
const receptions = num(row.receptions ?? row.rec ?? 0);
const passTd = num(row.pass_td ?? row.p_td ?? 0);
const rushTd = num(row.rush_td ?? row.r_td ?? 0);
const recTd = num(row.rec_td ?? row.receiving_td ?? 0);
const genericTd = num(row.td ?? row.touchdowns ?? 0);


const cat = (category || '').toLowerCase();
if (cat.includes('pass')) {
w.passYds += yards;
w.plays += attempts;
w.tds += passTd || genericTd;
} else if (cat.includes('rush')) {
w.rushYds += yards;
w.plays += carries;
w.tds += rushTd || genericTd;
} else if (cat.includes('receiv') || cat.includes('rec')) {
w.recYds += yards;
w.plays += receptions;
w.tds += recTd || genericTd;
}
}


function num(x) { return Number.isFinite(+x) ? +x : 0; }


(async () => {
const players = {};
for (let wk = 1; wk <= MAX_WEEK; wk++) {
let rows = [];
try {
rows = await fetchWeek(wk);
} catch (e) {
console.warn('Week fetch failed:', wk, e.message);
continue;
}


// Normalize typical CFBD game-player rows
for (const r of rows) {
// Some payloads group stats by category per record; others provide keyed objects.
// We try to detect shape defensively.
const category = r.category || r.statCategory || '';
const meta = {
athleteId: r.athleteId || r.playerId,
name: r.name || r.player || r.athlete,
team: r.team || r.teamName,
conference: r.conference || r.teamConference,
position: r.position
};
const p = ensurePlayer(players, meta);


// If a nested `stat` object exists, use it; else use the row itself.
const stat = r.stat || r;
addStat(p, wk, category, stat);
}
}


const outDir = path.join(process.cwd(), 'data');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'players.json');
fs.writeFileSync(outPath, JSON.stringify(Object.values(players), null, 2));
console.log('Wrote', outPath, 'players:', Object.keys(players).length);
})().catch(e => { console.error(e); process.exit(1); });
