/**
 * ExamAssist AI - User Message Builder for Academic Problem Solver
 * Formats question, options, classification, and evidence into structured LLM prompt.
 */

export function buildUserMessage({ question, text, options = [], type, questionType, subject, sources = [] }) {
  const q = (question || text || "").trim();
  if (!q || q.length < 5) {
    throw new Error("EMPTY_QUESTION");
  }

  const letters = "ABCDEFGHIJ";
  const optionLines = Array.isArray(options) && options.length > 0
    ? options
        .map((o, i) => {
          const val = typeof o === "string" ? o.trim() : (o.text || o.option || JSON.stringify(o)).trim();
          if (/^[A-J][\.\)]/i.test(val)) return val;
          return `${letters[i] || i + 1}. ${val}`;
        })
        .join("\n")
    : "(none)";

  const evidence = Array.isArray(sources) && sources.length > 0
    ? sources.map((s, i) => `[${i + 1}] ${s.title || s.domain || "Source"} - ${s.url || ""}\n${s.snippet || ""}`).join("\n\n")
    : "(none)";

  return `QUESTION:
${q}

OPTIONS:
${optionLines}

TYPE: ${type || questionType || "UNKNOWN"}   SUBJECT: ${subject || "UNKNOWN"}

EVIDENCE:
${evidence}`;
}
