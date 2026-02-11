import { getJson } from "./api.js";

export function buildPubMedTerm({ population, intervention, outcome, context }) {
  const parts = [population, intervention, outcome, context]
    .map(x => (x || "").trim())
    .filter(Boolean)
    .map(x => `(${x})`);

  return parts.join(" AND ");
}

export async function pubmedESearch(term, reldate = "7", retmax = 10) {
  return getJson(
    `/api/pubmed/esearch?term=${encodeURIComponent(term)}&reldate=${encodeURIComponent(reldate)}&retmax=${encodeURIComponent(String(retmax))}`
  );
}

export async function pubmedESummary(ids) {
  if (!ids?.length) return null;

  return getJson(
    `/api/pubmed/esummary?ids=${encodeURIComponent(ids.join(","))}`
  );
}
