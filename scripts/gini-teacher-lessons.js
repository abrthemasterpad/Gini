"use strict";

const CONCEPTS = [
  {
    id: "water",
    tamil: "தண்ணீர்",
    hindi: {
      target: "पानी",
      roman: "paani",
      accept: ["पानी", "पानि", "paani", "pani", "paanee"],
      speed: 0.86,
      gainDb: 3.0
    },
    japanese: {
      target: "みず",
      roman: "mizu",
      accept: ["みず", "ミズ", "mizu"],
      speed: 0.84,
      gainDb: 4.0
    }
  },
  {
    id: "book",
    tamil: "புத்தகம்",
    hindi: {
      target: "किताब",
      roman: "kitaab",
      accept: ["किताब", "किताब्", "kitaab", "kitab"],
      speed: 0.86,
      gainDb: 3.0
    },
    japanese: {
      target: "ほん",
      roman: "hon",
      accept: ["ほん", "ホン", "hon"],
      speed: 0.84,
      gainDb: 4.0
    }
  },
  {
    id: "house",
    tamil: "வீடு",
    hindi: {
      target: "घर",
      roman: "ghar",
      accept: ["घर", "ghar", "gar"],
      speed: 0.84,
      gainDb: 3.0
    },
    japanese: {
      target: "いえ",
      roman: "ie",
      accept: ["いえ", "イエ", "ie", "iye"],
      speed: 0.76,
      gainDb: 5.0
    }
  },
  {
    id: "cat",
    tamil: "பூனை",
    hindi: {
      target: "बिल्ली",
      roman: "billi",
      accept: ["बिल्ली", "बिली", "billi", "bili"],
      speed: 0.84,
      gainDb: 3.0
    },
    japanese: {
      target: "ねこ",
      roman: "neko",
      accept: ["ねこ", "ネコ", "neko"],
      speed: 0.82,
      gainDb: 4.0
    }
  },
  {
    id: "apple",
    tamil: "ஆப்பிள்",
    hindi: {
      target: "सेब",
      roman: "seb",
      accept: ["सेब", "seb", "seib"],
      speed: 0.84,
      gainDb: 3.0
    },
    japanese: {
      target: "りんご",
      roman: "ringo",
      accept: ["りんご", "リンゴ", "ringo"],
      speed: 0.82,
      gainDb: 4.0
    }
  }
];

function listConcepts() {
  return CONCEPTS.map(item => ({
    id: item.id,
    tamil: item.tamil,
    hindi: item.hindi.target,
    japanese: item.japanese.target
  }));
}

function getConcepts(limit = null) {
  if (limit == null) return CONCEPTS.slice();

  const n = Math.max(1, Number(limit) || 1);
  return CONCEPTS.slice(0, n);
}

module.exports = {
  listConcepts,
  getConcepts
};
