import { parseRepoMap, type RepoMap } from "@/lib/repo-map";
import { parseReport, ReportError, shortSha, type ReviewReport } from "@/lib/review-report";

export interface OpenedReport {
  report: ReviewReport;
  /** null when only report.json was picked: the shipped demo map would describe another repo. */
  map: RepoMap | null;
  names: string[];
}

async function readJson(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text());
  } catch {
    throw new ReportError(`${file.name} is not valid JSON.`);
  }
}

const isRepoMap = (json: unknown) =>
  typeof json === "object" && json !== null && String((json as { schema_version?: unknown }).schema_version ?? "").startsWith("map-");

/** Reads the files picked in the browser; nothing leaves the machine. Each file is recognised by its content, not its name. */
export async function openReportFiles(files: File[]): Promise<OpenedReport> {
  const parsed = await Promise.all(files.map(async (file) => ({ file, json: await readJson(file) })));
  const maps = parsed.filter((entry) => isRepoMap(entry.json));
  const reports = parsed.filter((entry) => !isRepoMap(entry.json));
  if (reports.length !== 1 || maps.length > 1) {
    throw new ReportError("Pick one report.json from behavior-review, and optionally one repo_map.json from behavior-review map.");
  }
  const report = parseReport(reports[0].json);
  const map = maps.length ? parseRepoMap(maps[0].json) : null;
  if (map && map.sha !== report.revisions.head_sha) {
    throw new ReportError(
      `repo_map.json maps ${shortSha(map.sha)}, but the report's head is ${shortSha(report.revisions.head_sha)}; generate both from the same commit.`,
    );
  }
  return { report, map, names: files.map((file) => file.name) };
}
