export function renderResults({ query, pub10y, pubRecent, trials, evidenceClass, opps, topPubs }) {
  const pubsList = (topPubs || []).map(p => {
    const id = p.uid;
    const title = escapeHtml(p.title || "Sin título");
    const journal = escapeHtml(p.fulljournalname || "");
    const date = escapeHtml(p.pubdate || "");
    return `
      <li>
        <a href="https://pubmed.ncbi.nlm.nih.gov/${id}/" target="_blank" rel="noreferrer">${title}</a>
        <br><small>${journal} · ${date}</small>
      </li>`;
  }).join("");

  return `
    <div class="two-col">
      <div>
        <h3>PubMed</h3>
        <ul>
          <li>Resultados (ventana seleccionada): <b>${pubRecent}</b></li>
          <li>Resultados (10 años aprox.): <b>${pub10y}</b></li>
        </ul>
      </div>

      <div>
        <h3>ClinicalTrials.gov</h3>
        <ul>
          <li>Ensayos recuperados (muestra): <b>${trials.n}</b></li>
          <li>Estados: <small>${formatCounts(trials.statusCounts)}</small></li>
          <li>Fases: <small>${formatCounts(trials.phaseCounts)}</small></li>
        </ul>
      </div>
    </div>

    <h3>Clasificación</h3>
    <p><b>${evidenceClass.label}</b> — ${escapeHtml(evidenceClass.rationale)}</p>

    <h3>Oportunidades sugeridas</h3>
    <ol>${(opps || []).map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ol>

    <h3>Publicaciones (muestra)</h3>
    <ol>${pubsList || "<li>Sin publicaciones en la ventana seleccionada.</li>"}</ol>
  `;
}

export function renderBrief({ query, pub10y, pubRecent, trials, evidenceClass, opps }) {
  return `
    <article>
      <h2>${escapeHtml(query.title)}</h2>
      <p><small>P: ${escapeHtml(query.population)} · I/E: ${escapeHtml(query.intervention)} · O: ${escapeHtml(query.outcome)} ${query.context ? `· Contexto: ${escapeHtml(query.context)}` : ""}</small></p>

      <h3>Panorama</h3>
      <ul>
        <li>PubMed (ventana): <b>${pubRecent}</b> · (10 años): <b>${pub10y}</b></li>
        <li>Ensayos (muestra): <b>${trials.n}</b> · Estados: <small>${formatCounts(trials.statusCounts)}</small></li>
      </ul>

      <h3>Diagnóstico</h3>
      <p><b>${evidenceClass.label}</b> — ${escapeHtml(evidenceClass.rationale)}</p>

      <h3>Oportunidades</h3>
      <ol>${(opps || []).map(x => `<li>${escapeHtml(x)}</li>`).join("")}</ol>

      <h3>Limitaciones</h3>
      <ul>
        <li>Depende de la formulación de términos (sinónimos/MeSH).</li>
        <li>ClinicalTrials refleja registros, no resultados publicados.</li>
      </ul>
    </article>
  `;
}

function formatCounts(obj) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return "—";
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, v]) => `${k}:${v}`)
    .join(" · ");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
