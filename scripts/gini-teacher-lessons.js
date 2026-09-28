"use strict";

const LESSONS = {
  hi: {
    id: "hi",
    name: "Hindi",
    language: "hi",
    voice: "hf_alpha",
    introTamil: "சரி. இன்று ஹிந்தியில் ஐந்து எளிய வார்த்தைகள் கற்போம்.",
    items: [
      {
        target: "पानी",
        roman: "paani",
        meaningTamil: "தண்ணீர்",
        promptTamil: "முதல் வார்த்தை. இதன் அர்த்தம் தண்ணீர்."
      },
      {
        target: "किताब",
        roman: "kitaab",
        meaningTamil: "புத்தகம்",
        promptTamil: "அடுத்த வார்த்தையின் அர்த்தம் புத்தகம்."
      },
      {
        target: "घर",
        roman: "ghar",
        meaningTamil: "வீடு",
        promptTamil: "இந்த வார்த்தையின் அர்த்தம் வீடு."
      },
      {
        target: "बिल्ली",
        roman: "billi",
        meaningTamil: "பூனை",
        promptTamil: "இந்த வார்த்தையின் அர்த்தம் பூனை."
      },
      {
        target: "सेब",
        roman: "seb",
        meaningTamil: "ஆப்பிள்",
        promptTamil: "கடைசி வார்த்தையின் அர்த்தம் ஆப்பிள்."
      }
    ],
    outroTamil: "சூப்பர். இன்று ஐந்து ஹிந்தி வார்த்தைகள் முடிந்தது."
  },

  ja: {
    id: "ja",
    name: "Japanese",
    language: "ja",
    voice: "jf_alpha",
    introTamil: "சரி. இன்று ஜப்பானிய மொழியில் ஐந்து எளிய வார்த்தைகள் கற்போம்.",
    items: [
      {
        target: "みず",
        roman: "mizu",
        meaningTamil: "தண்ணீர்",
        promptTamil: "முதல் வார்த்தை. இதன் அர்த்தம் தண்ணீர்."
      },
      {
        target: "ほん",
        roman: "hon",
        meaningTamil: "புத்தகம்",
        promptTamil: "அடுத்த வார்த்தையின் அர்த்தம் புத்தகம்."
      },
      {
        target: "いえ",
        roman: "ie",
        meaningTamil: "வீடு",
        promptTamil: "இந்த வார்த்தையின் அர்த்தம் வீடு."
      },
      {
        target: "ねこ",
        roman: "neko",
        meaningTamil: "பூனை",
        promptTamil: "இந்த வார்த்தையின் அர்த்தம் பூனை."
      },
      {
        target: "りんご",
        roman: "ringo",
        meaningTamil: "ஆப்பிள்",
        promptTamil: "கடைசி வார்த்தையின் அர்த்தம் ஆப்பிள்."
      }
    ],
    outroTamil: "சூப்பர். இன்று ஐந்து ஜப்பானிய வார்த்தைகள் முடிந்தது."
  }
};

function getLesson(id) {
  const key = String(id || "").trim().toLowerCase();

  if (key === "hindi") return LESSONS.hi;
  if (key === "japanese" || key === "japan") return LESSONS.ja;

  return LESSONS[key] || null;
}

function listLessons() {
  return Object.values(LESSONS).map(item => ({
    id: item.id,
    name: item.name,
    items: item.items.length
  }));
}

module.exports = {
  getLesson,
  listLessons
};
