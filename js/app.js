import { buildPubMedTerm, pubmedESearch, pubmedESummary } from "./pubmed.js";
import { ctgovSearch, summarizeTrials } from "./ctgov.js";
import { classifyEvidence, generateOpportunities } from "./rules.js";
import { renderResults, renderBrief } from "./report.js";

const el = (id) => document.getElementById(id);

function setStatus(msg) {
  el("statusCard").hidden = false;
  el("status").textContent = msg;
}

function clearStatus() {
  el("statusCard").hidden = true;
  el("status").textContent = "";
}

function getQuery() {
  const population = el("population").value.trim();
  const intervention = el("intervention").value.trim();
  const outcome = el("outcome").value.trim();
  const context = el("context").value.trim();

  const title = `Evidence gap: ${population || "—"} / ${intervention || "—"} / ${outcome || "—"}`;

  return { title, population, intervention, outcome, context };
}

async function run() {
  try {
    clearStatus();
    el("resultsCard").hidden = true;
    el("briefCard").hidden = true;
    el("printBtn").disabled = true;

    const query = getQuery();
    const reldate = el("reldate").value;

    if (!query.population && !query.intervention && !query.outcome && !query.context) {
      setStatus("Introduce al menos un campo.");
      return;
    }

    setStatus("Consultando PubMed…");
    const baseTerm = buildPubMedTerm(query);

    const recent = await pubmedESearch(baseTerm, reldate, 10);
    const pubRecent = Number(recent?.esearchresult?.count || 0);
    const ids = recent?.esearchresult?.idlist || [];

    let topPubs = [];
    if (ids.length) {
      const sum = await pubmedESummary(ids);
      const result = sum?.result || {};
      topPubs = ids.map(id => result[id]).filter(Boolean);
    }

    const teny = await pubmedESearch(baseTerm, "3650", 0);
    const pub10y = Number(teny?.esearchresult?.count || 0);

    setStatus("Consultando ClinicalTrials…");
    const ctData = await ctgovSearch(query, 25);
    const trials = summarizeTrials(ctData);

    const evidenceClass = classifyEvidence({
      pubCount10y: pub10y,
      pubCountRecent: pubRecent,
      trialsSummary: trials
    });

    const opps = generateOpportunities({
      pubCount10y: pub10y,
      pubCountRecent: pubRecent,
      trialsSummary: trials
    });

    el("results").innerHTML = renderResults({
      query,
      pub10y,
      pubRecent,
      trials,
      evidenceClass,
      opps,
      topPubs
    });

    el("brief").innerHTML = renderBrief({
      query,
      pub10y,
      pubRecent,
      trials,
      evidenceClass,
      opps
    });

    el("resultsCard").hidden = false;
    el("briefCard").hidden = false;
    el("printBtn").disabled = false;

    clearStatus();

  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
}

el("runBtn").addEventListener("click", run);
el("printBtn").addEventListener("click", () => window.print());
