"use strict";

const CURRICULUM = [
  {
    id: "water",
    meaningTamil: "தண்ணீர்",
    ta: { target: "தண்ணீர்", roman: "thanneer" },
    en: { target: "water", roman: "water", accept: ["water"] },
    hi: { target: "पानी", roman: "paani", accept: ["पानी", "पानि", "paani", "pani"] }
  },
  {
    id: "book",
    meaningTamil: "புத்தகம்",
    ta: { target: "புத்தகம்", roman: "puthagam" },
    en: { target: "book", roman: "book", accept: ["book"] },
    hi: { target: "किताब", roman: "kitaab", accept: ["किताब", "kitaab", "kitab"] }
  },
  {
    id: "house",
    meaningTamil: "வீடு",
    ta: { target: "வீடு", roman: "veedu" },
    en: { target: "house", roman: "house", accept: ["house"] },
    hi: { target: "घर", roman: "ghar", accept: ["घर", "ghar", "gar"] }
  },
  {
    id: "cat",
    meaningTamil: "பூனை",
    ta: { target: "பூனை", roman: "poonai" },
    en: { target: "cat", roman: "cat", accept: ["cat"] },
    hi: { target: "बिल्ली", roman: "billi", accept: ["बिल्ली", "बिली", "billi", "bili"] }
  },
  {
    id: "apple",
    meaningTamil: "ஆப்பிள்",
    ta: { target: "ஆப்பிள்", roman: "apple" },
    en: { target: "apple", roman: "apple", accept: ["apple"] },
    hi: { target: "सेब", roman: "seb", accept: ["सेब", "seb"] }
  }
];

const LANGUAGES = {
  ta: {
    id: "ta",
    name: "Tamil",
    tamilName: "தமிழ்",
    voice: "female",
    delivery: "calm",
    speed: 0.90,
    transcribe: false
  },
  en: {
    id: "en",
    ttsLanguage: "en-us",
    name: "English",
    tamilName: "ஆங்கிலம்",
    voice: "af_heart",
    delivery: "calm",
    speed: 0.86,
    transcribe: true
  },
  hi: {
    id: "hi",
    name: "Hindi",
    tamilName: "ஹிந்தி",
    voice: "hf_alpha",
    delivery: "calm",
    speed: 0.84,
    transcribe: false
  }
};

function getLanguage(id) {
  const key = String(id || "").trim().toLowerCase();
  if (key === "english") return LANGUAGES.en;
  if (key === "hindi") return LANGUAGES.hi;
  if (key === "tamil") return LANGUAGES.ta;
  return LANGUAGES[key] || null;
}

function getConcepts(limit = null) {
  if (limit == null) return CURRICULUM.slice();
  return CURRICULUM.slice(0, Math.max(1, Number(limit) || 1));
}

module.exports = {
  getLanguage,
  getConcepts,
  languages: LANGUAGES
};
