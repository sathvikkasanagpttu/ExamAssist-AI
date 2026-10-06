/**
 * ExamAI Pipeline - Step 1: Question Analyzer
 * Identifies question type, academic subject, core keywords, and structured parameters.
 */

export function analyzeQuestion(questionText, optionsOverride = null) {
  const text = String(questionText || "").trim();
  
  // 1. Detect Multiple-Choice Question (MCQ)
  let isMCQ = false;
  let options = [];

  if (Array.isArray(optionsOverride) && optionsOverride.length > 0) {
    isMCQ = true;
    options = optionsOverride.map(o => String(o).trim());
  } else {
    // Check for standard MCQ patterns like "A) ... B) ...", "(A) ... (B) ...", "A. ... B. ..."
    const optionMatches = [...text.matchAll(/(?:^|\n|\s+)(?:\(?([A-Ea-e1-5])[\).:\-]\s+)([^\n\r]+)/g)];
    if (optionMatches.length >= 2) {
      isMCQ = true;
      options = optionMatches.map(m => `${m[1].toUpperCase()}) ${m[2].trim()}`);
    }
  }

  // 2. Detect True/False Question
  const isTrueFalse = !isMCQ && /\b(true\s+or\s+false|t\s*\/\s*f|\(true\/false\))\b/i.test(text);

  // 3. Detect Mathematics / Numerical Calculation Question
  const mathIndicators = [
    /\b(calculate|compute|solve\s+for|evaluate|integral|derivative|matrix|vector|limit\s+as|formula|equation)\b/i,
    /[0-9]+\s*[\+\-\*\/^√]\s*[0-9]+/,
    /\b(sin|cos|tan|log|ln|dx|dy|lim|sum|pi|theta)\b/i,
    /=\s*\?/
  ];
  const isMathematics = mathIndicators.some(pattern => pattern.test(text));

  // 4. Detect Coding / Programming Question
  const codeIndicators = [
    /\b(python|javascript|typescript|c\+\+|java|rust|golang|sql|html|css|php|ruby|swift|kotlin)\b/i,
    /\b(function|def\s+\w+|class\s+\w+|return\s+|console\.log|print\(|public\s+static\s+void|async\s+function)\b/,
    /\b(algorithm|time\s+complexity|space\s+complexity|data\s+structure|binary\s+tree|linked\s+list|regex)\b/i
  ];
  const isCoding = codeIndicators.some(pattern => pattern.test(text));

  // Detect language if coding
  let detectedLanguage = "General Programming";
  if (isCoding) {
    const langMap = [
      ["Python", /\bpython\b/i],
      ["JavaScript", /\b(javascript|node\.js|js)\b/i],
      ["TypeScript", /\b(typescript|ts)\b/i],
      ["Java", /\bjava\b(?!script)/i],
      ["C++", /\bc\+\+\b/i],
      ["C#", /\bc#\b/i],
      ["C", /\b\bc\b\s+programming/i],
      ["SQL", /\bsql\b/i],
      ["Rust", /\brust\b/i],
      ["Go", /\b(golang|go\s+language)\b/i]
    ];
    for (const [name, regex] of langMap) {
      if (regex.test(text)) {
        detectedLanguage = name;
        break;
      }
    }
  }

  // 5. Subject Classification
  const subjectClassifiers = [
    { subject: "Computer Science", regex: /\b(algorithm|data structure|pointer|compiler|database|cpu|memory|network|api|object-oriented|recursion|complexity)\b/i },
    { subject: "Mathematics", regex: /\b(calculus|algebra|geometry|topology|eigenvalue|theorem|differential|integral|polynomial|matrix)\b/i },
    { subject: "Physics", regex: /\b(velocity|acceleration|momentum|gravity|quantum|thermodynamics|newton|relativity|flux|electric|magnetic|photon)\b/i },
    { subject: "Chemistry", regex: /\b(molecule|reaction|catalyst|equilibrium|acid|base|molarity|stoichiometry|valence|covalent|ionic|orbital)\b/i },
    { subject: "Biology", regex: /\b(dna|rna|protein|enzyme|cell|mitochondria|photosynthesis|evolution|organism|chromosome|gene|bacteria)\b/i },
    { subject: "Economics & Finance", regex: /\b(inflation|gdp|interest rate|monetary|elasticity|market|equilibrium price|fiscal|capital|equity)\b/i },
    { subject: "History", regex: /\b(century|war|treaty|revolution|empire|dynasty|constitution|president|monarch|colonial)\b/i },
    { subject: "Philosophy & Ethics", regex: /\b(epistemology|utilitarianism|kant|ethics|morality|existentialism|syllogism|argument|fallacy)\b/i },
    { subject: "Literature", regex: /\b(metaphor|protagonist|narrative|sonnet|symbolism|allegory|motif|stanza|soliloquy)\b/i }
  ];

  let detectedSubject = "General Academic";
  for (const { subject, regex } of subjectClassifiers) {
    if (regex.test(text)) {
      detectedSubject = subject;
      break;
    }
  }

  if (detectedSubject === "General Academic") {
    if (isCoding) detectedSubject = "Computer Science";
    else if (isMathematics) detectedSubject = "Mathematics";
  }

  // Determine Primary Question Category
  let category = "factual_recall";
  if (isMCQ) category = "multiple_choice";
  else if (isTrueFalse) category = "true_false";
  else if (isMathematics) category = "mathematics";
  else if (isCoding) category = "coding";
  else if (/\b(compare|contrast|difference between|versus|vs)\b/i.test(text)) category = "comparison";
  else if (/\b(why|explain how|what causes|mechanism of|rationale)\b/i.test(text)) category = "reasoning";
  else if (/\b(opinion|in your view|interpret|argue|discuss)\b/i.test(text)) category = "subjective";

  // Extract Keywords
  const stopWords = new Set([
    "what","is","are","the","a","an","in","on","at","by","for","with","about","against","between","into",
    "through","during","before","after","above","below","to","from","up","down","of","and","or","but","not",
    "explain","which","following","calculate","find","determine","given","statement","show","how","why","does"
  ]);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
  const uniqueKeywords = [...new Set(words)].slice(0, 8);

  return {
    rawQuestion: text,
    category,
    subject: detectedSubject,
    isMCQ,
    options,
    isTrueFalse,
    isMathematics,
    isCoding,
    programmingLanguage: detectedLanguage,
    keywords: uniqueKeywords
  };
}
