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
        target: "नमस्ते",
        roman: "namaste",
        meaningTamil: "வணக்கம்",
        promptTamil: "முதல் வார்த்தை. இதன் அர்த்தம் வணக்கம். முதலில் கவனமாக கேள்."
      },
      {
        target: "धन्यवाद",
        roman: "dhanyavaad",
        meaningTamil: "நன்றி",
        promptTamil: "அடுத்த வார்த்தையின் அர்த்தம் நன்றி. முதலில் கவனமாக கேள்."
      },
      {
        target: "पानी",
        roman: "paani",
        meaningTamil: "தண்ணீர்",
        promptTamil: "இந்த வார்த்தையின் அர்த்தம் தண்ணீர். முதலில் கவனமாக கேள்."
      },
      {
        target: "अच्छा",
        roman: "achchha",
        meaningTamil: "நல்லது அல்லது சரி",
        promptTamil: "இந்த வார்த்தையின் அர்த்தம் நல்லது அல்லது சரி. முதலில் கவனமாக கேள்."
      },
      {
        target: "फिर मिलेंगे",
        roman: "phir milenge",
        meaningTamil: "மீண்டும் சந்திப்போம்",
        promptTamil: "கடைசி வார்த்தையின் அர்த்தம் மீண்டும் சந்திப்போம். முதலில் கவனமாக கேள்."
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
        target: "こんにちは",
        roman: "konnichiwa",
        meaningTamil: "வணக்கம்",
        promptTamil: "முதல் வார்த்தை. இதன் அர்த்தம் வணக்கம். முதலில் கவனமாக கேள்."
      },
      {
        target: "ありがとう",
        roman: "arigatou",
        meaningTamil: "நன்றி",
        promptTamil: "இந்த வார்த்தையின் அர்த்தம் நன்றி. முதலில் கவனமாக கேள்."
      },
      {
        target: "はい",
        roman: "hai",
        meaningTamil: "ஆம்",
        promptTamil: "இந்த வார்த்தையின் அர்த்தம் ஆம். முதலில் கவனமாக கேள்."
      },
      {
        target: "いいえ",
        roman: "iie",
        meaningTamil: "இல்லை",
        promptTamil: "இந்த வார்த்தையின் அர்த்தம் இல்லை. முதலில் கவனமாக கேள்."
      },
      {
        target: "またね",
        roman: "mata ne",
        meaningTamil: "மீண்டும் பார்க்கலாம்",
        promptTamil: "கடைசி வார்த்தையின் அர்த்தம் மீண்டும் பார்க்கலாம். முதலில் கவனமாக கேள்."
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
