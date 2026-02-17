import { barChartTimeSeries, hbarChart, quadrantChart, sourcePie } from "./charts.js";

export function renderResults(data) {
  const {
    query, pub10y, pubRecent, trials, evidenceClass, opps, topPubs,
    searchTerm, reldate, srMaCount, yearCounts, pubTypeCounts
  } = data;

  const cls = classifyBadge(evidenceClass?.label || "");
  const windowLabel = { "7": "7 d\u00edas", "30": "30 d\u00edas", "90": "90 d\u00edas", "365": "1 a\u00f1o" }[reldate] || `${reldate} d\u00edas`;
  const timestamp = new Date().toLocaleString("es-ES");

  // Count active trials
  const sc = trials?.statusCounts || {};
  const trialsActive = (sc["RECRUITING"] || 0) + (sc["ACTIVE_NOT_RECRUITING"] || 0) + (sc["ENROLLING_BY_INVITATION"] || 0);
  const trialsCompleted = sc["COMPLETED"] || 0;

  // Publications list
  const pubsList = (topPubs || []).map(p => {
    const id = p.uid;
    const title = esc(p.title || "Sin t\u00edtulo");
    const journal = esc(p.fulljournalname || "");
    const date = esc(p.pubdate || "");
    return `<li><a href="https://pubmed.ncbi.nlm.nih.gov/${id}/" target="_blank" rel="noreferrer">${title}</a>
      <br><small>${journal}${journal && date ? " \u00b7 " : ""}${date}</small></li>`;
  }).join("");

  // --- Strategy ---
  const strategySection = `
    <div class="strategy-used">
      <h3>Estrategia utilizada</h3>
      <code class="strategy-code">${esc(searchTerm || "")}</code>
      <small class="muted">Ventana: ${esc(windowLabel)} \u00b7 ${timestamp}</small>
    </div>`;

  // --- Dashboard Cards ---
  const pubMeter = meterPct(pub10y, 500);
  const recentMeter = meterPct(pubRecent, 50);
  const trialMeter = meterPct(trials?.n || 0, 50);

  const cardPubmed = `<div class="dash-card">
    <h3>PubMed</h3>
    <div class="dash-row">
      <div class="kpi compact"><div class="sub">${esc(windowLabel)}</div><div class="big">${pubRecent}</div>
        <div class="meter"><span style="width:${recentMeter}%"></span></div></div>
      <div class="kpi compact"><div class="sub">10 a\u00f1os aprox.</div><div class="big">${pub10y}</div>
        <div class="meter"><span style="width:${pubMeter}%"></span></div></div>
    </div>
  </div>`;

  const cardTrials = `<div class="dash-card">
    <h3>ClinicalTrials.gov</h3>
    <div class="dash-row">
      <div class="kpi compact"><div class="sub">Total ensayos</div><div class="big">${trials?.n || 0}</div>
        <div class="meter"><span style="width:${trialMeter}%"></span></div></div>
      <div class="kpi compact"><div class="sub">Recruiting / Active</div><div class="big">${trialsActive}</div></div>
      <div class="kpi compact"><div class="sub">Completed</div><div class="big">${trialsCompleted}</div></div>
    </div>
    <div class="dash-detail">
      <small>Estados: ${formatCounts(trials?.statusCounts)}</small><br>
      <small>Fases: ${formatCounts(trials?.phaseCounts)}</small>
    </div>
  </div>`;

  const srLabel = srMaCount != null ? srMaCount : "n/d";
  const cardSynthesis = `<div class="dash-card">
    <h3>S\u00edntesis</h3>
    <div class="dash-row">
      <div class="kpi compact"><div class="sub">Systematic Reviews + Meta-analyses</div><div class="big">${srLabel}</div></div>
      <div class="kpi compact"><div class="sub">Clasificaci\u00f3n</div>
        <div style="margin-top:6px"><span class="badge"><span class="dot ${cls.dot}"></span>${esc(evidenceClass.label)}</span></div>
        <div class="sub" style="margin-top:6px">${esc(evidenceClass.rationale || "")}</div>
      </div>
    </div>
  </div>`;

  // --- Charts ---
  const timeChart = barChartTimeSeries(yearCounts, "Publicaciones por a\u00f1o (aprox.)");

  const pubTypeChart = hbarChart(pubTypeCounts || {}, "Tipos de publicaci\u00f3n (muestra)");

  const quadChart = quadrantChart(pubRecent, trialsActive);

  const pie = sourcePie([
    { name: "PubMed", count: pub10y, color: "var(--accent)" },
    { name: "ClinicalTrials", count: trials?.n || 0, color: "var(--ok)" },
    { name: "SR/MA", count: srMaCount || 0, color: "var(--violet)" }
  ], timestamp);

  // --- PICO chips ---
  const picoChips = `<div class="chips">
    ${chip("P", query.population)}
    ${chip("I/E", query.intervention)}
    ${chip("O", query.outcome)}
    ${query.context ? chip("Contexto", query.context) : ""}
  </div>`;

  // --- Opportunities ---
  const oppsHtml = `<h3>Oportunidades sugeridas</h3>
    <ol class="list">${(opps || []).map(x => `<li>${esc(x)}</li>`).join("")}</ol>`;

  // --- Top 20 table ---
  const tableHtml = buildPubTable(topPubs);

  // --- Export buttons ---
  const exportHtml = `<div class="export-bar">
    <button class="secondary" id="exportCSV" type="button">Exportar CSV</button>
    <button class="secondary" id="exportRIS" type="button">Exportar RIS</button>
  </div>`;

  // --- Assemble dashboard ---
  return `
    ${strategySection}
    ${picoChips}

    <div class="dash-grid">${cardPubmed}${cardTrials}${cardSynthesis}</div>

    <div class="charts-grid">
      ${timeChart}
      ${pubTypeChart}
      ${quadChart}
      ${pie}
    </div>

    ${oppsHtml}

    <h3>Top ${topPubs.length} art\u00edculos</h3>
    <div class="table-filters" id="pubTypeFilters"></div>
    ${tableHtml}
    ${exportHtml}
  `;
}

