import { getJson } from "./api.js";
import { renderResults } from "./report.js";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const population = $("population");
  const intervention = $("intervention");
  const outcome = $("outcome");
  const context = $("context");
  const windowSel = $("window");

  const btnAnalyze = $("analyze");
  const btnReset = $("reset");
  const btnPrint = $("print");

  const results = $("results");
  const report = $("report");
  const errorBox = $("errorBox");

  // Si algo no existe, paramos con un error claro (en vez de romper con addEventListener null)
  const required = [
    population, intervention, outcome, context,
    windowSel, btnAnalyze, btnReset, btnPrint,
    results, report, errorBox
  ];
  if (required.some(x => !x)) {
    alert("Falta algún elemento en index.html (IDs no coinciden). Revisa que hayas pegado el index completo.");
    return;
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  }

  function clearError() {
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
  }

  function buildTerm({ population, intervention, outcome, context }) {
    const parts = [population, intervention, outcome, context]
      .map(x => (x || "").trim())
      .filter(Boolean)
      .map(x => `(${x})`);
    return parts.join(" AND ");
  }

  function classifyEvidence(pubRecent, pub10y, trialN) {
    // Heurística simple y transparente (se puede refinar después)
    if (pub10y <= 10 && trialN === 0) {
      return { label: "Huérfano", rationale: "Muy poca evidencia publicada y sin señales de ensayos." };
    }
    if (pubRecent <= 5 && trialN <= 1) {
      return { label: "Emergente", rationale: "Pocas señales recientes; posible nicho o evidencia incipiente." };
    }
    if (pubRecent >= 50 && pub10y >= 500) {
      return { label: "Saturado", rationale: "Muchísima publicación; conviene afinar a subpreguntas o outcomes específicos." };
    }
    if (trialN > 0) {
      return { label: "Maduro (activo)", rationale: "Hay ensayos registrados; existe actividad de investigación en curso." };
    }
    return { label: "Moderado", rationale: "Evidencia intermedia. Buen terreno para revisar brechas y comparabilidad." };
  }

  function suggestOpps(pubRecent, trialN) {
    const opps = [];
    if (trialN > 0) opps.push("Hay ensayos activos: mapear outcomes, comparabilidad y brechas.");
    if (pubRecent === 0) opps.push("Sin señales recientes: probar sinónimos/MeSH o reformular términos.");
    if (trialN === 0) opps.push("Sin ensayos: valorar piloto/factibilidad o estudios cualitativos/mixtos.");
    if (!opps.length) opps.push("Refinar la pregunta: población más concreta, intervención y outcome medible.");
    return opps;
  }

  function countBy(arr, fn) {
    const out = {};
    for (const x of (arr || [])) {
      const k = fn(x) || "UNKNOWN";
      out[k] = (out[k] || 0) + 1;
    }
    return out;
  }

  async function runAnalysis() {
    clearError();
    btnAnalyze.disabled = true;
    btnAnalyze.textContent = "Analizando…";

    try {
      const query = {
        title: "PICO-lite",
        population: population.value,
        intervention: intervention.value,
        outcome: outcome.value,
        context: context.value
      };

      const reldate = String(windowSel.value || "7");
      const term = buildTerm(query);

      // PubMed: ventana seleccionada (con muestra de IDs)
      const esRecent = await getJson(
        `/api/pubmed/esearch?term=${encodeURIComponent(term)}&reldate=${encodeURIComponent(reldate)}&retmax=10`
      );
      const pubRecent = Number(esRecent?.esearchresult?.count || 0);
      const idlist = esRecent?.esearchresult?.idlist || [];

      let topPubs = [];
      if (idlist.length) {
        const esum = await getJson(`/api/pubmed/esummary?ids=${encodeURIComponent(idlist.join(","))}`);
        const uids = esum?.result?.uids || [];
        topPubs = uids.map(uid => esum.result[uid]).filter(Boolean);
      }

      // PubMed: 10 años aprox
      const es10y = await getJson(
        `/api/pubmed/esearch?term=${encodeURIComponent(term)}&reldate=3650&retmax=0`
      );
      const pub10y = Number(es10y?.esearchresult?.count || 0);

      // ClinicalTrials
      const ct = await getJson(
        `/api/ctgov/search?query=${encodeURIComponent(term)}&pageSize=25`
      );

      // Intentamos soportar varias formas de respuesta
      const studies = ct?.studies || ct?.results || [];
      const trialN = Number(ct?.total || ct?.totalCount || studies.length || 0);

      const statusCounts = countBy(studies, (s) => {
        const st = s?.protocolSection?.statusModule?.overallStatus;
        return st || "UNKNOWN";
      });

      const phaseCounts = countBy(studies, (s) => {
        const ph = s?.protocolSection?.designModule?.phases;
        if (Array.isArray(ph) && ph.length) return ph.join(",");
        return "—";
      });

      const evidenceClass = classifyEvidence(pubRecent, pub10y, trialN);
      const opps = suggestOpps(pubRecent, trialN);

      const html = renderResults({
        query,
        pub10y,
        pubRecent,
        trials: { n: trialN, statusCounts, phaseCounts },
        evidenceClass,
        opps,
        topPubs
      });

      report.innerHTML = html;
      results.classList.remove("hidden");

    } catch (e) {
      // Aquí ponemos el error REAL, no “Error durante el análisis”
      showError(`Error real: ${e?.message || String(e)}`);

    } finally {
      btnAnalyze.disabled = false;
      btnAnalyze.textContent = "Analizar";
    }
  }

  function resetForm() {
    clearError();
    population.value = "";
    intervention.value = "";
    outcome.value = "";
    context.value = "";
    windowSel.value = "7";
    report.innerHTML = "";
    results.classList.add("hidden");
    population.focus();
  }

  btnAnalyze.addEventListener("click", runAnalysis);
  btnReset.addEventListener("click", resetForm);
  btnPrint.addEventListener("click", () => window.print());
});
