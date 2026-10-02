// CIPM Finder — controlador del módulo.
// Se inicializa de forma diferida (la primera vez que se abre la pestaña) y
// no comparte estado con EvidenceGap Radar.
import { loadCipmData } from "./data.js";
import { buildIndex, search, sortRecords, filterByType, typeOptions } from "./search.js";
import { renderResults, renderEmpty, renderIdle, renderFilteredOut, coverageText } from "./render.js";
import { esc } from "../util.js";

let initPromise = null;

/** Inicializa el módulo una sola vez; llamadas posteriores son no-op. */
export function initCipmFinder() {
  if (!initPromise) initPromise = setup();
  return initPromise;
}

async function setup() {
  const $ = (id) => document.getElementById(id);
  const input      = $("cipmQuery");
  const btnSearch  = $("cipmSearch");
  const btnClear   = $("cipmClear");
  const typeSel    = $("cipmType");
  const orderSel   = $("cipmOrder");
  const out        = $("cipmResults");
  const countEl    = $("cipmCount");
  const statusEl   = $("cipmStatus");
  const demoBanner = $("cipmDemoBanner");
  const metaEl     = $("cipmMeta");
  if (!input || !out) return;

  const state = { data: null, index: [], query: "", tipo: "", order: "desc" };

  statusEl.textContent = "Cargando base de datos local…";
  statusEl.classList.remove("hidden");

  try {
    state.data = await loadCipmData();
  } catch (e) {
    statusEl.classList.add("hidden");
    out.innerHTML = `<div class="error-box">No se ha podido cargar la base de datos local del CIPM Finder (${esc(e.message)}).</div>`;
    return;
  }
  statusEl.classList.add("hidden");
  state.index = buildIndex(state.data.records);

  demoBanner.classList.toggle("hidden", !state.data.hasDemo);
  const { meta } = state.data;
  const coverage = coverageText(meta.documentos);
  metaEl.textContent = `Base de datos local · ${state.data.records.length} registro(s)` +
    (meta.updated ? ` · actualizada ${meta.updated}` : "") +
    (coverage ? ` · Cobertura: ${coverage}` : "");

  // Tipos de acuerdo presentes en los datos (texto literal; no se presuponen categorías)
  typeSel.innerHTML = `<option value="">Todos los tipos</option>` +
    typeOptions(state.data.records)
      .map(o => `<option value="${esc(o.key)}">${esc(o.label)} (${o.count})</option>`).join("");

  function run() {
    state.query = input.value;
    state.tipo = typeSel.value;
    state.order = orderSel.value;
    if (!state.query.trim()) {
      countEl.textContent = "";
      out.innerHTML = renderIdle(state.data.records.length);
      return;
    }
    const all = search(state.index, state.query);
    const hits = sortRecords(filterByType(all, state.tipo), state.order);
    const hidden = all.length - hits.length;
    countEl.textContent = [
      hits.length ? `${hits.length} ${hits.length === 1 ? "aparición" : "apariciones"}` : "",
      hidden ? `${hidden} oculta${hidden !== 1 ? "s" : ""} por el filtro de tipo` : ""
    ].filter(Boolean).join(" · ");
    if (hits.length) out.innerHTML = renderResults(hits);
    else if (all.length) out.innerHTML = renderFilteredOut(all.length);
    else out.innerHTML = renderEmpty(coverage);
  }

  let timer;
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(run, 200); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); clearTimeout(timer); run(); }
  });
  btnSearch.addEventListener("click", () => { clearTimeout(timer); run(); });
  btnClear.addEventListener("click", () => { input.value = ""; typeSel.value = ""; run(); input.focus(); });
  typeSel.addEventListener("change", run);
  orderSel.addEventListener("change", run);

  run();
}
