const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "programme_muscu.html"), "utf8");
const serviceWorker = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const databaseRules = JSON.parse(fs.readFileSync(path.join(root, "database.rules.json"), "utf8"));
const script = html.match(/<script>([\s\S]*)<\/script>/)[1].split("// INIT")[0];

assert.doesNotMatch(html, /PASSWORD_HASH|attemptLogin|id="loginPassword"/);
assert.match(html, /Plan actuel/);
assert.match(html, /Charge réellement utilisée/);
assert.match(html, /Charge retenue/);
assert.match(html, /Dernières charges/);
assert.match(html, /Vidéo personnelle/);
assert.match(html, /updateViaCache: 'none'/);
assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
assert.match(serviceWorker, /type === 'SKIP_WAITING'/);
assert.equal(databaseRules.rules.accounts.$uid[".read"], "auth != null && auth.uid === $uid");

const storage = new Map();
const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
const element = () => ({
  value: "", checked: false, textContent: "", innerHTML: "", style: {}, className: "",
  classList, addEventListener() {}, setAttribute() {}, focus() {}, setSelectionRange() {},
  querySelectorAll() { return []; }
});
const elements = new Map();
const context = {
  console, crypto: crypto.webcrypto, TextEncoder, Uint8Array, Map, Set, Date, Math, JSON, URL,
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  },
  document: {
    getElementById: id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    querySelectorAll: () => [], addEventListener() {}
  },
  navigator: {}, fetch: async () => ({ ok: true, json: async () => null }),
  confirm: () => true, alert() {},
  setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout
};
context.window = context;
vm.createContext(context);
vm.runInContext(`${script}
globalThis.testApi = {
  state, PROGRAM, PROGRAM_VERSION, PROGRAM_ID, PREVIOUS_PROGRAM_ID, TRAINING_ONE_ARCHIVE_ID,
  INITIAL_RUN_ID, DATA_SCHEMA_VERSION, WEIGHT_DATA_VERSION,
  getEffectiveDayData, getSessionExercises, getExerciseSets, getExerciseTargetWeight, sessionOccurrenceKey,
  exerciseCompletionKey, getExerciseTimerDuration, getDayProgress, setKey,
  saveState, loadState, buildLocalBackup, serializeState, resetStateToDefaults,
  historyToCloudMap, cloudMapToHistory, mergeHistory, accountSessionKey, localDateKey,
  storageKey, activateAccountStorage, setCustomWeight, getCustomWeight,
  setCustomReps, getCustomReps, getSessionDraft, setSetRpe, getSetRpe,
  setExerciseRating, getExerciseRating, setExercisePain, getExercisePain,
  setPersonalMedia, getPersonalMedia, logSession, loadHistory,
  getRecentExerciseHistory, formatPreviousSets, renderRecentExerciseHistory,
  isSessionValidated, isSessionLogged, isBlocComplete, advanceCycle,
  renderWeekAdvanceBanner, effectiveSessionProgramId, effectiveSessionRunId,
  sessionMatchesContext, validateBackup, buildTrainingOneArchive, ensureTrainingOneArchive,
  setTimer, toggleTimer, resetTimer, restoreLocalTimerState, STORAGE_TIMER
};`, context);
const api = context.testApi;

assert.equal(api.PROGRAM_VERSION, 3);
assert.equal(api.DATA_SCHEMA_VERSION, 4);
assert.equal(api.PROGRAM_ID, "rudy-training-2-v1");
assert.equal(api.PROGRAM.length, 1);
assert.deepEqual(Array.from(api.PROGRAM[0].days, day => day.name), [
  "Jour 1", "Jour 2", "Repos", "Jour 4", "Jour 5", "Repos", "Repos"
]);
assert.equal(api.PROGRAM[0].days[3].pending, undefined);
assert.equal(api.PROGRAM[0].days[4].pending, undefined);

