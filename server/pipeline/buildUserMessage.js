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
    ? sources.map((s, i) => {
      const label = s.type === "course_notes"
        ? `COURSE NOTES: ${s.file || "User document"}${s.page == null ? "" : `, page ${s.page}`}`
        : `${s.title || s.domain || "Source"} - ${s.url || ""}`;
      return `[${i + 1}] ${label}\n${s.snippet || ""}`;
    }).join("\n\n")
    : "(none)";

  return `QUESTION:
${q}

OPTIONS:
${optionLines}

TYPE: ${type || questionType || "UNKNOWN"}   SUBJECT: ${subject || "UNKNOWN"}

EVIDENCE:
${evidence}

Treat course notes as user-provided evidence, not guaranteed truth. If they conflict with a derivation or other evidence, explain the disagreement and lower confidence. Cite only the provided source metadata; never infer a page number.`;
}
