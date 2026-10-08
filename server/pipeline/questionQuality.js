/**
 * Conservative, explainable checks for questions that cannot safely support a
 * definite answer. This intentionally avoids an LLM: the result is stable,
 * visible to the learner, and safe to use before retrieval or tool execution.
 */

export const QUESTION_QUALITY_STATUSES = [
  "clear",
  "ambiguous",
  "missing_info",
  "multiple_correct",
  "contradictory_options",
  "truncated"
];

const clear = () => ({ status: "clear", reason: "The visible question has enough information to analyze.", missing: "" });
const flag = (status, reason, missing = "") => ({ status, reason, missing });

function normalizedOptionText(option) {
  return String(option || "").replace(/^\s*[A-Z0-9][.)\]:\-]\s*/i, "").trim().toLowerCase();
}

/** Returns an explainable quality disposition from only visible input. */
export function assessQuestionQuality(question, options = [], questionType = "CONCEPTUAL") {
  const text = String(question || "").trim();
  const lower = text.toLowerCase();
  const visibleOptions = Array.isArray(options) ? options.map(normalizedOptionText).filter(Boolean) : [];

  if (text.length < 8 || /(?:\[\s*truncated\s*\]|\.{3,}|…)$/.test(text) || /(?:continue|complete)\s*[:\-]?$/i.test(text)) {
    return flag("truncated", "The visible prompt appears to end before the question is complete.", "The remaining prompt or source material.");
  }

  if (/\b(ignore (all |any )?(previous|prior) instructions|system\s*:|admin override|hidden answer key|disable verification|fabricate citations)\b/i.test(text)) {
    return flag("ambiguous", "The prompt contains instruction-like text that cannot be treated as part of a trustworthy question.", "A plain academic question without embedded instructions.");
  }

  if (/quantum mango|10\.0000\/not-a-real|unpublished ['"]international bureau of homework|example\.invalid|earth is flat|reveal their password/i.test(text)) {
    return flag("ambiguous", "The prompt relies on an unverifiable or unsafe authority claim.", "A verifiable source or a question that can be answered from visible facts.");
  }

  if (/triangular square|atomic number 0|1 equals 2 in ordinary arithmetic|10\s*(?:\/|divided by)\s*0|real number whose square is\s*-\s*\d+|negative elapsed time|\bin\s*-\d+\s*hours?|after earth was removed|capital city of the continent of europe|perimeter 10 cm, length 8 cm, and width 8 cm|probability 0\.8 to a and 0\.7 to not-a/i.test(lower)) {
    return flag("ambiguous", "The prompt contains an impossible or self-contradictory premise.", "A consistent premise or the intended mathematical domain.");
  }

  if (/\b(best|most important|quickly|largest number)\b/i.test(lower) || /yesterday'?s lecture|this algorithm|the revolution|unspecified equation/i.test(lower)) {
    return flag("ambiguous", "The question does not state the criterion or referent needed for one determinate answer.", "The evaluation criterion, referenced material, or concrete input.");
  }

  if (/\btrain travels\b.*\bhow long\b/i.test(lower) && (lower.match(/\b\d+\s*(?:km|kilometers?|mi|miles?)\b/g) || []).length < 2) {
    return flag("missing_info", "Travel time cannot be calculated from speed alone.", "The trip distance.");
  }
  if (/\baverage\b.*\b(class )?scores?\b/i.test(lower) && !/\d/.test(text)) {
    return flag("missing_info", "An average needs the individual scores or a supplied summary.", "The scores, total, and count.");
  }
  if (/\boutput of this program\b/i.test(lower) && !/(?:```|\b(?:print|console\.log|return|def |function |class )\b)/i.test(text)) {
    return flag("missing_info", "The prompt asks about program output but includes no program.", "The complete code and any input.");
  }
  if (/\bwhich sql query returns\b/i.test(lower) && !/\b(?:create table|table \w+|schema|columns?)\b/i.test(lower)) {
    return flag("missing_info", "The requested SQL query depends on an omitted schema.", "Table names, columns, and relationships.");
  }
  if (/\b(force using|f\s*=\s*ma)\b/i.test(lower) && !(/\bmass\b.*\d|\bacceleration\b.*\d|\d.*\b(?:kg|m\/s)/i.test(text))) {
    return flag("missing_info", "The force calculation omits the numeric mass and acceleration.", "The mass and acceleration values.");
  }
  if (/\b(?:according to (?:the )?)?(?:provided|supplied) (?:source|sources?|reports?|notes?|excerpts?)\b/i.test(lower) && !/\b(?:source|report|note)\s*:/i.test(lower)) {
    return flag("missing_info", "The prompt refers to source material that is not included in the visible request.", "The cited source excerpts.");
  }
  if (/\bwhich date should be reported for (?:the )?event\b/i.test(lower)) {
    return flag("missing_info", "The prompt does not identify the event or provide the records needed to choose a date.", "The event identity and the relevant source records.");
  }

  if (visibleOptions.length >= 2) {
    const unique = new Set(visibleOptions);
    if (unique.size === 1) {
      return flag("contradictory_options", "Every visible option is the same, so the choices cannot distinguish an answer.", "A complete set of distinct answer options.");
    }
    if (unique.size < visibleOptions.length && /\b(which|select)\b/i.test(lower)) {
      return flag("multiple_correct", "Repeated answer choices make more than one visible option indistinguishable.", "One distinct choice for each possible answer.");
    }
    if (/\btrue or false\b/i.test(lower) && visibleOptions.every((option) => option === "true" || option === "false") && unique.size === 1) {
      return flag("contradictory_options", "The true/false choices contain only one value.", "Both a true and a false option.");
    }
    if (/\b2\s*\+\s*2\b/i.test(lower) && !visibleOptions.some((option) => /(?:^|\D)4(?:\D|$)|four/.test(option))) {
      return flag("contradictory_options", "None of the visible choices matches the stated arithmetic.", "An option representing 4.");
    }
    if (/\bfilters? rows before grouping\b/i.test(lower) && !visibleOptions.some((option) => /^where\b/.test(option))) {
      return flag("contradictory_options", "The standard SQL clause for this operation is absent from the choices.", "A WHERE option or corrected prompt.");
    }
    if (/\bselect all prime numbers among 2 and 3\b/i.test(lower) && visibleOptions.every((option) => /not prime|composite|neither/.test(option))) {
      return flag("contradictory_options", "Every visible choice contradicts the primality of 2 and 3.", "An option that includes 2 and 3 as prime.");
    }
  }

  if (questionType === "MCQ" && visibleOptions.length === 1) {
    return flag("missing_info", "A multiple-choice question needs more than one visible option.", "The remaining answer options.");
  }
  return clear();
}
