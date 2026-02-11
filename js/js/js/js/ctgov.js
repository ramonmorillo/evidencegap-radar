import { getJson } from "./api.js";

export async function ctgovSearch({ population, intervention, outcome, context }, pageSize = 25) {
  const query = [population, intervention, outcome, context]
    .map(x => (x || "").trim())
    .filter(Boolean)
    .join(" ");

  if (!query) return { studies: [] };

  return getJson(
    `/api/ctgov/search?query=${encodeURIComponent(query)}&pageSize=${encodeURIComponent(String(pageSize))}`
  );
}

export function summarizeTrials(data) {
  const studies = data?.studies || [];

  const statusCounts = {};
  const phaseCounts = {};

  for (const s of studies) {
    const status = s?.protocolSection?.statusModule?.overallStatus || "Unknown";
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    const phases = s?.protocolSection?.designModule?.phases || [];
    if (!phases.length) {
      phaseCounts["Unspecified"] = (phaseCounts["Unspecified"] || 0) + 1;
    } else {
      for (const p of phases) {
        phaseCounts[p] = (phaseCounts[p] || 0) + 1;
      }
    }
  }

  return { n: studies.length, statusCounts, phaseCounts, studies };
}
