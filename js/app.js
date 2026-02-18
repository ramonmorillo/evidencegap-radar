import { getJson } from "./api.js";
import { renderResults } from "./report.js";
import { hashKey, cacheGet, cacheSet, cacheClear, cacheCount } from "./cache.js";
import { exportCSV, exportRIS } from "./export.js";
import { EXAMPLES } from "./examples.js";
import { meshAutocomplete, buildMeshQuery, renderMeshStrategyPanel } from "./mesh.js";

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
  const meshToggle     = $("meshToggle");
  const meshNotice     = $("meshNotice");

  // --- State ---
  const synonyms = { population: [], intervention: [], outcome: [], context: [] };
  const meshTerms = { population: [], intervention: [], outcome: [], context: [] };
  let meshMode = false;
  let currentController = null;
  let meshAcController = null;

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
  FIELDS.forEach(f => {
    inputs[f].addEventListener("input", () => {
      if (!meshMode) return;
      debouncedMeshAc(f, inputs[f].value.trim());
    });

    // Close dropdown on blur (with slight delay for click)
    inputs[f].addEventListener("blur", () => {
      setTimeout(() => {
        const drop = $(`acDrop-${f}`);
        if (drop) drop.classList.add("hidden");
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
        getJson(`/api/pubmed/esearch?term=${enc}&reldate=${encodeURIComponent(reldate)}&retmax=20`, { signal }),
        getJson(`/api/pubmed/esearch?term=${enc}&reldate=3650&retmax=0`, { signal }),
        getJson(`/api/ctgov/search?query=${enc}&pageSize=25`, { signal }),
        getJson(`/api/pubmed/esearch?term=${enc}+AND+(systematic+review[pt]+OR+meta-analysis[pt])&reldate=3650&retmax=0`, { signal })
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
        getJson(`/api/pubmed/esearch?term=${enc}&reldate=${d}&retmax=0`, { signal })
          .then(r => Number(r?.esearchresult?.count || 0))
          .catch(() => 0)
      );

      let topPubs = [];
      const esumPromise = idlist.length
        ? getJson(`/api/pubmed/esummary?ids=${encodeURIComponent(idlist.join(","))}`, { signal })
        : Promise.resolve(null);

      const [esum, ...yCounts] = await Promise.all([esumPromise, ...yearPromises]);

      if (esum) {
        const uids = esum?.result?.uids || [];
        topPubs = uids.map(uid => esum.result[uid]).filter(Boolean);
      }

      // Build year-by-year data (derive per-year from cumulative)
      const now = new Date().getFullYear();
      const yearCounts = [];
      for (let i = yCounts.length - 1; i >= 0; i--) {
        const prev = i > 0 ? yCounts[i - 1] : 0;
        const perYear = Math.max(0, yCounts[i] - prev);
        yearCounts.push({ label: String(now - (i + 1)), value: perYear });
      }
      yearCounts.push({ label: String(now), value: pubRecent });

      // Extract publication types from topPubs
      const pubTypeCounts = {};
      for (const p of topPubs) {
        for (const t of (p.pubtype || [])) { pubTypeCounts[t] = (pubTypeCounts[t] || 0) + 1; }
      }

      if (pubRecent === 0 && pub10y === 0 && trialN === 0) { showEmpty(); return; }

      const statusCounts = countBy(studies, s => s?.protocolSection?.statusModule?.overallStatus || "UNKNOWN");
      const phaseCounts = countBy(studies, s => {
        const ph = s?.protocolSection?.designModule?.phases;
        return (Array.isArray(ph) && ph.length) ? ph.join(",") : "\u2014";
      });

      const evidenceClass = classifyEvidence(pubRecent, pub10y, trialN);
      const opps = suggestOpps(pubRecent, trialN);

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
