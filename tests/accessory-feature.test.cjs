const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "programme_muscu.html"), "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)[1].split("// INIT")[0];

const storage = new Map([["muscu_auth", "1"]]);
const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
const element = () => ({
  value: "",
  style: {},
  classList,
  addEventListener() {},
  querySelectorAll() { return []; }
});
const elements = new Map();
const getElement = id => {
  if (!elements.has(id)) elements.set(id, element());
  return elements.get(id);
};

const context = {
  console,
  crypto: crypto.webcrypto,
  TextEncoder,
  Uint8Array,
  Map,
  Set,
  Date,
  Math,
  JSON,
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  },
  document: {
    getElementById: getElement,
    querySelectorAll: () => [],
    addEventListener() {}
  },
  navigator: {},
  fetch: () => Promise.resolve({ ok: true, json: async () => null }),
  confirm: () => true,
  setInterval: () => 1,
  clearInterval() {},
  setTimeout,
  clearTimeout
};
context.window = context;

vm.createContext(context);
vm.runInContext(`${script}
globalThis.testApi = {
  state,
  PROGRAM,
  accountSessionKey,
  historyToCloudMap,
  cloudMapToHistory,
  ACCESSORY_CATALOG,
  ACCESSORY_BY_ID,
  migrateAccessoryKeys,
  migrateExtraAccessories,
  normalizeAccessoryId,
  migrateCustomWeights,
  accessoryDataKey,
  getSessionExercises,
  sessionOccurrenceKey,
  exerciseCompletionKey,
  setKey,
  setCustomWeight,
  setCustomReps,
  getCustomWeight,
  getCustomReps,
  getLatestExercisePerformance,
  buildLocalBackup,
  logSession,
  loadHistory
};`, context);

const api = context.testApi;

assert.ok(api.ACCESSORY_CATALOG.length > 0);
assert.ok(api.ACCESSORY_CATALOG.every(ex => !ex.ref && api.ACCESSORY_BY_ID[ex.id]));
assert.equal(new Set(api.ACCESSORY_CATALOG.map(ex => ex.id)).size, api.ACCESSORY_CATALOG.length);

const migratedWeights = api.migrateAccessoryKeys(api.migrateCustomWeights({
  "Lat Pull Down": [35]
}));
assert.equal(migratedWeights["lat-pull-down"][0].w, 35);
assert.equal(migratedWeights["Lat Pull Down"], undefined);

const migratedTriceps = api.migrateAccessoryKeys({
  "triceps-pushdown": [{ w: 22.5, r: null }]
});
assert.equal(migratedTriceps["overhead-extensions-triceps"][0].w, 22.5);
assert.equal(api.normalizeAccessoryId("triceps-pushdown"), "overhead-extensions-triceps");
assert.deepEqual(
  Array.from(api.migrateExtraAccessories({ c1w0s0: ["triceps-pushdown"] }).c1w0s0),
  ["overhead-extensions-triceps"]
);

api.state.customWeights = migratedWeights;
api.state.customReps = api.migrateAccessoryKeys({ "Lat Pull Down": [8, 8, 7] });
assert.equal(api.getCustomWeight("Lat Pull Down", 0), 35);
assert.deepEqual(
  [0, 1, 2].map(index => api.getCustomReps("Lat Pull Down", index)),
  [8, 8, 7]
);

api.state.cycle = 2;
api.state.week = 0;
api.state.day = 0;
api.state.extraAccessories = {
  [api.sessionOccurrenceKey()]: ["lat-pull-down"]
};
let exercises = api.getSessionExercises();
const added = exercises.find(ex => ex.id === "lat-pull-down" && ex.isExtra);
assert.ok(added);

const addedIndex = exercises.indexOf(added);
const addedKey = api.exerciseCompletionKey(added, addedIndex);
api.state.completions[api.setKey(0, 0, addedKey, 0)] = true;
api.state.completions[api.setKey(0, 0, addedKey, 1)] = true;
api.logSession(0, 0);

const logged = api.loadHistory().sessions[0];
const loggedExtra = logged.exercises.find(ex => ex.id === "lat-pull-down");
assert.equal(loggedExtra.source, "added");
assert.deepEqual(loggedExtra.sets.filter(set => set.done).map(set => set.reps), [8, 8]);
assert.equal(loggedExtra.sets[0].weight, 35);
assert.match(api.getLatestExercisePerformance("Lat Pull Down"), /35 kg · 8 \/ 8 reps/);

const backup = api.buildLocalBackup();
assert.equal(backup.schemaVersion, 1);
assert.equal(backup.application, "skin-grinding");
assert.equal(backup.data.history.sessions.length, 1);
assert.equal(backup.data.history.sessions[0].exercises.find(ex => ex.id === "lat-pull-down").source, "added");

const cloudHistory = api.historyToCloudMap(backup.data.history);
const roundTripHistory = api.cloudMapToHistory(cloudHistory);
assert.equal(Object.keys(cloudHistory.sessions).length, 1);
assert.equal(roundTripHistory.sessions.length, 1);
assert.equal(
  api.accountSessionKey(roundTripHistory.sessions[0]),
  Object.keys(cloudHistory.sessions)[0]
);

api.state.week = 1;
exercises = api.getSessionExercises(1, 0);
assert.equal(exercises.some(ex => ex.id === "lat-pull-down" && ex.isExtra), false);

console.log("Accessory feature tests passed");
