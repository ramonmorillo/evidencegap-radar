import { buildPubMedTerm, pubmedESearch, pubmedESummary } from "./pubmed.js";
import { ctgovSearch } from "./ctgov.js";
import { classifyEvidence } from "./rules.js";
import { renderReport } from "./report.js";

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

  const query = { population, intervention, outcome, context };
  const term = buildPubMedTerm(query);

  const analyzeBtn = document.getElementById("analyze");

  try {
    analyzeBtn.textContent = "Analizando...";
    analyzeBtn.disabled = true;

    const pubmed = await pubmedESearch(term, windowDays);
    const ids = pubmed?.esearchresult?.idlist || [];

    const summary = await pubmedESummary(ids.slice(0, 5));
    const ctgov = await ctgovSearch(term);

    const classification = classifyEvidence(pubmed, ctgov);

    renderReport({
      term,
      pubmed,
      summary,
      ctgov,
      classification
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
