export function renderResults({ query, pub10y, pubRecent, trials, evidenceClass, opps, topPubs, searchTerm, reldate }) {
  const cls = classifyBadge(evidenceClass?.label || "");
  const pubsList = (topPubs || []).map(p => {
    const id = p.uid;
    const title = esc(p.title || "Sin t\u00edtulo");
    const journal = esc(p.fulljournalname || "");
    const date = esc(p.pubdate || "");
    return `<li><a href="https://pubmed.ncbi.nlm.nih.gov/${id}/" target="_blank" rel="noreferrer">${title}</a>
      <br><small>${journal}${journal && date ? " \u00b7 " : ""}${date}</small></li>`;
  }).join("");

  const pubMeter = meterPct(pub10y, 500);
  const recentMeter = meterPct(pubRecent, 50);
  const trialMeter = meterPct(trials?.n || 0, 50);

  const windowLabel = { "7": "7 d\u00edas", "30": "30 d\u00edas", "90": "90 d\u00edas", "365": "1 a\u00f1o" }[reldate] || `${reldate} d\u00edas`;

  return `
    <!-- Strategy used -->
    <div class="strategy-used">
      <h3>Estrategia utilizada</h3>
      <code class="strategy-code">${esc(searchTerm || "")}</code>
      <small class="muted">Ventana: ${esc(windowLabel)} \u00b7 ${new Date().toLocaleString("es-ES")}</small>
    </div>

    <div class="split">
      <div>
        <div class="kpi-grid">
          <div class="kpi">
            <div class="sub">PubMed \u00b7 ${esc(windowLabel)}</div>
            <div class="big">${pubRecent}</div>
            <div class="meter" title="Escala visual (cap 50)"><span style="width:${recentMeter}%"></span></div>
          </div>
          <div class="kpi">
            <div class="sub">PubMed \u00b7 10 a\u00f1os aprox.</div>
            <div class="big">${pub10y}</div>
            <div class="meter" title="Escala visual (cap 500)"><span style="width:${pubMeter}%"></span></div>
          </div>
          <div class="kpi">
            <div class="sub">ClinicalTrials \u00b7 ensayos</div>
            <div class="big">${trials?.n || 0}</div>
            <div class="meter" title="Escala visual (cap 50)"><span style="width:${trialMeter}%"></span></div>
          </div>
          <div class="kpi">
            <div class="sub">Clasificaci\u00f3n</div>
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
        <h3>ClinicalTrials \u00b7 se\u00f1ales</h3>
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

function formatCounts(obj) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return "\u2014";
  return entries.sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k}:${v}`).join(" \u00b7 ");
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