const day1 = api.PROGRAM[0].days[0];
const day2 = api.PROGRAM[0].days[1];
const day4 = api.PROGRAM[0].days[3];
const day5 = api.PROGRAM[0].days[4];
assert.equal(day1.exercises.length, 12);
assert.equal(day2.exercises.length, 6);
assert.equal(day4.exercises.length, 12);
assert.equal(day5.exercises.length, 12);
const lateralIso = day1.exercises.find(ex => ex.id === "iso-elevation-laterale");
assert.equal(api.getExerciseSets(lateralIso).length, 2);
assert.equal(lateralIso.targetWeight, 3);
assert.equal(lateralIso.requiresPersonalVideo, true);
const inclineCurl = day1.exercises.find(ex => ex.id === "curl-incline");
assert.equal(inclineCurl.targetWeight, 8);
assert.equal(inclineCurl.sets[0].r, 13);
const skullCrusher = day2.exercises.find(ex => ex.id === "barre-au-front");
assert.equal(skullCrusher.targetWeightLabel, "15 kg de disques + barre EZ");
assert.match(skullCrusher.weightNote, /barre EZ/);

api.state.cycle = 1;
api.state.week = 0;
api.state.day = 0;
assert.equal(api.getDayProgress(0, 0).total, 33);
assert.equal(api.getDayProgress(0, 0).exercisesTotal, 12);
assert.equal(api.getDayProgress(0, 1).total, 21);
assert.deepEqual(
  { total: api.getDayProgress(0, 3).total, pct: api.getDayProgress(0, 3).pct },
  { total: 32, pct: 0 }
);
assert.equal(api.getDayProgress(0, 4).total, 33);
const archivedLegCurl = day4.exercises.find(ex => ex.id === "archive-leg-curl-assis");
assert.deepEqual([0, 1, 2].map(index => api.getExerciseTargetWeight(archivedLegCurl, index)), [35, 35, 30]);
const archivedCalves = day4.exercises.find(ex => ex.id === "archive-mollets-presse");
assert.deepEqual([0, 1, 2].map(index => api.getExerciseTargetWeight(archivedCalves, index)), [80, 80, 60]);
const archivedLateralRaise = day5.exercises.find(ex => ex.id === "archive-elevations-laterales-assis");
assert.equal(archivedLateralRaise.targetWeight, 2);
assert.equal(api.getExerciseTargetWeight(archivedLateralRaise, 0), 3);
assert.equal(api.getExerciseTimerDuration(0, 0, api.exerciseCompletionKey(lateralIso, 0)), 0);
const bench = day1.exercises.find(ex => ex.id === "developpe-couche-halteres");
const benchKey = api.exerciseCompletionKey(bench, day1.exercises.indexOf(bench));
assert.equal(api.getExerciseTimerDuration(0, 0, benchKey), 120);

// Every set keeps its own actual load. Unedited sets use Rudy's target as a convenient default.
api.setCustomWeight(bench.id, 0, 20);
api.setCustomWeight(bench.id, 1, 25);
api.setCustomWeight(bench.id, 2, 30);
assert.deepEqual([0, 1, 2].map(i => api.getCustomWeight(bench.id, i, 1, 0, 0, bench.targetWeight)), [20, 25, 30]);
assert.equal(api.getCustomWeight(bench.id, 3, 1, 0, 0, bench.targetWeight), 26);
api.setCustomReps(bench.id, 0, 15);
api.setCustomReps(bench.id, 1, 10);
api.setSetRpe(bench.id, 0, 7.5);
assert.deepEqual([api.getCustomReps(bench.id, 0), api.getCustomReps(bench.id, 1)], [15, 10]);
assert.equal(api.getSetRpe(bench.id, 0), 7.5);

api.setExercisePain(bench.id, "score", 4);
api.setExercisePain(bench.id, "location", "épaule gauche");
assert.deepEqual(
  JSON.parse(JSON.stringify(api.getExercisePain(bench.id))),
  { score: 4, location: "épaule gauche" }
);
api.setPersonalMedia(bench.id, "videoUrl", "https://youtu.be/example");
assert.equal(api.getPersonalMedia(bench.id).videoUrl, "https://youtu.be/example");

