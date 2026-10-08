/**
 * ExamAssist AI - Question Classifier
 * Classifies academic questions into 10 distinct question types and identifies
 * subject, topic, difficulty, and whether web search is required.
 */

import { assessQuestionQuality } from "./questionQuality.js";

export function classifyQuestion(questionText, options = []) {
  const text = String(questionText || "").trim();
  const lower = text.toLowerCase();
  const normalizedOptions = Array.isArray(options) ? options.map(o => String(o).trim()) : [];

  // 1. Detect Options from text if not provided explicitly
  let extractedOptions = [...normalizedOptions];
  if (extractedOptions.length === 0) {
    const optionMatches = [...text.matchAll(/(?:^|\n|\s+)(?:\(?([A-Ea-e1-5])[\).:\-]\s+)([^\n\r]+)/g)];
    if (optionMatches.length >= 2) {
      extractedOptions = optionMatches.map(m => `${m[1].toUpperCase()}) ${m[2].trim()}`);
    }
  }

  // 2. Identify Question Type
  let questionType = "CONCEPTUAL";

  // Check SQL
  const isSQL = /\b(select\s+.*from|insert\s+into|update\s+.*set|delete\s+from|create\s+table|alter\s+table|group\s+by|order\s+by|inner\s+join|left\s+join|where\s+.*=)\b/i.test(text) ||
                (/\b(sql|database|query|table|schema|relational)\b/i.test(lower) && /\b(select|from|join|where)\b/i.test(lower));

  // Check DEBUGGING
  const isDebugging = /\b(debug|find the bug|fix the error|what is wrong with|correct the following code|syntax error|compilation error|traceback|exception)\b/i.test(lower) ||
                      (/\b(error|bug|issue)\b/i.test(lower) && /\b(code|function|program|snippet)\b/i.test(lower));

  // Check CODING
  const isCoding = !isSQL && !isDebugging && (
    /\b(write a (function|program|script|method|class|algorithm)|implement|def\s+\w+|function\s*\(|public\s+class|console\.log|cout\s*<<)\b/i.test(text) ||
    (/\b(python|javascript|typescript|c\+\+|java|rust|golang|ruby|php)\b/i.test(lower) && /\b(function|code|algorithm|array|list|tree|recursion)\b/i.test(lower))
  );

  // Check MULTI_SELECT
  const isMultiSelect = extractedOptions.length >= 2 && (
    /\b(select all that apply|choose all|which of the following are|select multiple|check all that apply)\b/i.test(lower) ||
    /\b(more than one option|multiple answers)\b/i.test(lower)
  );

  // Check TRUE_FALSE
  const isTrueFalse = (
    /\b(true\s+or\s+false|t\s*\/\s*f|\(true\/false\))\b/i.test(lower) ||
    (extractedOptions.length === 2 && extractedOptions.some(o => /true/i.test(o)) && extractedOptions.some(o => /false/i.test(o)))
  );

  // Check FILL_BLANK
  const isFillBlank = /_{2,}|\[blank\]|<blank>|\(\s*blank\s*\)|\.\.\.{2,}/i.test(text) ||
                      /\b(fill in the (blank|blanks)|complete the sentence)\b/i.test(lower);

  // Check NUMERICAL / Math
  const isNumerical = (
    /\b(calculate|compute|solve for|evaluate|integrate|differentiate|find the (value|molarity|mass|volume|area|perimeter|probability|limit|acceleration|velocity|work|force|magnitude)|determine the (numerical|value|molarity|mass)|magnitude)\b/i.test(lower) ||
    /[0-9]+\s*[\+\-\*\/^√=]\s*[0-9]+/i.test(text) ||
    /\b(derivative|integral|matrix|eigenvalue|logarithm|probability|limit as|sin\(|cos\(|tan\(|molarity)\b/i.test(lower)
  ) && !isCoding && !isSQL;

  // Check MCQ
  const isMCQ = extractedOptions.length >= 2 && !isMultiSelect && !isTrueFalse;

  // Check SHORT_ANSWER
  const isShortAnswer = (
    /\b(name the|state the|define the term|what is called|in one word|give the term)\b/i.test(lower) &&
    extractedOptions.length === 0 && !isNumerical && !isCoding
  );

  // Resolve hierarchy
  if (isMultiSelect) questionType = "MULTI_SELECT";
  else if (isTrueFalse) questionType = "TRUE_FALSE";
  else if (isMCQ) questionType = "MCQ";
  else if (isSQL) questionType = "SQL";
  else if (isDebugging) questionType = "DEBUGGING";
  else if (isCoding) questionType = "CODING";
  else if (isFillBlank) questionType = "FILL_BLANK";
  else if (isNumerical) questionType = "NUMERICAL";
  else if (isShortAnswer) questionType = "SHORT_ANSWER";
  else questionType = "CONCEPTUAL";

  // 3. Subject and Topic Identification
  const subjectMap = [
    {
      subject: "Computer Science",
      regex: /\b(algorithm|data structure|pointer|compiler|database|cpu|memory|network|api|object-oriented|recursion|complexity|binary search|sorting|graph|hash table|sql|python|javascript|java|c\+\+)\b/i,
      defaultTopic: "Computer Science & Programming"
    },
    {
      subject: "Mathematics",
      regex: /\b(calculus|algebra|geometry|topology|eigenvalue|theorem|differential|integral|polynomial|matrix|probability|statistics|derivative|vector|logarithm)\b/i,
      defaultTopic: "Mathematics & Analysis"
    },
    {
      subject: "Physics",
      regex: /\b(velocity|acceleration|momentum|gravity|quantum|thermodynamics|newton|relativity|flux|electric|magnetic|photon|energy|kinetic|potential|force|wavelength)\b/i,
      defaultTopic: "Physics & Mechanics"
    },
    {
      subject: "Chemistry",
      regex: /\b(molecule|reaction|catalyst|equilibrium|acid|base|molarity|stoichiometry|valence|covalent|ionic|orbital|enthalpy|periodic table|ph|redox|titration)\b/i,
      defaultTopic: "Chemistry & Molecular Sciences"
    },
    {
      subject: "Biology",
      regex: /\b(dna|rna|protein|enzyme|cell|mitochondria|photosynthesis|evolution|organism|chromosome|gene|bacteria|atp|respiration|membrane|ribosome|genetics)\b/i,
      defaultTopic: "Biology & Life Sciences"
    },
    {
      subject: "Economics & Finance",
      regex: /\b(inflation|gdp|interest rate|monetary|elasticity|market|equilibrium price|fiscal|capital|equity|macroeconomics|microeconomics|supply and demand|depreciation)\b/i,
      defaultTopic: "Economics & Market Principles"
    },
    {
      subject: "History",
      regex: /\b(century|war|treaty|revolution|empire|dynasty|constitution|president|monarch|colonial|ancient|medieval|declaration|cold war|treaty of)\b/i,
      defaultTopic: "Historical Studies"
    },
    {
      subject: "Philosophy & Ethics",
      regex: /\b(epistemology|utilitarianism|kant|ethics|morality|existentialism|syllogism|argument|fallacy|plato|aristotle|categorical imperative)\b/i,
      defaultTopic: "Philosophy & Ethics"
    },
    {
      subject: "Literature",
      regex: /\b(metaphor|protagonist|narrative|sonnet|symbolism|allegory|motif|stanza|soliloquy|antagonist|genre|tragedy)\b/i,
      defaultTopic: "Literature & Literary Analysis"
    }
  ];

  let detectedSubject = "General Academic";
  let detectedTopic = "Academic Principles";

  for (const item of subjectMap) {
    if (item.regex.test(text)) {
      detectedSubject = item.subject;
      detectedTopic = item.defaultTopic;
      break;
    }
  }

  // Adjust defaults for coding, sql, numerical if subject unclassified
  if (detectedSubject === "General Academic") {
    if (questionType === "CODING" || questionType === "SQL" || questionType === "DEBUGGING") {
      detectedSubject = "Computer Science";
      detectedTopic = questionType === "SQL" ? "Database Systems" : "Programming & Algorithms";
    } else if (questionType === "NUMERICAL") {
      detectedSubject = "Mathematics";
      detectedTopic = "Numerical Problem Solving";
    }
  }

  // Refine specific topic
  if (/\b(mitochondria|respiration|atp)\b/i.test(text)) detectedTopic = "Cellular Biology & Energy";
  else if (/\b(photosynthesis|chloroplast)\b/i.test(text)) detectedTopic = "Plant Biology & Photosynthesis";
  else if (/\b(binary search|sorting|quicksort|mergesort)\b/i.test(text)) detectedTopic = "Algorithms & Complexity";
  else if (/\b(derivative|rate of change|differentiation)\b/i.test(text)) detectedTopic = "Calculus - Derivatives";
  else if (/\b(integral|integration|antiderivative)\b/i.test(text)) detectedTopic = "Calculus - Integrals";
  else if (/\b(newton's second law|f\s*=\s*ma|force)\b/i.test(text)) detectedTopic = "Classical Mechanics";
  else if (/\b(greenhouse effect|climate|atmosphere)\b/i.test(text)) detectedTopic = "Environmental Science";

  // 4. Difficulty Assessment
  let difficulty = "Intermediate";
  const wordCount = text.split(/\s+/).length;
  if (wordCount < 15 && (questionType === "MCQ" || questionType === "TRUE_FALSE" || questionType === "SHORT_ANSWER")) {
    difficulty = "Introductory";
  } else if (wordCount > 60 || questionType === "DEBUGGING" || /\b(eigenvalue|quantum|multivariable|advanced|complex|optimize)\b/i.test(lower)) {
    difficulty = "Advanced";
  }

  // 5. Determine whether Web Search is needed
  // Self-contained simple arithmetic does not require search, but factual, empirical, or academic questions do
  let webSearchNeeded = true;
  if (questionType === "NUMERICAL" && /^[0-9\s\+\-\*\/\(\)\^\.]+=?\s*\??$/.test(text)) {
    webSearchNeeded = false;
  }

  return {
    rawQuestion: text,
    questionType,
    subject: detectedSubject,
    topic: detectedTopic,
    difficulty,
    webSearchNeeded,
    options: extractedOptions,
    hasOptions: extractedOptions.length > 0,
    questionQuality: assessQuestionQuality(text, extractedOptions, questionType)
  };
}
