/**
 * ExamAI Pipeline - Step 5: AI Answer Drafter
 * Generates an initial evidence-grounded answer draft tailored to the question category.
 * Integrates Prompt #8 (Multiple-Choice), Prompt #9 (Mathematics), Prompt #10 (Coding).
 */

import {
  MASTER_SYSTEM_PROMPT,
  MULTIPLE_CHOICE_PROMPT,
  MATHEMATICS_PROMPT,
  CODING_PROMPT
} from "../prompts.js";
import { defaultAIClient } from "../aiClient.js";

function formatSourcesForPrompt(sources) {
  if (!sources || sources.length === 0) return "No external sources retrieved. Independent verification required.";
  return sources.map((s, i) =>
    `[${i + 1}] Title: ${s.title}\nURL: ${s.url}\nSource tier: ${s.authorityTier || s.quality || "UNASSESSED"}\nContent: ${s.snippet || "N/A"}`
  ).join("\n\n");
}

export async function draftAnswer(analysis, evaluatedSources, aiClient = defaultAIClient) {
  const { rawQuestion, category, options, isMCQ, isMathematics, isCoding, programmingLanguage } = analysis;
  const sourcesFormatted = formatSourcesForPrompt(evaluatedSources);

  let systemPrompt = MASTER_SYSTEM_PROMPT;
  let userPrompt = "";

  if (isMCQ) {
    const optionsText = options.length > 0 ? options.join("\n") : "Extract options from question text.";
    userPrompt = MULTIPLE_CHOICE_PROMPT
      .replace("{{QUESTION}}", rawQuestion)
      .replace("{{OPTIONS}}", optionsText)
      .replace("{{SOURCES}}", sourcesFormatted);
  } else if (isMathematics) {
    userPrompt = MATHEMATICS_PROMPT
      .replace("{{QUESTION}}", rawQuestion);
    userPrompt += `\n\nREFERENCE SOURCES:\n${sourcesFormatted}`;
  } else if (isCoding) {
    userPrompt = CODING_PROMPT
      .replace("{{QUESTION}}", rawQuestion)
      .replace("{{LANGUAGE}}", programmingLanguage)
      .replace("{{REQUIREMENTS}}", "Produce idiomatic, correct, edge-case resilient code with complexity analysis.")
      + `\n\nREFERENCE SOURCES:\n${sourcesFormatted}`;
  } else {
    // General Academic / Conceptual Question
    userPrompt = `Please answer the following academic question using the supplied sources as primary evidence.
Follow all principles from the Master System Prompt.

QUESTION:
${rawQuestion}

RETRIEVED SOURCES:
${sourcesFormatted}

Provide:
1. Direct Answer
2. Clear Academic Explanation
3. Key Supporting Points`;
  }

  try {
    const draftText = await aiClient.generateCompletion({
      systemPrompt,
      userPrompt,
      temperature: 0.1
    });

    if (draftText && draftText.trim().length > 20) {
      return draftText.trim();
    }
  } catch (err) {
    console.warn("[AnswerDrafter] Error drafting answer:", err.message);
  }

  return `Direct Answer: UNVERIFIED\n\nExplanation: The answer could not be generated or verified because the AI service was unavailable.\n\nEvidence level: UNVERIFIED`;
}