// A validated session snapshots actual data, target data, per-set RPE, pain and media separately.
api.state.completions[api.setKey(0, 0, benchKey, 0)] = true;
api.state.exerciseRatings[api.sessionOccurrenceKey()] = { [bench.id]: "right" };
api.logSession(0, 0);
let currentHistory = api.loadHistory();
assert.equal(currentHistory.sessions.length, 1);
let loggedBench = currentHistory.sessions[0].exercises.find(ex => ex.id === bench.id);
assert.equal(loggedBench.sets[0].weight, 20);
assert.equal(loggedBench.sets[0].rpe, 7.5);
assert.equal(loggedBench.target.weight, 26);
assert.equal(loggedBench.target.kind, "Cible Rudy");
assert.equal(loggedBench.pain.score, 4);
assert.equal(loggedBench.personalMedia.videoUrl, "https://youtu.be/example");

// Entraînement 1 is a deterministic archive and is seeded only once.
const archive = api.buildTrainingOneArchive(100);
assert.equal(archive.length, 4);
assert.deepEqual(Array.from(archive, session => session.dayName), ["Jour 1", "Jour 2", "Jour 4", "Jour 5"]);
assert.ok(archive.every(session => session.programId === api.TRAINING_ONE_ARCHIVE_ID));
assert.ok(archive.every(session => session.displayDate === "Semaine précédente"));
const archivedCurl = archive[0].exercises.find(ex => ex.id === "curl-incline");
assert.deepEqual(Array.from(archivedCurl.sets, set => set.weight), [12, 12, 10, 10]);
assert.match(archivedCurl.summary, /8 kg/);
api.state.historySeedVersion = 0;
api.ensureTrainingOneArchive({ sync: false });
currentHistory = api.loadHistory();
assert.equal(currentHistory.sessions.length, 5);
api.ensureTrainingOneArchive({ sync: false });
assert.equal(api.loadHistory().sessions.length, 5);

const recentCurl = api.getRecentExerciseHistory(inclineCurl, api.loadHistory());
assert.equal(recentCurl.length, 1);
assert.equal(api.formatPreviousSets(recentCurl[0].exercise.sets), "12×12 kg · 8×12 kg · RPE ≈8–9 · 12×10 kg · 9×10 kg · RPE ≈8–9");
assert.match(api.renderRecentExerciseHistory(inclineCurl, api.loadHistory()), /Semaine précédente/);
assert.match(api.renderRecentExerciseHistory(inclineCurl, api.loadHistory()), /Commentaires de la séance/);
api.state.day = 3;
const recentLegCurl = api.getRecentExerciseHistory(archivedLegCurl, api.loadHistory());
assert.equal(recentLegCurl.length, 1);
assert.deepEqual(Array.from(recentLegCurl[0].exercise.sets, set => [set.reps, set.weight]), [[16, 35], [12, 35], [16, 30]]);
assert.match(api.renderRecentExerciseHistory(archivedLegCurl, api.loadHistory()), /Setup machine 2 \/ 1 \/ 4/);

// All four planned sessions are required before the next week can start.
api.resetStateToDefaults();
api.state.cycle = 2;
storage.set("muscu_history", JSON.stringify({
  sessions: [0, 1, 3, 4].map((day, index) => ({
    programId: api.PROGRAM_ID, runId: api.INITIAL_RUN_ID,
    date: `2026-10-0${index + 1}`, cycle: 2, week: 0, day,
    setsDone: 1, setsTotal: 1, exercises: []
  })),
  maxHistory: []
}));
assert.equal(api.isBlocComplete(0), true);
assert.match(api.renderWeekAdvanceBanner(), /Commencer la semaine 3/);
const completionHistory = JSON.parse(storage.get("muscu_history"));
completionHistory.sessions = completionHistory.sessions.filter(session => session.day !== 4);
storage.set("muscu_history", JSON.stringify(completionHistory));
assert.equal(api.isBlocComplete(0), false);
completionHistory.sessions.push({
  programId: api.PROGRAM_ID, runId: api.INITIAL_RUN_ID,
  date: "2026-10-05", cycle: 2, week: 0, day: 4,
  setsDone: 1, setsTotal: 1, exercises: []
});
storage.set("muscu_history", JSON.stringify(completionHistory));
api.advanceCycle();
assert.equal(api.state.cycle, 3);

