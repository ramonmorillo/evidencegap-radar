// js/examples.js — 5 ejemplos docentes PICO-lite

export const EXAMPLES = [
  {
    name: "Telefarmacia y adherencia en VIH",
    population: "pacientes VIH",
    intervention: "telefarmacia",
    outcome: "adherencia",
    context: "farmacia hospitalaria",
    synonyms: {
      population: ["HIV patients", "people living with HIV"],
      intervention: ["telepharmacy", "remote pharmaceutical care"],
      outcome: ["medication adherence", "treatment compliance"],
      context: []
    }
  },
  {
    name: "Errores de medicación en pediatría",
    population: "pediatric patients",
    intervention: "medication errors",
    outcome: "patient safety",
    context: "hospital",
    synonyms: {
      population: ["children", "neonates"],
      intervention: ["prescribing errors", "dosing errors"],
      outcome: ["adverse drug events", "medication safety"],
      context: []
    }
  },
  {
    name: "Farmacogenómica y anticoagulantes",
    population: "patients anticoagulation",
    intervention: "pharmacogenomics",
    outcome: "bleeding",
    context: "",
    synonyms: {
      population: ["warfarin patients"],
      intervention: ["pharmacogenetics", "genotype-guided dosing"],
      outcome: ["thrombosis", "INR control"],
      context: []
    }
  },
  {
    name: "Cannabis medicinal y dolor crónico",
    population: "chronic pain",
    intervention: "medical cannabis",
    outcome: "pain relief",
    context: "",
    synonyms: {
      population: ["noncancer pain"],
      intervention: ["cannabinoids", "CBD"],
      outcome: ["quality of life", "analgesic efficacy"],
      context: []
    }
  },
  {
    name: "IA en farmacia clínica",
    population: "hospitalized patients",
    intervention: "artificial intelligence",
    outcome: "clinical pharmacy",
    context: "hospital pharmacy",
    synonyms: {
      population: ["inpatients"],
      intervention: ["machine learning", "clinical decision support"],
      outcome: ["drug interactions", "medication optimization"],
      context: []
    }
  }
];
