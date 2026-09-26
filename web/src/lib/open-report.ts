import { parseRepoMap, type RepoMap } from "@/lib/repo-map";
import { parseReport, ReportError, shortSha, type ReviewReport } from "@/lib/review-report";

export interface OpenedReport {
  report: ReviewReport;
  /** null when no map was picked: the shipped demo map would describe another repo. */
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

// Files are read in the browser only; nothing leaves the machine.

export async function readReportFile(file: File): Promise<ReviewReport> {
  const json = await readJson(file);
  if (isRepoMap(json)) throw new ReportError(`${file.name} is a repo map; drop it in the repo map box.`);
  return parseReport(json);
}

export async function readRepoMapFile(file: File): Promise<RepoMap> {
  const json = await readJson(file);
  if (!isRepoMap(json)) throw new ReportError(`${file.name} is not a repo map; a report goes in the report box.`);
  return parseRepoMap(json);
}

/** A map of another commit would highlight the wrong files as "changed in this PR". */
export function mapMismatch(report: ReviewReport, map: RepoMap): string | undefined {
  if (map.sha === report.revisions.head_sha) return undefined;
  return `This map is of ${shortSha(map.sha)}, but the report's head is ${shortSha(report.revisions.head_sha)}; generate both from the same commit.`;
}
