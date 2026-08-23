const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "programme_muscu.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)[1].split("// INIT")[0];
assert.doesNotMatch(html, /PASSWORD_HASH|attemptLogin|id="loginPassword"/);

const storage = new Map();
const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
const element = () => ({ value: "", textContent: "", style: {}, classList, addEventListener() {}, querySelectorAll() { return []; } });
const elements = new Map();
const context = {
  console, crypto: crypto.webcrypto, TextEncoder, Uint8Array, Map, Set, Date, Math, JSON,
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  },
  document: {
    getElementById: id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    querySelectorAll: () => [], addEventListener() {}
  },
  navigator: {}, fetch: async () => ({ ok: true, json: async () => null }), confirm: () => true,
  setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout
};
context.window = context;
vm.createContext(context);
vm.runInContext(`${script}
globalThis.testApi = {
  state, PROGRAM, PROGRAM_VERSION, FREESTYLE_CATALOG, FREESTYLE_BY_ID,
  getSessionExercises, getExerciseSets, setPreFatigueSetCount,
  sessionOccurrenceKey, exerciseCompletionKey, getExerciseTimerDuration,
  getDayProgress, setKey, saveState, loadState, buildLocalBackup,
  historyToCloudMap, cloudMapToHistory, mergeHistory, accountSessionKey, localDateKey,
  setCustomWeight, getCustomWeight, setExerciseRating, getExerciseRating,
  logSession, loadHistory, WEIGHT_DATA_VERSION,
  getRecentExerciseHistory, formatPreviousSets, renderRecentExerciseHistory,
  isSessionValidated, isSessionLogged, isBlocComplete, advanceCycle, renderWeekAdvanceBanner
};`, context);
const api = context.testApi;

assert.equal(api.PROGRAM_VERSION, 2);
assert.equal(api.PROGRAM.length, 1);
assert.deepEqual(Array.from(api.PROGRAM[0].days, day => day.name), [
  "Upper 1", "Lower 1", "Repos", "Upper 2", "Lower 2", "Repos", "Repos"
]);
assert.equal(api.PROGRAM[0].days.filter(day => !day.rest).length, 4);

const upper1 = api.PROGRAM[0].days[0];
assert.equal(upper1.exercises.find(ex => ex.name === "Bench Feet Up").range, "10-15");
assert.equal(upper1.exercises.find(ex => ex.name === "Bench Feet Up").rest, 120);
const lower1 = api.PROGRAM[0].days[1];
const lower2 = api.PROGRAM[0].days[4];
assert.equal(lower1.exercises.find(ex => ex.name === "Adductions Machine").range, "10-15");
assert.equal(lower2.exercises.find(ex => ex.name === "Adductions Machine").range, "20");

const warmup = upper1.exercises[0];
assert.equal(api.getExerciseSets(warmup).length, 1);
api.setPreFatigueSetCount(warmup.id, 2);
assert.equal(api.getExerciseSets(warmup).length, 2);
assert.equal(api.getExerciseTimerDuration(0, 0, api.exerciseCompletionKey(warmup, 0)), 0);

api.state.cycle = 1;
api.state.week = 0;
api.state.day = 1;
api.state.freestyleSelections = {};
assert.equal(api.getDayProgress(0, 1).total, 17); // 4 warm-ups + 12 main sets + required freestyle choice
const occurrence = api.sessionOccurrenceKey();
api.state.freestyleSelections[occurrence] = { id: "leg-press-freestyle", sets: 4 };
const exercises = api.getSessionExercises(0, 1);
const freestyle = exercises.find(ex => ex.isFreestyle);
assert.equal(freestyle.name, "Leg Press");
assert.equal(api.getExerciseSets(freestyle).length, 4);
assert.equal(api.getExerciseTimerDuration(0, 1, api.exerciseCompletionKey(freestyle, exercises.indexOf(freestyle))), 120);

api.state.preFatigueSets = { [warmup.id]: 2 };
api.saveState();
const saved = JSON.parse(storage.get("muscu_program"));
assert.equal(saved.programVersion, 2);
assert.equal(saved.preFatigueSets[warmup.id], 2);
assert.equal(saved.freestyleSelections[occurrence].id, "leg-press-freestyle");
assert.equal(saved.weightDataVersion, api.WEIGHT_DATA_VERSION);

