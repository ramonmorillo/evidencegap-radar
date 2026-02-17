import { getJson } from "./api.js";
import { renderResults } from "./report.js";
import { hashKey, cacheGet, cacheSet, cacheClear, cacheCount } from "./cache.js";
import { EXAMPLES } from "./examples.js";

const PERSIST_KEY = "egr_lastSearch";
const FIELDS = ["population", "intervention", "outcome", "context"];
const FIELD_LABELS = { population: "P", intervention: "I/E", outcome: "O", context: "Contexto" };

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ===================== App =====================

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  // --- DOM refs ---
  const inputs = {};
  FIELDS.forEach(f => { inputs[f] = $(f); });
  const windowSel      = $("window");
  const btnAnalyze     = $("analyze");
  const btnReset       = $("reset");
  const btnPrint       = $("print");
  const btnClearCache  = $("clearCache");
  const btnCopyQuery   = $("copyQuery");
  const results        = $("results");
  const report         = $("report");
  const errorBox       = $("errorBox");
  const cacheIndicator = $("cacheIndicator");
  const loadingBox     = $("loadingBox");
  const queryPreview   = $("queryPreview");
  const strategyHuman  = $("strategyHuman");
  const exampleSel     = $("exampleSelector");

  // --- Synonym state ---
  const synonyms = { population: [], intervention: [], outcome: [], context: [] };

  // --- AbortController ---
  let currentController = null;

  // ===================== UI helpers =====================

  function showError(msg) { errorBox.innerHTML = msg; errorBox.classList.remove("hidden"); }
  function clearError()   { errorBox.textContent = ""; errorBox.classList.add("hidden"); }

  function showLoading(show) {
    if (loadingBox) loadingBox.classList.toggle("hidden", !show);
    btnAnalyze.disabled = show;
    btnAnalyze.textContent = show ? "Analizando\u2026" : "Analizar";
  }

  function showEmpty() {
    report.innerHTML = `<div class="empty-state"><p><b>Sin resultados</b></p>
      <p>No se encontraron publicaciones ni ensayos. Prueba con sin\u00f3nimos, MeSH o una b\u00fasqueda m\u00e1s amplia.</p></div>`;
    results.classList.remove("hidden");
  }

  function showCacheIndicator(show) {
    if (cacheIndicator) cacheIndicator.classList.toggle("hidden", !show);
  }

  function updateCacheBadge() {
    if (btnClearCache) btnClearCache.title = `${cacheCount()} entrada(s) en cach\u00e9`;
  }

  // ===================== Synonym chips =====================

  function renderChips(field) {
    const container = $(`synChips-${field}`);
    if (!container) return;
    container.innerHTML = synonyms[field].map((s, i) =>
      `<span class="syn-chip">${esc(s)}<button type="button" data-field="${field}" data-idx="${i}" class="syn-remove" title="Eliminar">\u00d7</button></span>`
    ).join("");
    container.querySelectorAll(".syn-remove").forEach(btn => {
      btn.onclick = () => {
        synonyms[btn.dataset.field].splice(Number(btn.dataset.idx), 1);
        renderChips(btn.dataset.field);
        updateQueryPreview();
      };
    });
  }

  function addSynonym(field, term) {
    const t = term.trim();
    if (!t) return;
    if (synonyms[field].some(s => s.toLowerCase() === t.toLowerCase())) return;
    synonyms[field].push(t);
    renderChips(field);
    updateQueryPreview();
  }

  document.querySelectorAll(".syn-input").forEach(inp => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addSynonym(inp.dataset.field, inp.value);
        inp.value = "";
      }
    });
  });

  // ===================== Query Builder =====================

  function getAllTerms(field) {
    const main = (inputs[field]?.value || "").trim();
    const syns = synonyms[field] || [];
    return [main, ...syns].filter(Boolean);
  }

  function buildTerm() {
    const parts = [];
    for (const f of FIELDS) {
      const terms = getAllTerms(f);
      if (!terms.length) continue;
      if (terms.length === 1) {
        parts.push(`(${terms[0]})`);
      } else {
        parts.push(`(${terms.join(" OR ")})`);
      }
    }
    return parts.join(" AND ");
  }

  function updateQueryPreview() {
    const term = buildTerm();
    if (queryPreview) queryPreview.value = term;
    updateStrategyHuman();
  }

  function updateStrategyHuman() {
    if (!strategyHuman) return;
    let html = "";
    for (const f of FIELDS) {
      const terms = getAllTerms(f);
      if (!terms.length) continue;
      const label = FIELD_LABELS[f];
      const chips = terms.map(t => `<span class="chip">${esc(t)}</span>`).join("");
      html += `<div class="strategy-row"><span class="strategy-label">${label}</span><div class="strategy-terms">${chips}</div></div>`;
    }
    strategyHuman.innerHTML = html || '<p class="muted">Escribe en los campos PICO para ver la estrategia.</p>';
  }

  FIELDS.forEach(f => {
    if (inputs[f]) inputs[f].addEventListener("input", updateQueryPreview);
  });

  if (btnCopyQuery) {
    btnCopyQuery.addEventListener("click", () => {
      const text = queryPreview?.value || "";
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        btnCopyQuery.textContent = "Copiado";
        setTimeout(() => { btnCopyQuery.textContent = "Copiar"; }, 1500);
      }).catch(() => {
        queryPreview.select();
        document.execCommand("copy");
        btnCopyQuery.textContent = "Copiado";
        setTimeout(() => { btnCopyQuery.textContent = "Copiar"; }, 1500);
      });
    });
  }

  // ===================== Examples =====================

  if (exampleSel) {
    EXAMPLES.forEach((ex, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = ex.name;
      exampleSel.appendChild(opt);
    });

    exampleSel.addEventListener("change", () => {
      const idx = exampleSel.value;
      if (idx === "") return;
      const ex = EXAMPLES[Number(idx)];
      if (!ex) return;
      FIELDS.forEach(f => {
        inputs[f].value = ex[f] || "";
        synonyms[f] = [...(ex.synonyms?.[f] || [])];
        renderChips(f);
      });
      updateQueryPreview();
      setTimeout(() => runAnalysis(), 100);
    });
  }

  // ===================== Classification =====================

  function classifyEvidence(pubRecent, pub10y, trialN) {
    if (pub10y <= 10 && trialN === 0)
      return { label: "Hu\u00e9rfano", rationale: "Muy poca evidencia publicada y sin se\u00f1ales de ensayos." };
    if (pubRecent <= 5 && trialN <= 1)
      return { label: "Emergente", rationale: "Pocas se\u00f1ales recientes; posible nicho o evidencia incipiente." };
    if (pubRecent >= 50 && pub10y >= 500)
      return { label: "Saturado", rationale: "Much\u00edsima publicaci\u00f3n; conviene afinar a subpreguntas." };
    if (trialN > 0)
      return { label: "Maduro (activo)", rationale: "Hay ensayos registrados; investigaci\u00f3n en curso." };
    return { label: "Moderado", rationale: "Evidencia intermedia. Buen terreno para revisar brechas." };
  }

  function suggestOpps(pubRecent, trialN) {
    const opps = [];
    if (trialN > 0) opps.push("Hay ensayos activos: mapear outcomes, comparabilidad y brechas.");
    if (pubRecent === 0) opps.push("Sin se\u00f1ales recientes: probar sin\u00f3nimos/MeSH o reformular.");
    if (trialN === 0) opps.push("Sin ensayos: valorar piloto/factibilidad.");
    if (!opps.length) opps.push("Refinar la pregunta: poblaci\u00f3n m\u00e1s concreta, outcome medible.");
    return opps;
  }

  function countBy(arr, fn) {
    const out = {};
    for (const x of (arr || [])) { const k = fn(x) || "UNKNOWN"; out[k] = (out[k] || 0) + 1; }
    return out;
  }

  // ===================== Persistence =====================

  function saveSearch() {
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify({
        population: inputs.population.value,
        intervention: inputs.intervention.value,
        outcome: inputs.outcome.value,
        context: inputs.context.value,
        window: windowSel.value,
        synonyms
      }));
    } catch { /* ignore */ }
  }

  function restoreSearch() {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      FIELDS.forEach(f => {
        if (s[f]) inputs[f].value = s[f];
        if (s.synonyms?.[f]) {
          synonyms[f] = [...s.synonyms[f]];
          renderChips(f);
        }
      });
      if (s.window) windowSel.value = s.window;
    } catch { /* ignore */ }
  }

  // ===================== Main analysis =====================

  async function runAnalysis() {
    clearError();
    showCacheIndicator(false);

    if (currentController) currentController.abort();
    currentController = new AbortController();
    const { signal } = currentController;
    showLoading(true);

    try {
      const term = (queryPreview?.value || buildTerm()).trim();
      if (!term) { showError("Introduce al menos un campo PICO."); return; }

      const query = {
        title: "PICO-lite",
        population: inputs.population.value,
        intervention: inputs.intervention.value,
        outcome: inputs.outcome.value,
        context: inputs.context.value
      };
      const reldate = String(windowSel.value || "7");

      saveSearch();

      const cacheKey = hashKey(term, reldate);
      const cached = cacheGet(cacheKey);
      if (cached) {
        report.innerHTML = cached;
        results.classList.remove("hidden");
        showCacheIndicator(true);
        return;
      }

      // PubMed recent
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

      // PubMed 10y
      const es10y = await getJson(
        `/api/pubmed/esearch?term=${encodeURIComponent(term)}&reldate=3650&retmax=0`,
        { signal }
      );
      const pub10y = Number(es10y?.esearchresult?.count || 0);

      // ClinicalTrials
      const ct = await getJson(
        `/api/ctgov/search?query=${encodeURIComponent(term)}&pageSize=25`,
        { signal }
      );
      const studies = ct?.studies || ct?.results || [];
      const trialN = Number(ct?.total || ct?.totalCount || studies.length || 0);

      if (pubRecent === 0 && pub10y === 0 && trialN === 0) { showEmpty(); return; }

      const statusCounts = countBy(studies, s => s?.protocolSection?.statusModule?.overallStatus || "UNKNOWN");
      const phaseCounts = countBy(studies, s => {
        const ph = s?.protocolSection?.designModule?.phases;
        return (Array.isArray(ph) && ph.length) ? ph.join(",") : "\u2014";
      });

      const evidenceClass = classifyEvidence(pubRecent, pub10y, trialN);
      const opps = suggestOpps(pubRecent, trialN);

      const html = renderResults({
        query, pub10y, pubRecent,
        trials: { n: trialN, statusCounts, phaseCounts },
        evidenceClass, opps, topPubs,
        searchTerm: term, reldate
      });

      report.innerHTML = html;
      results.classList.remove("hidden");
      cacheSet(cacheKey, html);
      updateCacheBadge();

    } catch (e) {
      if (e?.name === "AbortError") return;
      showError(e?._userMessage || `Error: ${e?.message || String(e)}`);
    } finally {
      showLoading(false);
    }
  }

  // ===================== Reset =====================

  function resetForm() {
    clearError();
    showCacheIndicator(false);
    FIELDS.forEach(f => { inputs[f].value = ""; synonyms[f] = []; renderChips(f); });
    windowSel.value = "7";
    if (exampleSel) exampleSel.value = "";
    report.innerHTML = "";
    results.classList.add("hidden");
    updateQueryPreview();
    inputs.population.focus();
    try { localStorage.removeItem(PERSIST_KEY); } catch { /* ignore */ }
  }

  // ===================== Events =====================

  const debouncedAnalysis = debounce(runAnalysis, 400);
  btnAnalyze.addEventListener("click", debouncedAnalysis);
  btnReset.addEventListener("click", resetForm);
  btnPrint.addEventListener("click", () => window.print());

  FIELDS.forEach(f => {
    inputs[f].addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); debouncedAnalysis(); }
    });
  });

  if (btnClearCache) {
    btnClearCache.addEventListener("click", () => {
      const n = cacheClear();
      showCacheIndicator(false);
      updateCacheBadge();
      btnClearCache.textContent = `Cach\u00e9: ${n} borrada${n !== 1 ? "s" : ""}`;
      setTimeout(() => { btnClearCache.textContent = "Limpiar cach\u00e9"; }, 2000);
    });
  }

  // ===================== Init =====================
  restoreSearch();
  updateQueryPreview();
  updateCacheBadge();
});
