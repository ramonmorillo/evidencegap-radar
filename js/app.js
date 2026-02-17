import { getJson } from "./api.js";
import { renderResults } from "./report.js";
import { hashKey, cacheGet, cacheSet, cacheClear, cacheCount } from "./cache.js";

// --------------- Persistencia keys ---------------
const PERSIST_KEY = "egr_lastSearch";

// --------------- Utilidades ---------------

/** Debounce: retrasa la ejecución hasta que paren de llamar durante `ms`. */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// --------------- App ---------------

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const population   = $("population");
  const intervention = $("intervention");
  const outcome      = $("outcome");
  const context      = $("context");
  const windowSel    = $("window");

  const btnAnalyze   = $("analyze");
  const btnReset     = $("reset");
  const btnPrint     = $("print");
  const btnClearCache = $("clearCache");

  const results      = $("results");
  const report       = $("report");
  const errorBox     = $("errorBox");
  const cacheIndicator = $("cacheIndicator");
  const loadingBox   = $("loadingBox");

  // Verificar que todos los elementos existen
  const required = [
    population, intervention, outcome, context,
    windowSel, btnAnalyze, btnReset, btnPrint,
    results, report, errorBox
  ];
  if (required.some(x => !x)) {
    alert("Falta algún elemento en index.html (IDs no coinciden). Revisa que hayas pegado el index completo.");
    return;
  }

  // --------------- AbortController ---------------
  let currentController = null;

  // --------------- UI States ---------------

  function showError(msg) {
    errorBox.innerHTML = msg;
    errorBox.classList.remove("hidden");
  }

  function clearError() {
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
  }

  function showLoading(show) {
    if (loadingBox) {
      loadingBox.classList.toggle("hidden", !show);
    }
    btnAnalyze.disabled = show;
    btnAnalyze.textContent = show ? "Analizando\u2026" : "Analizar";
  }

  function showEmpty() {
    report.innerHTML = `
      <div class="empty-state">
        <p><b>Sin resultados</b></p>
        <p>No se encontraron publicaciones ni ensayos para estos t\u00e9rminos.
        Prueba con sin\u00f3nimos, t\u00e9rminos MeSH o una b\u00fasqueda m\u00e1s amplia.</p>
      </div>`;
    results.classList.remove("hidden");
  }

  function showCacheIndicator(show) {
    if (cacheIndicator) {
      cacheIndicator.classList.toggle("hidden", !show);
    }
  }

  function updateCacheBadge() {
    if (btnClearCache) {
      const n = cacheCount();
      btnClearCache.title = `${n} entrada(s) en cach\u00e9`;
    }
  }

  // --------------- Build term ---------------

  function buildTerm({ population, intervention, outcome, context }) {
    const parts = [population, intervention, outcome, context]
      .map(x => (x || "").trim())
      .filter(Boolean)
      .map(x => `(${x})`);
    return parts.join(" AND ");
  }

  // --------------- Classify ---------------

  function classifyEvidence(pubRecent, pub10y, trialN) {
    if (pub10y <= 10 && trialN === 0) {
      return { label: "Hu\u00e9rfano", rationale: "Muy poca evidencia publicada y sin se\u00f1ales de ensayos." };
    }
    if (pubRecent <= 5 && trialN <= 1) {
      return { label: "Emergente", rationale: "Pocas se\u00f1ales recientes; posible nicho o evidencia incipiente." };
    }
    if (pubRecent >= 50 && pub10y >= 500) {
      return { label: "Saturado", rationale: "Much\u00edsima publicaci\u00f3n; conviene afinar a subpreguntas o outcomes espec\u00edficos." };
    }
    if (trialN > 0) {
      return { label: "Maduro (activo)", rationale: "Hay ensayos registrados; existe actividad de investigaci\u00f3n en curso." };
    }
    return { label: "Moderado", rationale: "Evidencia intermedia. Buen terreno para revisar brechas y comparabilidad." };
  }

  function suggestOpps(pubRecent, trialN) {
    const opps = [];
    if (trialN > 0) opps.push("Hay ensayos activos: mapear outcomes, comparabilidad y brechas.");
    if (pubRecent === 0) opps.push("Sin se\u00f1ales recientes: probar sin\u00f3nimos/MeSH o reformular t\u00e9rminos.");
    if (trialN === 0) opps.push("Sin ensayos: valorar piloto/factibilidad o estudios cualitativos/mixtos.");
    if (!opps.length) opps.push("Refinar la pregunta: poblaci\u00f3n m\u00e1s concreta, intervenci\u00f3n y outcome medible.");
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

  // --------------- Persistencia ---------------

  function saveSearch() {
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify({
        population: population.value,
        intervention: intervention.value,
        outcome: outcome.value,
        context: context.value,
        window: windowSel.value
      }));
    } catch { /* ignorar */ }
  }

  function restoreSearch() {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.population) population.value = s.population;
      if (s.intervention) intervention.value = s.intervention;
      if (s.outcome) outcome.value = s.outcome;
      if (s.context) context.value = s.context;
      if (s.window) windowSel.value = s.window;
    } catch { /* ignorar */ }
  }

  // --------------- Análisis principal ---------------

  async function runAnalysis() {
    clearError();
    showCacheIndicator(false);

    // Abortar petición anterior si existe
    if (currentController) {
      currentController.abort();
    }
    currentController = new AbortController();
    const { signal } = currentController;

    showLoading(true);

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

      if (!term) {
        showError("Introduce al menos un campo (Poblaci\u00f3n, Intervenci\u00f3n, Outcome).");
        return;
      }

      // Persistir la búsqueda
      saveSearch();

      // ---- Check cache ----
      const cacheKey = hashKey(term, reldate);
      const cached = cacheGet(cacheKey);
      if (cached) {
        report.innerHTML = cached;
        results.classList.remove("hidden");
        showCacheIndicator(true);
        return;
      }

      // ---- PubMed: ventana seleccionada ----
      const esRecent = await getJson(
        `/api/pubmed/esearch?term=${encodeURIComponent(term)}&reldate=${encodeURIComponent(reldate)}&retmax=10`,
        { signal }
      );
      const pubRecent = Number(esRecent?.esearchresult?.count || 0);
      const idlist = esRecent?.esearchresult?.idlist || [];

      let topPubs = [];
      if (idlist.length) {
        const esum = await getJson(
          `/api/pubmed/esummary?ids=${encodeURIComponent(idlist.join(","))}`,
          { signal }
        );
        const uids = esum?.result?.uids || [];
        topPubs = uids.map(uid => esum.result[uid]).filter(Boolean);
      }

      // ---- PubMed: 10 años ----
      const es10y = await getJson(
        `/api/pubmed/esearch?term=${encodeURIComponent(term)}&reldate=3650&retmax=0`,
        { signal }
      );
      const pub10y = Number(es10y?.esearchresult?.count || 0);

      // ---- ClinicalTrials ----
      const ct = await getJson(
        `/api/ctgov/search?query=${encodeURIComponent(term)}&pageSize=25`,
        { signal }
      );
      const studies = ct?.studies || ct?.results || [];
      const trialN = Number(ct?.total || ct?.totalCount || studies.length || 0);

      // ---- Empty state ----
      if (pubRecent === 0 && pub10y === 0 && trialN === 0) {
        showEmpty();
        return;
      }

      const statusCounts = countBy(studies, (s) => {
        const st = s?.protocolSection?.statusModule?.overallStatus;
        return st || "UNKNOWN";
      });

      const phaseCounts = countBy(studies, (s) => {
        const ph = s?.protocolSection?.designModule?.phases;
        if (Array.isArray(ph) && ph.length) return ph.join(",");
        return "\u2014";
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

      // Guardar en cache
      cacheSet(cacheKey, html);
      updateCacheBadge();

    } catch (e) {
      // No mostrar error si fue un abort intencional (nueva búsqueda)
      if (e?.name === "AbortError") return;

      const userMsg = e?._userMessage || `Error: ${e?.message || String(e)}`;
      showError(userMsg);

    } finally {
      showLoading(false);
    }
  }

  // --------------- Reset ---------------

  function resetForm() {
    clearError();
    showCacheIndicator(false);
    population.value = "";
    intervention.value = "";
    outcome.value = "";
    context.value = "";
    windowSel.value = "7";
    report.innerHTML = "";
    results.classList.add("hidden");
    population.focus();
    try { localStorage.removeItem(PERSIST_KEY); } catch { /* ignorar */ }
  }

  // --------------- Event listeners ---------------

  // Debounce: el botón Analizar con debounce de 400ms para evitar doble-click
  const debouncedAnalysis = debounce(runAnalysis, 400);

  btnAnalyze.addEventListener("click", debouncedAnalysis);
  btnReset.addEventListener("click", resetForm);
  btnPrint.addEventListener("click", () => window.print());

  // Enter en cualquier input también lanza análisis (con debounce)
  [population, intervention, outcome, context].forEach(input => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        debouncedAnalysis();
      }
    });
  });

  // Limpiar caché
  if (btnClearCache) {
    btnClearCache.addEventListener("click", () => {
      const n = cacheClear();
      showCacheIndicator(false);
      updateCacheBadge();
      btnClearCache.textContent = `Limpiar cach\u00e9 (${n} borrada${n !== 1 ? "s" : ""})`;
      setTimeout(() => { btnClearCache.textContent = "Limpiar cach\u00e9"; }, 2000);
    });
  }

  // --------------- Init ---------------
  restoreSearch();
  updateCacheBadge();
});
