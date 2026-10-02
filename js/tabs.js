// Navegación por pestañas: EvidenceGap Radar | CIPM Finder.
// Solo muestra/oculta paneles. No toca la lógica ni el estado de EvidenceGap Radar
// (su enlace reproducible "#q=..." se sigue leyendo en js/app.js al cargar).
import { initCipmFinder } from "./cipm/index.js";

const TABS = {
  radar: { panel: "panel-radar" },
  cipm:  { panel: "panel-cipm", hash: "#cipm", onShow: initCipmFinder }
};

document.addEventListener("DOMContentLoaded", () => {
  const buttons = [...document.querySelectorAll(".app-tab[data-tab]")];
  if (!buttons.length) return;

  function activate(name, { focus = false, updateHash = true } = {}) {
    if (!TABS[name]) name = "radar";
    buttons.forEach(btn => {
      const on = btn.dataset.tab === name;
      btn.setAttribute("aria-selected", String(on));
      btn.tabIndex = on ? 0 : -1;
      if (on && focus) btn.focus();
    });
    Object.entries(TABS).forEach(([key, cfg]) => {
      const panel = document.getElementById(cfg.panel);
      if (panel) panel.hidden = key !== name;
    });
    document.body.dataset.activeTab = name;

    if (updateHash) {
      const target = TABS[name].hash || "";
      const current = location.hash;
      // Solo se gestiona el hash propio de las pestañas; "#q=..." de Radar no se toca
      if (target && current !== target) {
        history.replaceState(null, "", location.pathname + location.search + target);
      } else if (!target && current === "#cipm") {
        history.replaceState(null, "", location.pathname + location.search);
      }
    }

    const onShow = TABS[name].onShow;
    if (onShow) {
      Promise.resolve().then(onShow).catch(err => console.warn("[tabs] init:", err));
    }
  }

  buttons.forEach((btn, i) => {
    btn.addEventListener("click", () => activate(btn.dataset.tab));
    btn.addEventListener("keydown", (e) => {
      let j = null;
      if (e.key === "ArrowRight") j = (i + 1) % buttons.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + buttons.length) % buttons.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = buttons.length - 1;
      if (j !== null) { e.preventDefault(); activate(buttons[j].dataset.tab, { focus: true }); }
    });
  });

  window.addEventListener("hashchange", () => {
    if (location.hash === "#cipm") activate("cipm", { updateHash: false });
  });

  activate(location.hash === "#cipm" ? "cipm" : "radar", { updateHash: false });
});