api.setCustomWeight("Leg Press", 0, 20);
api.setCustomWeight("Leg Press", 1, 25);
api.setCustomWeight("Leg Press", 2, 30);
assert.deepEqual([0, 1, 2].map(i => api.getCustomWeight("Leg Press", i)), [20, 25, 30]);
api.setExerciseRating(freestyle.id, "hard");
assert.equal(api.getExerciseRating(freestyle.id), "hard");

storage.set("muscu_program", JSON.stringify({
  programVersion: 2, weightDataVersion: 1, cycle: 1, day: 0,
  customWeights: { "bench-feet-up": [{ w: 42.5, r: null }] }, updatedAt: 1
}));
api.loadState();
assert.deepEqual([0, 1, 2].map(i => api.getCustomWeight("Bench Feet Up", i)), [42.5, 42.5, 42.5]);
assert.equal(JSON.parse(storage.get("muscu_program")).weightDataVersion, api.WEIGHT_DATA_VERSION);

api.state.cycle = 4;
api.state.week = 0;
api.state.day = 0;
const benchExercise = upper1.exercises.find(ex => ex.id === "bench-feet-up");
const exerciseHistory = { sessions: [
  { date: "2026-07-01", cycle: 1, week: 0, day: 0, exercises: [{ id: benchExercise.id, rating: "easy", sets: [{ done: true, reps: 15, weight: 20 }] }] },
  { date: "2026-07-08", cycle: 2, week: 0, day: 0, exercises: [{ id: benchExercise.id, rating: "right", sets: [{ done: true, reps: 10, weight: 25 }] }] },
  { date: "2026-07-15", cycle: 3, week: 0, day: 0, exercises: [{ id: benchExercise.id, rating: "hard", sets: [{ done: true, reps: 11, weight: 30 }] }] },
  { date: "2026-07-22", cycle: 4, week: 0, day: 0, exercises: [{ id: benchExercise.id, rating: "easy", sets: [{ done: true, reps: 12, weight: 32.5 }] }] }
] };
const recentBench = api.getRecentExerciseHistory(benchExercise, exerciseHistory);
assert.equal(recentBench.length, 3);
assert.deepEqual(Array.from(recentBench, item => item.exercise.rating), ["hard", "right", "easy"]);
assert.equal(api.formatPreviousSets(recentBench[0].exercise.sets), "11×30 kg");
assert.match(api.renderRecentExerciseHistory(benchExercise, exerciseHistory), /Très difficile/);

api.state.cycle = 5;
api.state.week = 0;
api.state.day = 4;
api.state.completions = {}; // A validated partial session must still count.
const validatedDays = [0, 1, 3, 4];
storage.set("muscu_history", JSON.stringify({
  sessions: validatedDays.map((day, index) => ({
    date: `2026-08-${10 + index}`, cycle: 5, week: 0, day,
    setsDone: 1, setsTotal: 20, exercises: []
  })),
  maxHistory: []
}));
assert.equal(api.isSessionValidated(0, 0), true);
assert.equal(api.isSessionLogged(0, 0), true);
assert.equal(api.isBlocComplete(0), true);
assert.match(api.renderWeekAdvanceBanner(), /Commencer la semaine 6/);
api.advanceCycle();
assert.equal(api.state.cycle, 6);
assert.equal(api.isBlocComplete(0), false);

storage.set("muscu_history", JSON.stringify({ sessions: [{ date: "2026-08-10" }], maxHistory: [] }));
storage.set("muscu_program", JSON.stringify({ programVersion: 1, cycle: 9, completions: { old: true }, updatedAt: 1 }));
api.loadState();
assert.equal(api.state.programVersion, 2);
assert.equal(api.state.cycle, 1);
assert.deepEqual(Object.keys(api.state.completions), []);
assert.equal(JSON.parse(storage.get("muscu_history")).sessions.length, 1);

const backup = api.buildLocalBackup();
assert.equal(backup.application, "skin-grinding");
assert.equal(backup.data.history.sessions.length, 1);
const cloud = api.historyToCloudMap(backup.data.history);
assert.equal(api.cloudMapToHistory(cloud).sessions.length, 1);
assert.equal(api.localDateKey(new Date(2026, 0, 2, 0, 30)), "2026-01-02");
const merged = api.mergeHistory(
  { sessions: [{ date: "2026-01-02", cycle: 1, week: 0, day: 0, updatedAt: 10 }], maxHistory: [] },
  { sessions: [{ date: "2026-01-02", cycle: 1, week: 0, day: 0, updatedAt: 20, marker: "new" }], maxHistory: [] }
);
assert.equal(merged.sessions[0].marker, "new");

console.log("Weekly program tests passed");
