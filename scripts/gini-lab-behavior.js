"use strict";

const Expression = require("./gini-expression");
const Say = require("./gini-lab-say");

const BEHAVIORS = {
  yes: {
    expression: "yes",
    phrases: {
      en: "Yes. Good thinking.",
      ta: "ஆம். நல்லா யோசிச்சு சொன்னாய்.",
      hi: "हाँ. अच्छा सोचा."
    }
  },
  no: {
    expression: "no",
    phrases: {
      en: "No. That's okay. Let's try another way.",
      ta: "இல்லை. பரவாயில்லை. வேறொரு முறையில் பார்க்கலாம்.",
      hi: "नहीं. कोई बात नहीं. एक और तरीके से कोशिश करते हैं."
    }
  },
  happy: {
    expression: "happy",
    phrases: {
      en: "Nice work. You got that part.",
      ta: "அருமை. இந்த பகுதி உனக்கு புரிந்துவிட்டது.",
      hi: "बहुत अच्छा. यह हिस्सा तुम्हें समझ आ गया."
    }
  },
  encourage: {
    expression: "acknowledge",
    phrases: {
      en: "Good try. Take your time.",
      ta: "நல்ல முயற்சி. அவசரம் இல்லை.",
      hi: "अच्छी कोशिश. आराम से सोचो."
    }
  },
  curious: {
    expression: "curious",
    phrases: {
      en: "Interesting. Let's think about it together.",
      ta: "சுவாரஸ்யம். நாம சேர்ந்து யோசிக்கலாம்.",
      hi: "दिलचस्प है. चलो साथ में सोचते हैं."
    }
  }
};

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    name: String(args[0] || "encourage").toLowerCase(),
    language: "en"
  };

  const languageIndex = args.indexOf("--language");
  if (languageIndex >= 0 && args[languageIndex + 1]) {
    result.language = String(args[languageIndex + 1]).toLowerCase();
  }

  return result;
}

async function runBehavior(name, language) {
  const behavior = BEHAVIORS[name];

  if (!behavior) {
    throw new Error(
      "Unknown behavior. Available: " + Object.keys(BEHAVIORS).join(", ")
    );
  }

  const phrase =
    behavior.phrases[language] ||
    behavior.phrases.en;

  console.log(
    "GINI BEHAVIOR:",
    name.toUpperCase(),
    "| expression=" + behavior.expression,
    "| language=" + language
  );

  await Say.say(language, phrase);

  await new Promise(resolve => setTimeout(resolve, 120));

  await Expression.runExpression(behavior.expression);

  return {
    ok: true,
    name,
    language,
    phrase,
    expression: behavior.expression
  };
}

async function main() {
  const args = parseArgs();
  const result = await runBehavior(args.name, args.language);
  console.log("GINI BEHAVIOR COMPLETE:", JSON.stringify(result));
}

if (require.main === module) {
  main().catch(error => {
    console.error("GINI BEHAVIOR ERROR:", error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  BEHAVIORS,
  runBehavior
};
