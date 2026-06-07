import { getJson } from "./api.js";
import { renderResults } from "./report.js";
import { hashKey, cacheGet, cacheSet, cacheClear, cacheCount } from "./cache.js";
import { exportCSV, exportRIS } from "./export.js";
import { EXAMPLES } from "./examples.js";
import { meshAutocomplete, buildMeshQuery, renderMeshStrategyPanel } from "./mesh.js";
import { esc } from "./util.js";

const PERSIST_KEY = "egr_lastSearch";
const FIELDS = ["population", "intervention", "outcome", "context"];
const FIELD_LABELS = { population: "P", intervention: "I/E", outcome: "O", context: "Contexto" };

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
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
  const meshToggle     = $("meshToggle");
  const meshNotice     = $("meshNotice");

  // --- State ---
  const synonyms = { population: [], intervention: [], outcome: [], context: [] };
  const meshTerms = { population: [], intervention: [], outcome: [], context: [] };
  let meshMode = false;
  let currentController = null;
  let meshAcController = null;
  let _runId = 0;

  // ===================== UI helpers =====================

  function showError(msg) { errorBox.innerHTML = msg; errorBox.classList.remove("hidden"); }
  function clearError()   { errorBox.textContent = ""; errorBox.classList.add("hidden"); }

  function showLoading(show) {
    if (loadingBox) {
      loadingBox.classList.toggle("hidden", !show);
      if (show) {
        const span = loadingBox.querySelector("span:last-child");
        if (span) span.textContent = "Consultando PubMed y ClinicalTrials.gov\u2026";
      }
    }
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

  // ===================== MeSH mode toggle =====================

  function setMeshMode(on) {
    meshMode = on;
    if (meshToggle) meshToggle.checked = on;
    if (meshNotice) meshNotice.classList.toggle("hidden", !on);

    FIELDS.forEach(f => {
      const synArea = $(`synArea-${f}`);
      const meshChips = $(`meshChips-${f}`);
      if (synArea) synArea.classList.toggle("hidden", on);
      if (meshChips) meshChips.classList.toggle("hidden", !on);
    });

    updateQueryPreview();
  }

  if (meshToggle) {
    meshToggle.addEventListener("change", () => setMeshMode(meshToggle.checked));
  }

  // ===================== MeSH Autocomplete =====================

  const debouncedMeshAc = debounce(async (field, term) => {
    const drop = $(`acDrop-${field}`);
    if (!drop) return;
    if (!term || term.length < 2) { drop.classList.add("hidden"); return; }

    if (meshAcController) meshAcController.abort();
    meshAcController = new AbortController();

    try {
      const items = await meshAutocomplete(term, meshAcController.signal);
      if (!items.length) { drop.classList.add("hidden"); return; }

      acItems[field] = items;
      drop.innerHTML = items.map((it, i) =>
        `<div class="ac-item" data-idx="${i}"><span class="ac-label">${esc(it.label)}</span><small class="ac-type">${esc(it.type)}</small></div>`
      ).join("");
      drop.classList.remove("hidden");

      drop.querySelectorAll(".ac-item").forEach(el => {
        el.onclick = () => {
          const idx = Number(el.dataset.idx);
          addMeshTerm(field, items[idx]);
          drop.classList.add("hidden");
          inputs[field].value = "";
        };
      });
    } catch (e) {
      if (e?.name !== "AbortError") drop.classList.add("hidden");
    }
  }, 300);

  // Attach autocomplete to inputs (only active in MeSH mode)
  // acItems holds the last resolved suggestions per field for keyboard selection.
  const acItems = {};

  FIELDS.forEach(f => {
    let acActiveIdx = -1;

    function acHighlight(drop) {
      drop.querySelectorAll(".ac-item").forEach((el, i) => {
        el.classList.toggle("ac-active", i === acActiveIdx);
      });
    }

    function acReset(drop) {
      acActiveIdx = -1;
      drop?.querySelectorAll(".ac-item").forEach(el => el.classList.remove("ac-active"));
    }

    inputs[f].addEventListener("input", () => {
      if (!meshMode) return;
      acActiveIdx = -1;
      debouncedMeshAc(f, inputs[f].value.trim());
    });

    inputs[f].addEventListener("keydown", e => {
      const drop = $(`acDrop-${f}`);
      const isOpen = drop && !drop.classList.contains("hidden");

      if (e.key === "ArrowDown") {
        if (!isOpen) return;
        e.preventDefault();
        const count = drop.querySelectorAll(".ac-item").length;
        acActiveIdx = Math.min(acActiveIdx + 1, count - 1);
        acHighlight(drop);
      } else if (e.key === "ArrowUp") {
        if (!isOpen) return;
        e.preventDefault();
        acActiveIdx = Math.max(acActiveIdx - 1, 0);
        acHighlight(drop);
      } else if (e.key === "Enter") {
        if (isOpen && acActiveIdx >= 0 && acItems[f]?.[acActiveIdx]) {
          e.preventDefault();
          e.stopImmediatePropagation();
          addMeshTerm(f, acItems[f][acActiveIdx]);
          drop.classList.add("hidden");
          acReset(drop);
          inputs[f].value = "";
        }
      } else if (e.key === "Escape") {
        if (isOpen) {
          e.preventDefault();
          drop.classList.add("hidden");
          acReset(drop);
        }
      }
    });

    // Close dropdown on blur (with slight delay for click)
    inputs[f].addEventListener("blur", () => {
      setTimeout(() => {
        const drop = $(`acDrop-${f}`);
        if (drop) { drop.classList.add("hidden"); acReset(drop); }
      }, 200);
    });
  });

  // ===================== MeSH Chips =====================

  function addMeshTerm(field, item) {
    if (meshTerms[field].some(t => t.ui === item.ui)) return;
    meshTerms[field].push({
      label: item.label,
      ui: item.ui,
      type: item.type,
      explode: true,
      major: false
    });
    renderMeshChips(field);
    updateQueryPreview();
  }

  function removeMeshTerm(field, idx) {
    meshTerms[field].splice(idx, 1);
    renderMeshChips(field);
    updateQueryPreview();
  }

  function toggleMeshOption(field, idx, option) {
    const t = meshTerms[field][idx];
    if (!t) return;
    t[option] = !t[option];
    renderMeshChips(field);
    updateQueryPreview();
  }

  function renderMeshChips(field) {
    const container = $(`meshChips-${field}`);
    if (!container) return;
    if (!meshTerms[field].length) {
      container.innerHTML = '<span class="muted" style="font-size:12px">Escribe arriba para buscar t\u00e9rminos MeSH</span>';
      return;
    }
    container.innerHTML = meshTerms[field].map((t, i) => {
      const expClass = t.explode ? "active" : "";
      const majClass = t.major ? "active" : "";
      return `<span class="mesh-chip">
        <span class="mesh-chip-label">${esc(t.label)}</span>
        <small class="mesh-chip-ui">${esc(t.ui)}</small>
        <button type="button" class="mesh-opt ${expClass}" data-field="${field}" data-idx="${i}" data-opt="explode" title="Explode">Exp</button>
        <button type="button" class="mesh-opt ${majClass}" data-field="${field}" data-idx="${i}" data-opt="major" title="Major Topic">Maj</button>
        <button type="button" class="mesh-remove" data-field="${field}" data-idx="${i}" title="Eliminar">\u00d7</button>
      </span>`;
    }).join("");

    container.querySelectorAll(".mesh-opt").forEach(btn => {
      btn.onclick = () => toggleMeshOption(btn.dataset.field, Number(btn.dataset.idx), btn.dataset.opt);
    });
    container.querySelectorAll(".mesh-remove").forEach(btn => {
      btn.onclick = () => removeMeshTerm(btn.dataset.field, Number(btn.dataset.idx));
    });
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
    if (meshMode) {
      return buildMeshQuery(meshTerms);
    }
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

    if (meshMode) {
      let html = "";
      for (const f of FIELDS) {
        if (!meshTerms[f]?.length) continue;
        const label = FIELD_LABELS[f];
        const chips = meshTerms[f].map(t => {
          const flags = [];
          flags.push(t.explode ? "Exp" : "noexp");
          if (t.major) flags.push("Major");
          return `<span class="chip">${esc(t.label)} <small>[${flags.join(",")}]</small></span>`;
        }).join("");
        html += `<div class="strategy-row"><span class="strategy-label">${label}</span><div class="strategy-terms">${chips}</div></div>`;
      }
      strategyHuman.innerHTML = html || '<p class="muted">Busca t\u00e9rminos MeSH en los campos PICO.</p>';
      return;
    }

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
    if (inputs[f]) inputs[f].addEventListener("input", () => {
      if (!meshMode) updateQueryPreview();
    });
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
      if (meshMode) setMeshMode(false);
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

  // Configurable thresholds \u2014 bump SCHEMA_VERSION in cache.js when changing these.
  const TH = {
    masaEscasaPub:     50,   // pub10y below this AND 0 SR/MA \u2192 escasa
    masaAbundantePub:  300,  // pub10y at or above this \u2192 abundante (regardless of SR/MA)
    masaAbundanteSrMa: 5,    // srMaCount at or above this \u2192 abundante
    srMaParaMasa:      1,    // (reserved for future sub-axis)
    tendenciaSube:     1.2,  // reciente/antiguo ratio above \u2192 creciente
    tendenciaBaja:     0.8   // reciente/antiguo ratio below \u2192 decreciente
  };

  function classifyEvidence({ pub10y, srMaCount, trialsActive, yearCounts }) {
    // --- Eje MASA ---
    const srMa = srMaCount ?? 0;
    let masa;
    if (pub10y < TH.masaEscasaPub && srMa === 0)                              masa = "escasa";
    else if (pub10y >= TH.masaAbundantePub || srMa >= TH.masaAbundanteSrMa)   masa = "abundante";
    else                                                                        masa = "moderada";

    // --- Eje TENDENCIA (5 franjas de 365 d, orden: hace5a \u2026 hace1a) ---
    const vals = (yearCounts || []).map(b => b.value);
    const reciente = vals.slice(-2).reduce((s, v) => s + v, 0);   // franjas 4a y 5a (m\u00e1s recientes)
    const antiguo  = vals.slice(0, -2).reduce((s, v) => s + v, 0); // franjas 5a\u20133a (m\u00e1s antiguas)
    const ratio = reciente / Math.max(1, antiguo);
    let tendencia;
    if (ratio > TH.tendenciaSube)     tendencia = "creciente";
    else if (ratio < TH.tendenciaBaja) tendencia = "decreciente";
    else                               tendencia = "estable";

    // --- Eje DINAMISMO (trialsActive como binario) ---
    const dinamismo = (trialsActive >= 1 || tendencia === "creciente") ? "activo" : "latente";

    // --- Matriz de salida ---
    if (masa === "escasa"    && dinamismo === "latente") return { label: "Hu\u00e9rfano",        rationale: "Evidencia escasa y sin actividad detectable." };
    if (masa === "escasa"    && dinamismo === "activo")  return { label: "Emergente",        rationale: "Poca evidencia pero con investigaci\u00f3n en marcha." };
    if (masa === "moderada"  && dinamismo === "activo")  return { label: "Maduro (activo)", rationale: "Cuerpo de evidencia en crecimiento o con ensayos." };
    if (masa === "moderada"  && dinamismo === "latente") return { label: "En consolidaci\u00f3n", rationale: "Evidencia intermedia, sin se\u00f1ales recientes fuertes." };
    if (masa === "abundante" && dinamismo === "activo")  return { label: "Maduro (activo)", rationale: "Evidencia amplia y a\u00fan en desarrollo." };
    return                                                         { label: "Saturado",       rationale: "Mucho publicado y sintetizado; poco margen nuevo." };
  }

  function suggestOpps(trialsActive, pub10y) {
    const opps = [];
    if (trialsActive > 0) opps.push("Hay ensayos activos: mapear outcomes, comparabilidad y brechas.");
    if (pub10y === 0)     opps.push("Sin publicaciones: probar sin\u00f3nimos/MeSH o reformular la pregunta.");
    if (trialsActive === 0) opps.push("Sin ensayos activos: valorar piloto o estudio de factibilidad.");
    if (!opps.length)     opps.push("Refinar la pregunta: poblaci\u00f3n m\u00e1s concreta, outcome medible.");
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
        synonyms,
        meshMode,
        meshTerms
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
        if (s.meshTerms?.[f]) {
          meshTerms[f] = [...s.meshTerms[f]];
          renderMeshChips(f);
        }
      });
      if (s.window) windowSel.value = s.window;
      if (s.meshMode) setMeshMode(true);
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
    const myRunId = ++_runId;

    // Retry UI feedback — update loading text on any 429 retry
    const onRetry = () => {
      if (loadingBox) {
        const span = loadingBox.querySelector("span:last-child");
        if (span) span.textContent = "Rate limit \u2014 reintentando autom\u00e1ticamente\u2026";
      }
    };

    try {
      const term = (queryPreview?.value || buildTerm()).trim();

      if (meshMode) {
        const hasMesh = FIELDS.some(f => meshTerms[f].length > 0);
        if (!hasMesh) {
          showError("Selecciona al menos un t\u00e9rmino MeSH del desplegable.");
          return;
        }
      }

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

      const cacheKey = hashKey(term, reldate, meshMode ? "mesh" : "free");
      const cached = cacheGet(cacheKey);
      if (cached) {
        report.innerHTML = cached;
        results.classList.remove("hidden");
        showCacheIndicator(true);
        wireExportButtons([]);
        wireTableFilters();
        return;
      }

      // --- Parallel batch 1: core data ---
      const enc = encodeURIComponent(term);
      const [esRecent, es10y, ct, esSrMa] = await Promise.all([
        getJson(`/api/pubmed/esearch?term=${enc}&reldate=${encodeURIComponent(reldate)}&retmax=20`, { signal, onRetry }),
        getJson(`/api/pubmed/esearch?term=${enc}&reldate=3650&retmax=0`, { signal, onRetry }),
        getJson(`/api/ctgov/search?query=${enc}&pageSize=25`, { signal, onRetry }),
        getJson(`/api/pubmed/esearch?term=${enc}+AND+(systematic+review[pt]+OR+meta-analysis[pt])&reldate=3650&retmax=0`, { signal, onRetry })
          .catch(() => null)
      ]);

      const pubRecent = Number(esRecent?.esearchresult?.count || 0);
      const idlist = esRecent?.esearchresult?.idlist || [];
      const pub10y = Number(es10y?.esearchresult?.count || 0);
      const srMaCount = esSrMa ? Number(esSrMa?.esearchresult?.count || 0) : null;

      const studies = ct?.studies || ct?.results || [];
      const trialN = Number(ct?.total || ct?.totalCount || studies.length || 0);

      // --- Batch 2: esummary + year-by-year counts (parallel) ---
      const yearDays = [365, 730, 1095, 1460, 1825];
      const yearPromises = yearDays.map(d =>
        getJson(`/api/pubmed/esearch?term=${enc}&reldate=${d}&retmax=0`, { signal, onRetry })
          .then(r => Number(r?.esearchresult?.count || 0))
          .catch(() => 0)
      );

      let topPubs = [];
      const esumPromise = idlist.length
        ? getJson(`/api/pubmed/esummary?ids=${encodeURIComponent(idlist.join(","))}`, { signal, onRetry })
        : Promise.resolve(null);

      const [esum, ...yCounts] = await Promise.all([esumPromise, ...yearPromises]);

      if (esum) {
        const uids = esum?.result?.uids || [];
        topPubs = uids.map(uid => esum.result[uid]).filter(Boolean);
      }

      // Build rolling-window data (derive per-365d band from cumulative reldate counts).
      // Labels are relative ("hace Xa") because these are 365-day windows, not calendar years.
      const yearCounts = [];
      for (let i = yCounts.length - 1; i >= 0; i--) {
        const prev = i > 0 ? yCounts[i - 1] : 0;
        const perYear = Math.max(0, yCounts[i] - prev);
        yearCounts.push({ label: "hace " + (i + 1) + "a", value: perYear });
      }

      // Extract publication types from topPubs
      const pubTypeCounts = {};
      for (const p of topPubs) {
        for (const t of (p.pubtype || [])) { pubTypeCounts[t] = (pubTypeCounts[t] || 0) + 1; }
      }

      if (myRunId !== _runId) return; // stale run — a newer analysis was launched

      if (pubRecent === 0 && pub10y === 0 && trialN === 0) { showEmpty(); return; }

      const statusCounts = countBy(studies, s => s?.protocolSection?.statusModule?.overallStatus || "UNKNOWN");
      const phaseCounts = countBy(studies, s => {
        const ph = s?.protocolSection?.designModule?.phases;
        return (Array.isArray(ph) && ph.length) ? ph.join(",") : "\u2014";
      });

      const trialsActive = (statusCounts["RECRUITING"] || 0)
        + (statusCounts["ACTIVE_NOT_RECRUITING"] || 0)
        + (statusCounts["ENROLLING_BY_INVITATION"] || 0);

      const evidenceClass = classifyEvidence({ pub10y, srMaCount, trialsActive, yearCounts });
      const opps = suggestOpps(trialsActive, pub10y);

      // MeSH strategy HTML if in MeSH mode
      const meshStrategyHtml = meshMode ? renderMeshStrategyPanel(meshTerms) : "";

      const html = renderResults({
        query, pub10y, pubRecent,
        trials: { n: trialN, statusCounts, phaseCounts },
        evidenceClass, opps, topPubs,
        searchTerm: term, reldate,
        srMaCount, yearCounts, pubTypeCounts,
        meshStrategyHtml
      });

      report.innerHTML = html;
      results.classList.remove("hidden");
      cacheSet(cacheKey, html);
      updateCacheBadge();

      // --- Post-render: wire export buttons & table filters ---
      wireExportButtons(topPubs);
      wireTableFilters();

    } catch (e) {
      if (e?.name === "AbortError") return;
      showError(e?._userMessage || `Error: ${e?.message || String(e)}`);
    } finally {
      showLoading(false);
    }
  }

  // ===================== Post-render wiring =====================

  function wireExportButtons(pubs) {
    const btnCSV = document.getElementById("exportCSV");
    const btnRIS = document.getElementById("exportRIS");
    if (btnCSV) btnCSV.onclick = () => exportCSV(pubs, "evidencegap_results.csv");
    if (btnRIS) btnRIS.onclick = () => exportRIS(pubs, "evidencegap_results.ris");
  }

  function wireTableFilters() {
    const container = document.getElementById("pubTypeFilters");
    const table = document.getElementById("pubTable");
    if (!container || !table) return;

    const allTags = new Set();
    table.querySelectorAll("tbody tr").forEach(tr => {
      (tr.dataset.tags || "").split(",").forEach(t => { if (t) allTags.add(t); });
    });

    container.innerHTML = '<button class="filter-btn active" data-filter="all">Todos</button>' +
      [...allTags].map(t => `<button class="filter-btn" data-filter="${t}">${t}</button>`).join("");

    container.querySelectorAll(".filter-btn").forEach(btn => {
      btn.onclick = () => {
        container.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const filter = btn.dataset.filter;
        table.querySelectorAll("tbody tr").forEach(tr => {
          if (filter === "all") { tr.style.display = ""; return; }
          const tags = (tr.dataset.tags || "").split(",");
          tr.style.display = tags.includes(filter) ? "" : "none";
        });
      };
    });
  }

  // ===================== Reset =====================

  function resetForm() {
    clearError();
    showCacheIndicator(false);
    FIELDS.forEach(f => {
      inputs[f].value = "";
      synonyms[f] = [];
      renderChips(f);
      meshTerms[f] = [];
      renderMeshChips(f);
    });
    windowSel.value = "7";
    if (exampleSel) exampleSel.value = "";
    if (meshMode) setMeshMode(false);
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
  FIELDS.forEach(f => renderMeshChips(f));
});