// Legacy Upper/Lower sessions remain attached to their old program, never to Entraînement 2.
const legacyWeekly = { weekName: "Semaine", dayName: "Upper 1", cycle: 1, week: 0, day: 0 };
const legacySbd = { weekName: "Wave 1", dayName: "Squat", cycle: 1, week: 0, day: 0 };
assert.equal(api.effectiveSessionProgramId(legacyWeekly), api.PREVIOUS_PROGRAM_ID);
assert.equal(api.effectiveSessionProgramId(legacySbd), "legacy-sbd");
assert.equal(api.sessionMatchesContext(legacyWeekly, 0, 0), false);
const separatePrograms = api.mergeHistory(
  { sessions: [{ ...legacyWeekly, programId: api.PREVIOUS_PROGRAM_ID, date: "2026-01-01" }], maxHistory: [] },
  { sessions: [{ ...legacyWeekly, programId: api.PROGRAM_ID, date: "2026-01-01" }], maxHistory: [] }
);
assert.equal(separatePrograms.sessions.length, 2);

// Program migration resets only active progress and leaves history untouched with a recovery copy.
storage.set("muscu_history", JSON.stringify({ sessions: [{ date: "2026-08-10", programId: "old", week: 0, day: 0 }], maxHistory: [] }));
storage.set("muscu_program", JSON.stringify({ programVersion: 2, cycle: 9, completions: { old: true }, updatedAt: 1 }));
api.loadState();
assert.equal(api.state.programVersion, 3);
assert.equal(api.state.cycle, 1);
assert.deepEqual(Object.keys(api.state.completions), []);
assert.equal(JSON.parse(storage.get("muscu_history")).sessions.length, 1);
assert.ok(storage.has("muscu_recovery"));

const backup = api.buildLocalBackup();
assert.equal(backup.application, "skin-grinding");
const cloud = api.historyToCloudMap(backup.data.history);
assert.equal(api.cloudMapToHistory(cloud).sessions.length, 1);
assert.equal(api.localDateKey(new Date(2026, 0, 2, 0, 30)), "2026-01-02");
assert.throws(() => api.validateBackup({ application: "other", data: {} }), /invalid-backup/);

// Local data remains isolated by Firebase account.
storage.clear();
storage.set("muscu_program", JSON.stringify({ programVersion: 3, weightDataVersion: 2, cycle: 7, day: 1, updatedAt: 1 }));
api.activateAccountStorage("uid-a");
api.loadState();
assert.equal(api.state.cycle, 7);
api.state.cycle = 8;
api.saveState({ sync: false });
api.activateAccountStorage("uid-b");
api.loadState();
assert.equal(api.state.cycle, 1);
api.activateAccountStorage("uid-a");
api.loadState();
assert.equal(api.state.cycle, 8);

api.activateAccountStorage(null);
api.resetStateToDefaults();
api.setTimer(120);
api.toggleTimer();
const runningTimer = JSON.parse(storage.get(api.STORAGE_TIMER));
assert.equal(runningTimer.running, true);
assert.ok(runningTimer.endsAt > Date.now());
api.resetTimer();
const resetTimerState = JSON.parse(storage.get(api.STORAGE_TIMER));
assert.deepEqual({ running: resetTimerState.running, remaining: resetTimerState.remaining }, { running: false, remaining: 120 });

console.log("Rudy training 2 tests passed");
