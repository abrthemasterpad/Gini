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
        promptTamil: "முதல் வார்த்தை. வணக்கம் என்பதற்கு ஹிந்தியில் நமஸ்தே. இப்போது நீ சொல்லிப் பார்."
      },
      {
        target: "धन्यवाद",
        roman: "dhanyavaad",
        meaningTamil: "நன்றி",
        promptTamil: "அடுத்தது நன்றி. ஹிந்தியில் தன்யவாத். இப்போது நீ சொல்லிப் பார்."
      },
      {
        target: "पानी",
        roman: "paani",
        meaningTamil: "தண்ணீர்",
        promptTamil: "தண்ணீர் என்பதற்கு ஹிந்தியில் பானி. நீ சொல்லிப் பார்."
      },
      {
        target: "अच्छा",
        roman: "achchha",
        meaningTamil: "நல்லது அல்லது சரி",
        promptTamil: "நல்லது அல்லது சரி என்பதற்கு அச்சா. நீ சொல்லிப் பார்."
      },
      {
        target: "फिर मिलेंगे",
        roman: "phir milenge",
        meaningTamil: "மீண்டும் சந்திப்போம்",
        promptTamil: "கடைசி வார்த்தை. மீண்டும் சந்திப்போம் என்பதற்கு ஃபிர் மிலேங்கே. நீ சொல்லிப் பார்."
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
        promptTamil: "முதல் வார்த்தை. வணக்கம் என்பதற்கு கொன்னிச்சிவா. இப்போது நீ சொல்லிப் பார்."
      },
      {
        target: "ありがとう",
        roman: "arigatou",
        meaningTamil: "நன்றி",
        promptTamil: "நன்றி என்பதற்கு அரிகதோ. நீ சொல்லிப் பார்."
      },
      {
        target: "はい",
        roman: "hai",
        meaningTamil: "ஆம்",
        promptTamil: "ஆம் என்பதற்கு ஹாய். நீ சொல்லிப் பார்."
      },
      {
        target: "いいえ",
        roman: "iie",
        meaningTamil: "இல்லை",
        promptTamil: "இல்லை என்பதற்கு ஈயே. நீ சொல்லிப் பார்."
      },
      {
        target: "またね",
        roman: "mata ne",
        meaningTamil: "மீண்டும் பார்க்கலாம்",
        promptTamil: "கடைசி வார்த்தை. மீண்டும் பார்க்கலாம் என்பதற்கு மாதா நே. நீ சொல்லிப் பார்."
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
