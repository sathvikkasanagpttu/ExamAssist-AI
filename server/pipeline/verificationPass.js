/**
 * ExamAssist AI - Verification Pass & Contradiction Detection
 * Verifies answer claims against genuine retrieved sources.
 * If verification did not run or failed, status is UNVERIFIED. Never defaults to SUPPORTED.
 */

import { defaultAIClient } from "../aiClient.js";
import { EVIDENCE_VERIFICATION_PROMPT, CONTRADICTION_DETECTION_PROMPT } from "../prompts.js";

function formatSourcesText(sources) {
  if (!sources || sources.length === 0) return "No external sources available.";
  return sources.map((s, i) => {
    if (s.type === "course_notes") {
      return `[${i + 1}] User course note: ${s.file || s.title || "document"}${s.page == null ? "" : `, page ${s.page}`}\nSnippet: ${s.snippet || ""}`;
    }
    return `[${i + 1}] Title: ${s.title}\nURL: ${s.url}\nSource tier: ${s.authorityTier || "UNASSESSED"}; relevance: ${s.relevanceTier || "UNASSESSED"}\nSnippet: ${s.snippet || ""}`;
  }).join("\n\n");
}

export async function runVerificationPass({
  question,
  directAnswer,
  explanation,
  sources = [],
  aiClient = defaultAIClient
}) {
  // If no sources exist, verification cannot confirm claims
  if (!sources || sources.length === 0) {
    return {
      status: "UNVERIFIED",
      supported: [],
      conflicting: [],
      unsupported: ["Independent verification required; no external sources retrieved."],
      hasContradiction: false,
      contradictionExplanation: ""
    };
  }

  const sourcesText = formatSourcesText(sources);
  const answerToVerify = `${typeof directAnswer === "object" ? (directAnswer.text || directAnswer.option || "") : directAnswer}\n${explanation}`.trim();

  let hasContradiction = false;
  let contradictionExplanation = "";
  const conflictingList = [];
  const supportedList = [];
  const unsupportedList = [];

  // 1. Contradiction check between sources if multiple sources are present
  if (sources.length >= 2) {
    const conflictPrompt = CONTRADICTION_DETECTION_PROMPT
      .replace("{{QUESTION}}", question)
      .replace("{{SOURCES}}", sourcesText);

    try {
      const conflictResult = await aiClient.generateJson({
        systemPrompt: "You are the contradiction-detection engine for ExamAssist AI. Compare sources for factual disagreements.",
        userPrompt: conflictPrompt
      });

      if (conflictResult && conflictResult.status === "CONFLICTING_EVIDENCE") {
        hasContradiction = true;
        contradictionExplanation = conflictResult.explanation || "Sources exhibit active disagreement on core premises.";
        conflictingList.push(contradictionExplanation);
      }
    } catch (err) {
      console.warn("[VerificationPass] Contradiction check skipped:", err.message);
    }
  }

  // 2. Claim-by-claim verification pass
  const verifyPrompt = EVIDENCE_VERIFICATION_PROMPT
    .replace("{{QUESTION}}", question)
    .replace("{{ANSWER}}", answerToVerify)
    .replace("{{SOURCES}}", sourcesText);

  let verificationRan = false;
  try {
    const vResult = await aiClient.generateJson({
      systemPrompt: "You are the evidence verification engine for ExamAssist AI. Verify each claim strictly against the provided sources.",
      userPrompt: verifyPrompt
    });

    if (vResult && Array.isArray(vResult.claims) && vResult.claims.length > 0) {
      verificationRan = true;
      for (const c of vResult.claims) {
        if (c.status === "SUPPORTED" || c.status === "PARTIALLY_SUPPORTED" || c.status === "INFERRED") {
          supportedList.push(c.claim);
        } else if (c.status === "CONTRADICTED") {
          conflictingList.push(c.claim);
        } else {
          unsupportedList.push(c.claim);
        }
      }
    }
  } catch (err) {
    console.warn("[VerificationPass] Claim verification error:", err.message);
  }

  // Determine final verification status
  if (!verificationRan) {
    return {
      status: "UNVERIFIED",
      supported: [],
      conflicting: conflictingList,
      unsupported: ["Verification could not be completed."],
      hasContradiction,
      contradictionExplanation
    };
  }

  if (hasContradiction || conflictingList.length > 0) {
    return {
      status: "CONFLICTING",
      supported: supportedList,
      conflicting: conflictingList,
      unsupported: unsupportedList,
      hasContradiction: true,
      contradictionExplanation: contradictionExplanation || conflictingList.join("; ")
    };
  }

  if (supportedList.length > 0 && unsupportedList.length === 0) {
    return {
      status: "SUPPORTED",
      supported: supportedList,
      conflicting: [],
      unsupported: [],
      hasContradiction: false,
      contradictionExplanation: ""
    };
  }

  if (supportedList.length > 0 && unsupportedList.length > 0) {
    return {
      status: "PARTIALLY_SUPPORTED",
      supported: supportedList,
      conflicting: [],
      unsupported: unsupportedList,
      hasContradiction: false,
      contradictionExplanation: ""
    };
  }

  return {
    status: "UNVERIFIED",
    supported: [],
    conflicting: [],
    unsupported: unsupportedList.length > 0 ? unsupportedList : ["Evidence is insufficient to confirm claims."],
    hasContradiction: false,
    contradictionExplanation: ""
  };
}
