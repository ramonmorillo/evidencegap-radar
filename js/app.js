import { buildPubMedTerm, pubmedESearch, pubmedESummary } from "./pubmed.js";
import { ctgovSearch, summarizeTrials } from "./ctgov.js";
import { classifyEvidence, generateOpportunities } from "./rules.js";
import { renderResults, renderBrief } from "./report.js";

const el = (id) => document.getElementById(id);

function showCard(cardId, show = true) {
  const node = el(cardId);
  if (!node) return;
  // Compatible con tu HTML actual (usa style display:none en algunos cards)
  if ("hidden" in node) node.hidden = !show;
  node.style.display = show ? "" : "none";
}

function setStatus(msg) {
  showCard("statusCard", true);
  const s = el("status");
  if (s) s.textContent = msg;
}

function clearStatus() {
  showCard("statusCard", false);
  const s = el("status");
  if (s) s.textContent = "";
}

function setResults(html) {
  const r = el("results");
  if (r) r.innerHTML = html;
  showCard("resultsCard", true);
}

function clearResults() {
  const r = el("results");
  if (r) r.innerHTML = "";
  showCard("resultsCard", false);
}

function setBrief(html) {
  const b = el("brief");
  if (b) b.innerHTML = html;
  showCard("briefCard", true);
}

function clearBrief() {
  const b = el("brief");
  if (b) b.innerHTML = "";
  showCard("briefCard", false);
}

function getQuery() {
  const population = el("population")?.value?.trim() || "";
  const intervention = el("intervention")?.value?.trim() || "";
  const outcome = el("outcome")?.value?.trim() || "";
  const context = el("context")?.value?.trim() || "";

  const title = `Evidence gap: ${population || "—"} / ${intervention || "—"} / ${outcome || "—"}`;
  return { title, population, intervention, outcome, context };
}

async function run() {
  try {
    clearStatus();
    clearResults();
    clearBrief();
    el("printBtn") && (el("printBtn").disabled = true);

    const query = getQuery();
    const reldate = el("reldate")?.value || "30";

    if (!query.population && !query.intervention && !query.outcome && !query.context) {
      setStatus("Introduce al menos un campo (idealmente P, I/E y O).");
      return;
    }

    setStatus("1/4 Construyendo consulta…");
    const baseTerm = buildPubMedTerm(query);

    setStatus("2/4 PubMed (ventana)…");
    const recent = await pubmedESearch(baseTerm, reldate, 10);
    const pubRecent = Number(recent?.esearchresult?.count || 0);
    const ids = recent?.esearchresult?.idlist || [];

    let topPubs = [];
    if (ids.length) {
      setStatus("3/4 PubMed (títulos)…");
      const sum = await pubmedESummary(ids);
      const result = sum?.result || {};
      topPubs = ids.map((id) => result[id]).filter(Boolean);
    }

    setStatus("3/4 PubMed (10 años)…");
    const teny = await pubmedESearch(baseTerm, "3650", 0);
    const pub10y = Number(teny?.esearchresult?.count || 0);

    setStatus("4/4 ClinicalTrials.gov…");
    const ctData = await ctgovSearch(query, 25);
    const trials = summarizeTrials(ctData);

    const evidenceClass = classifyEvidence({
      pubCount10y: pub10y,
      pubCountRecent: pubRecent,
      trialsSummary: trials,
    });

    const opps = generateOpportunities({
      pubCount10y: pub10y,
      pubCountRecent: pubRecent,
      trialsSummary: trials,
    });

    setResults(
      renderResults({
        query,
        pub10y,
        pubRecent,
        trials,
        evidenceClass,
        opps,
        topPubs,
      })
    );

    setBrief(
      renderBrief({
        query,
        pub10y,
        pubRecent,
        trials,
        evidenceClass,
        opps,
      })
    );

    el("printBtn") && (el("printBtn").disabled = false);
    clearStatus();
  } catch (err) {
    setStatus(`Error: ${err?.message || String(err)}`);
  }
}

// --- Enlaces a botones (robusto) ---
const analyzeBtn = el("analyzeBtn");
const runBtn = el("runBtn"); // por si vuelves a una versión anterior de HTML

if (analyzeBtn) analyzeBtn.addEventListener("click", run);
if (runBtn) runBtn.addEventListener("click", run);

// Imprimir
el("printBtn")?.addEventListener("click", () => window.print());

// Si no existe ningún botón, lo reportamos en estado (para que no parezca “muerto”)
if (!analyzeBtn && !runBtn) {
  setStatus(
    "No encuentro el botón de análisis (faltan IDs). Revisa que exista un botón con id='analyzeBtn' (o 'runBtn')."
  );
}

