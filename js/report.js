export function renderResults({ query, pub10y, pubRecent, trials, evidenceClass, opps, topPubs }) {
  const cls = classifyBadge(evidenceClass?.label || "");
  const pubsList = (topPubs || []).map(p => {
    const id = p.uid;
    const title = esc(p.title || "Sin título");
    const journal = esc(p.fulljournalname || "");
    const date = esc(p.pubdate || "");
    return `
      <li>
        <a href="https://pubmed.ncbi.nlm.nih.gov/${id}/" target="_blank" rel="noreferrer">${title}</a>
        <br><small>${journal}${journal && date ? " · " : ""}${date}</small>
      </li>`;
  }).join("");

  const pubMeter = meterPct(pub10y, 500);      // cap visual
  const recentMeter = meterPct(pubRecent, 50); // cap visual
  const trialMeter = meterPct(trials?.n || 0, 50);

  return `
    <div class="split">
      <div>
        <div class="kpi-grid">
          <div class="kpi">
            <div class="sub">PubMed · ventana seleccionada</div>
            <div class="big">${pubRecent}</div>
            <div class="meter" title="Escala visual (cap 50)"><span style="width:${recentMeter}%"></span></div>
          </div>
          <div class="kpi">
            <div class="sub">PubMed · 10 años aprox.</div>
            <div class="big">${pub10y}</div>
            <div class="meter" title="Escala visual (cap 500)"><span style="width:${pubMeter}%"></span></div>
          </div>
          <div class="kpi">
            <div class="sub">ClinicalTrials · ensayos (muestra)</div>
            <div class="big">${trials?.n || 0}</div>
            <div class="meter" title="Escala visual (cap 50)"><span style="width:${trialMeter}%"></span></div>
          </div>
          <div class="kpi">
            <div class="sub">Clasificación</div>
            <div style="margin-top:8px">
              <span class="badge"><span class="dot ${cls.dot}"></span>${esc(evidenceClass.label)}</span>
            </div>
            <div class="sub" style="margin-top:10px">${esc(evidenceClass.rationale || "")}</div>
          </div>
        </div>

        <div class="chips">
          ${chip("P", query.population)}
          ${chip("I/E", query.intervention)}
          ${chip("O", query.outcome)}
          ${query.context ? chip("Contexto", query.context) : ""}
        </div>

        <h3>Oportunidades sugeridas</h3>
        <ol class="list">${(opps || []).map(x => `<li>${esc(x)}</li>`).join("")}</ol>
      </div>

      <div>
        <h3>ClinicalTrials · señales</h3>
        <ul class="list">
          <li>Estados: <small>${formatCounts(trials?.statusCounts)}</small></li>
          <li>Fases: <small>${formatCounts(trials?.phaseCounts)}</small></li>
        </ul>

        <h3>Publicaciones (muestra)</h3>
        <ol class="list">${pubsList || "<li>Sin publicaciones en la ventana seleccionada.</li>"}</ol>
      </div>
    </div>
  `;
}

export function renderBrief({ query, pub10y, pubRecent, trials, evidenceClass, opps }) {
  const cls = classifyBadge(evidenceClass?.label || "");

  return `
    <article>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <h2 style="margin:0; font-size:20px; letter-spacing:-0.01em;">${esc(query.title)}</h2>
        <span class="badge"><span class="dot ${cls.dot}"></span>${esc(evidenceClass.label)}</span>
      </div>

      <div class="chips" style="margin-top:12px;">
        ${chip("P", query.population)}
        ${chip("I/E", query.intervention)}
        ${chip("O", query.outcome)}
        ${query.context ? chip("Contexto", query.context) : ""}
      </div>

      <h3>Panorama</h3>
      <ul class="list">
        <li>PubMed (ventana): <b>${pubRecent}</b> · (10 años): <b>${pub10y}</b></li>
        <li>Ensayos (muestra): <b>${trials?.n || 0}</b> · Estados: <small>${formatCounts(trials?.statusCounts)}</small></li>
      </ul>

      <h3>Diagnóstico</h3>
      <p style="color: rgba(255,255,255,0.88)">${esc(evidenceClass.rationale || "")}</p>

      <h3>Oportunidades</h3>
      <ol class="list">${(opps || []).map(x => `<li>${esc(x)}</li>`).join("")}</ol>

      <h3>Limitaciones</h3>
      <ul class="list">
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

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function chip(label, value) {
  const v = String(value || "").trim();
  if (!v) return "";
  return `<span class="chip"><b>${esc(label)}:</b>&nbsp;${esc(v)}</span>`;
}

function meterPct(value, cap) {
  const v = Math.max(0, Number(value || 0));
  const pct = Math.min(100, Math.round((v / cap) * 100));
  return pct;
}

function classifyBadge(label) {
  const t = (label || "").toLowerCase();
  if (t.includes("huérfano") || t.includes("huerfano")) return { dot: "bad" };
  if (t.includes("emergente")) return { dot: "warn" };
  if (t.includes("saturado")) return { dot: "violet" };
  if (t.includes("maduro")) return { dot: "ok" };
  return { dot: "info" };
}

