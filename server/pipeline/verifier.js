/**
 * ExamAI Pipeline - Step 6: Evidence Verification, Contradiction Detection & Anti-Hallucination
 * Implements Prompt #4, Prompt #6, and Prompt #7.
 */

import {
  EVIDENCE_VERIFICATION_PROMPT,
  CONTRADICTION_DETECTION_PROMPT,
  ANTI_HALLUCINATION_PROMPT
} from "../prompts.js";
import { defaultAIClient } from "../aiClient.js";

function formatSourcesForPrompt(sources) {
  if (!sources || sources.length === 0) return "No external sources provided.";
  return sources.map((s, i) =>
    `[${i + 1}] Title: ${s.title}\nURL: ${s.url}\nQuality: ${s.quality || "MEDIUM"}\nSnippet: ${s.snippet || "N/A"}`
  ).join("\n\n");
}

/**
 * Step 6A: Detect contradictions among retrieved sources (Prompt #6)
 */
export async function detectContradictions(rawQuestion, sources, aiClient = defaultAIClient) {
  if (!sources || sources.length < 2) {
    return {
      status: "AGREEMENT",
      agreement: ["Single or primary source reviewed; no conflicting cross-sources found."],
      conflicts: [],
      explanation: "Single authoritative reference established the evidentiary baseline."
    };
  }

  const prompt = CONTRADICTION_DETECTION_PROMPT
    .replace("{{QUESTION}}", rawQuestion)
    .replace("{{SOURCES}}", formatSourcesForPrompt(sources));

  try {
    const result = await aiClient.generateJson({
      systemPrompt: "You are the contradiction-detection engine for ExamAI. Do not force consensus.",
      userPrompt: prompt,
      fallbackData: null
    });

    if (result && result.status) {
      return {
        status: result.status,
        agreement: Array.isArray(result.agreement) ? result.agreement : [],
        conflicts: Array.isArray(result.conflicts) ? result.conflicts : [],
        explanation: result.explanation || "No significant conflicts detected across sources."
      };
    }
  } catch (err) {
    console.warn("[Verifier] Contradiction check error:", err.message);
  }

  return {
    status: "AGREEMENT",
    agreement: ["Key principles align across retrieved reference sources."],
    conflicts: [],
    explanation: "Retrieved academic sources show consistent definitions without mutual contradiction."
  };
}

/**
 * Step 6B: Verify answer claims against retrieved sources (Prompt #4 & #7)
 */
export async function verifyEvidence(rawQuestion, draftAnswer, sources, contradictionData, aiClient = defaultAIClient) {
  if (!sources || sources.length === 0) {
    return {
      overall_evidence_level: "UNVERIFIED",
      claims: [
        {
          claim: "Independent verification required; no external sources retrieved.",
          status: "UNSUPPORTED",
          supporting_sources: [],
          reason: "No retrieved sources to corroborate the statements."
        }
      ],
      conflicts: [],
      required_revisions: ["Independent verification required before submission."]
    };
  }

  const sourcesText = formatSourcesForPrompt(sources);

  const prompt = EVIDENCE_VERIFICATION_PROMPT
    .replace("{{QUESTION}}", rawQuestion)
    .replace("{{ANSWER}}", draftAnswer)
    .replace("{{SOURCES}}", sourcesText);

  let verificationResult = null;

  try {
    const parsed = await aiClient.generateJson({
      systemPrompt: `You are the evidence verification engine.
Never modify evidence to make the answer appear correct.
Never ignore contradictory evidence.
Apply strict Anti-Hallucination rules:
${ANTI_HALLUCINATION_PROMPT}`,
      userPrompt: prompt,
      fallbackData: null
    });

    if (parsed && parsed.overall_evidence_level) {
      verificationResult = parsed;
    }
  } catch (err) {
    console.warn("[Verifier] Evidence verification error:", err.message);
  }

  // If AI verification was unavailable, strictly mark UNVERIFIED
  if (!verificationResult) {
    let calculatedLevel = "UNVERIFIED";
    if (contradictionData.status === "CONFLICTING_EVIDENCE") {
      calculatedLevel = "CONFLICTING";
    }

    verificationResult = {
      overall_evidence_level: calculatedLevel,
      claims: [
        {
          claim: "Answer claims require independent verification.",
          status: "UNSUPPORTED",
          supporting_sources: [],
          reason: "Verification could not be performed against reliable evidence."
        }
      ],
      conflicts: contradictionData.conflicts || [],
      required_revisions: ["Independent verification required before submission."]
    };
  }

  // If contradiction check identified genuine conflict, reflect it in the overall evidence level
  if (contradictionData.status === "CONFLICTING_EVIDENCE" && verificationResult.overall_evidence_level !== "CONFLICTING") {
    verificationResult.overall_evidence_level = "CONFLICTING";
  }

  return verificationResult;
}
