import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const file = resolve("public/data/report.json");
const report = JSON.parse(await readFile(file, "utf8"));

if (report.fixture !== true) {
  throw new Error("The shipped demo report must remain explicitly marked as fixture data.");
}

const requiredOutcomes = new Set([
  "same_on_tested_cases",
  "delta_observed",
  "inconclusive",
]);
const observations = Array.isArray(report.observations) ? report.observations : [];
const outcomes = new Set(observations.map((observation) => observation?.outcome));

for (const outcome of requiredOutcomes) {
  if (!outcomes.has(outcome)) {
    throw new Error(`The shipped fixture is missing the ${outcome} state.`);
  }
}

for (const observation of observations) {
  if (!observation || typeof observation !== "object" || !("base" in observation) || !("head" in observation)) {
    throw new Error("Every fixture observation must include canonical base and head outputs.");
  }
}

console.log(`Fixture check passed: ${observations.length} observations cover same, delta, and inconclusive states.`);