function formatCounts(obj) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return "\u2014";
  return entries.sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}: ${v}`).join(" \u00b7 ");
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function chip(label, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  return `<span class="chip"><b>${esc(label)}:</b>&nbsp;${esc(v)}</span>`;
}

function meterPct(value, cap) {
  return Math.min(100, Math.round((Math.max(0, Number(value || 0)) / cap) * 100));
}

function classifyBadge(label) {
  const t = (label || "").toLowerCase();
  if (t.includes("hu\u00e9rfano") || t.includes("huerfano")) return { dot: "bad" };
  if (t.includes("emergente")) return { dot: "warn" };
  if (t.includes("saturado")) return { dot: "violet" };
  if (t.includes("maduro")) return { dot: "ok" };
  return { dot: "info" };
}

// --- Publication type tagging ---
function classifyPubType(pubtype) {
  const types = (pubtype || []).map(t => t.toLowerCase());
  const tags = [];
  if (types.some(t => t.includes("systematic review"))) tags.push("SR");
  if (types.some(t => t.includes("meta-analysis"))) tags.push("MA");
  if (types.some(t => t.includes("randomized controlled trial") || t.includes("clinical trial"))) tags.push("RCT");
  if (types.some(t => t.includes("observational") || t.includes("cohort") || t.includes("case-control") || t.includes("cross-sectional"))) tags.push("OBS");
  if (types.some(t => t.includes("review") && !t.includes("systematic"))) tags.push("Review");
  if (!tags.length) tags.push("Other");
  return tags;
}

function pubTagClass(tag) {
  const m = { SR: "tag-sr", MA: "tag-ma", RCT: "tag-rct", OBS: "tag-obs", Review: "tag-review" };
  return m[tag] || "tag-other";
}

function buildPubTable(pubs) {
  if (!pubs?.length) return '<p class="muted">Sin publicaciones en la ventana seleccionada.</p>';

  const rows = pubs.map(p => {
    const id = p.uid || "";
    const title = esc(p.title || "Sin t\u00edtulo");
    const journal = esc(p.fulljournalname || p.source || "");
    const year = (p.pubdate || "").split(" ")[0] || "";
    const tags = classifyPubType(p.pubtype);
    const tagHtml = tags.map(t => `<span class="pub-tag ${pubTagClass(t)}">${t}</span>`).join("");
    return `<tr data-tags="${tags.join(",")}"">
      <td><a href="https://pubmed.ncbi.nlm.nih.gov/${id}/" target="_blank" rel="noreferrer">${title}</a></td>
      <td>${esc(year)}</td>
      <td>${journal}</td>
      <td>${tagHtml}</td>
    </tr>`;
  }).join("");

  return `<div class="table-wrap"><table class="pub-table" id="pubTable">
    <thead><tr><th>T\u00edtulo</th><th>A\u00f1o</th><th>Journal</th><th>Tipo</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
