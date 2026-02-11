export function classifyEvidence({ pubCount10y, pubCountRecent, trialsSummary }) {
  const total = pubCount10y || 0;
  const recent = pubCountRecent || 0;

  const recruiting =
    (trialsSummary?.statusCounts?.RECRUITING || 0) +
    (trialsSummary?.statusCounts?.ACTIVE_NOT_RECRUITING || 0) +
    (trialsSummary?.statusCounts?.ENROLLING_BY_INVITATION || 0);

  if (total < 20 && recruiting === 0) {
    return { label: "Huérfano", rationale: "Muy pocas publicaciones y sin ensayos activos." };
  }

  if (total < 50 && recruiting >= 1) {
    return { label: "Emergente", rationale: "Pocas publicaciones, pero hay ensayos activos." };
  }

  if (total >= 50 && total <= 300) {
    return { label: "Maduro", rationale: "Volumen moderado; potencial para implementación/comparativos." };
  }

  if (total > 300 && recruiting === 0) {
    return { label: "Saturado", rationale: "Mucho publicado; pocos ensayos activos." };
  }

  if (total > 300 && recruiting >= 1) {
    return { label: "Maduro (activo)", rationale: "Muy publicado pero aún con investigación activa." };
  }

  if (recent > 0 && total > 0 && recent / total > 0.4) {
    return { label: "Emergente", rationale: "Proporción alta de publicaciones recientes; posible crecimiento." };
  }

  return { label: "Indeterminado", rationale: "Señales mixtas; conviene afinar términos." };
}

export function generateOpportunities({ pubCount10y, pubCountRecent, trialsSummary }) {
  const total = pubCount10y || 0;
  const recent = pubCountRecent || 0;

  const recruiting =
    (trialsSummary?.statusCounts?.RECRUITING || 0) +
    (trialsSummary?.statusCounts?.ACTIVE_NOT_RECRUITING || 0) +
    (trialsSummary?.statusCounts?.ENROLLING_BY_INVITATION || 0);

  const opp = [];

  if (total < 20) opp.push("Evidencia escasa: plantear piloto/factibilidad o estudio cualitativo/mixto.");
  if (total >= 20 && total < 80 && recruiting === 0) opp.push("Poca tracción en ensayos: oportunidad para estudio de implementación o vida real.");
  if (recruiting >= 1) opp.push("Hay ensayos activos: mapear outcomes, comparabilidad y brechas.");
  if (recent === 0 && total > 0) opp.push("Sin señales recientes: revisar sinónimos/MeSH o reformular la pregunta.");
  if (!opp.length) opp.push("Afina términos (sinónimos, población u outcome) y repite.");

  return opp.slice(0, 4);
}
