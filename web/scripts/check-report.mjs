import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const file = resolve("public/data/report.json");
const report = JSON.parse(await readFile(file, "utf8"));

// The shipped page is demo evidence, so it must be a real engine run, never a fixture.
if (report.fixture !== false) {
  throw new Error("The shipped demo report must be real engine output (fixture: false).");
}

const revisions = report.revisions ?? {};
if (!/^[0-9a-f]{40}$/.test(revisions.base_sha ?? "") || !/^[0-9a-f]{40}$/.test(revisions.head_sha ?? "")) {
  throw new Error("The shipped report must name the real base and head commits.");
}

// Provenance: judges must be able to follow the page back to the public CI run that produced it.
const actionRun = report.links?.action_run ?? "";
if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/actions\/runs\/\d+$/.test(actionRun)) {
  throw new Error("The shipped report must be a CI artifact stamped with links.action_run.");
}

const paths = report.impact?.paths ?? [];
if (!paths.some((path) => Array.isArray(path?.hops) && path.outside_diff === true && path.is_test === false)) {
  throw new Error("The shipped report must show at least one non-test caller outside the diff.");
}

const comparisons = Array.isArray(report.comparisons) ? report.comparisons : [];
if (!comparisons.length) {
  throw new Error("The shipped report must come from a --run, with probe comparisons.");
}
for (const comparison of comparisons) {
  if (!comparison?.probe?.id || !comparison.base || !comparison.head) {
    throw new Error("Every comparison must include its probe and both base and head observations.");
  }
}

// The lookbehind keeps the "s:/" inside "https://" from reading as a drive letter.
if (/(?<![A-Za-z])[A-Za-z]:[\\/]|\/(?:Users|home)\//.test(JSON.stringify(report))) {
  throw new Error("The shipped report must not contain local absolute paths.");
}

console.log(
  `Report check passed: ${revisions.base_sha.slice(0, 7)}..${revisions.head_sha.slice(0, 7)}, ` +
    `${paths.length} impact paths, ${comparisons.length} probe comparisons, from ${actionRun}.`,
);
