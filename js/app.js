import { buildPubMedTerm, pubmedESearch, pubmedESummary } from "./pubmed.js";
import { ctgovSearch, summarizeTrials } from "./ctgov.js";
import { classifyEvidence, generateOpportunities } from "./rules.js";
import { renderResults, renderBrief } from "./report.js";

document.addEventListener("DOMContentLoaded", () => {

  document.getElementById("analyze")?.addEventListener("click", analyze);

  document.getElementById("print")?.addEventListener("click", () => {
    window.print();
  });

  setupMeshAutocomplete("intervention", "intervention-suggest");
  setupMeshAutocomplete("outcome", "outcome-suggest");

});

async function analyze() {

  const population = document.getElementById("population").value;
  const intervention = document.getElementById("intervention").value;
  const outcome = document.getElementById("outcome").value;
  const context = document.getElementById("context").value;
  const windowDays = document.getElementById("window").value;

  const query = {
    title: `Evidence gap: ${population} / ${intervention} / ${outcome}`,
    population,
    intervention,
    outcome,
    context
  };

  const term = buildPubMedTerm(query);

  const analyzeBtn = document.getElementById("analyze");

  try {
    analyzeBtn.textContent = "Analizando...";
    analyzeBtn.disabled = true;

    const pubmedRecent = await pubmedESearch(term, windowDays);
    const pubRecent = Number(pubmedRecent?.esearchresult?.count || 0);
    const ids = pubmedRecent?.esearchresult?.idlist || [];

    const pubmed10y = await pubmedESearch(term, "3650");
    const pub10y = Number(pubmed10y?.esearchresult?.count || 0);

    const summary = await pubmedESummary(ids.slice(0, 5));

    const ctgovRaw = await ctgovSearch(term);
    const trials = summarizeTrials(ctgovRaw);

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

    document.getElementById("report").innerHTML =
      renderResults({
        query,
        pub10y,
        pubRecent: pubRecent,
        trials,
        evidenceClass,
        opps,
        topPubs: summary?.result ? Object.values(summary.result) : []
      });

    document.getElementById("results").classList.remove("hidden");

  } catch (err) {
    console.error(err);
    alert("Error durante el análisis");

  } finally {
    analyzeBtn.textContent = "Analizar";
    analyzeBtn.disabled = false;
  }
}

/* ------------------ MeSH AUTOCOMPLETE ------------------ */

function setupMeshAutocomplete(inputId, suggestId) {
  const input = document.getElementById(inputId);
  const box = document.getElementById(suggestId);

  if (!input || !box) return;

  input.addEventListener("input", async () => {
    const q = input.value.trim();

    if (q.length < 3) {
      box.innerHTML = "";
      return;
    }

    try {
      const resp = await fetch(
        `https://clinicaltables.nlm.nih.gov/api/mesh/v3/search?terms=${encodeURIComponent(q)}`
      );

      const data = await resp.json();
      const suggestions = data[3] || [];

      box.innerHTML = suggestions
        .slice(0, 5)
        .map(term => `<div class="suggest-item">${term}</div>`)
        .join("");

      box.querySelectorAll(".suggest-item").forEach(el => {
        el.addEventListener("click", () => {
          input.value = el.textContent;
          box.innerHTML = "";
        });
      });

    } catch (e) {
      console.warn("MeSH suggest fallback");
      box.innerHTML = "";
    }
  });

  document.addEventListener("click", (e) => {
    if (!box.contains(e.target) && e.target !== input) {
      box.innerHTML = "";
    }
  });
}
