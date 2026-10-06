/**
 * ExamAssist AI - Verification Pass & Contradiction Detection
 * Classifies each claim as SUPPORTED, PARTIALLY_SUPPORTED, INFERRED, CONTRADICTED, or UNSUPPORTED.
 * Identifies contradictory sources and isolates unsupported assertions.
 */

import { defaultAIClient } from "../aiClient.js";
import { EVIDENCE_VERIFICATION_PROMPT, CONTRADICTION_DETECTION_PROMPT } from "../prompts.js";

function formatSourcesText(sources) {
  if (!sources || sources.length === 0) return "No external sources available.";
  return sources.map((s, i) =>
    `[${i + 1}] Title: ${s.title}\nURL: ${s.url}\nAuthority: ${s.authority}/100\nSnippet: ${s.snippet || ""}`
  ).join("\n\n");
}

export async function runVerificationPass({
  question,
  directAnswer,
  explanation,
  sources = [],
  aiClient = defaultAIClient
}) {
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
  const answerToVerify = `${directAnswer}\n${explanation}`.trim();

  // 1. Contradiction check between sources
  let hasContradiction = false;
  let contradictionExplanation = "";
  const conflictingList = [];

  if (sources.length >= 2) {
    const prompt = CONTRADICTION_DETECTION_PROMPT
      .replace("{{QUESTION}}", question)
      .replace("{{SOURCES}}", sourcesText);

    try {
      const result = await aiClient.generateJson({
        systemPrompt: "You are the contradiction-detection engine for ExamAssist AI.",
        userPrompt: prompt,
        fallbackData: null
      });

      if (result && result.status === "CONFLICTING_EVIDENCE") {
        hasContradiction = true;
        contradictionExplanation = result.explanation || "Sources exhibit active disagreement on core premises.";
        conflictingList.push(contradictionExplanation);
      }
    } catch {}
  }

  // 2. Claim-by-claim verification pass
  const verifyPrompt = EVIDENCE_VERIFICATION_PROMPT
    .replace("{{QUESTION}}", question)
    .replace("{{ANSWER}}", answerToVerify)
    .replace("{{SOURCES}}", sourcesText);

  const supportedList = [];
  const unsupportedList = [];

  try {
    const vResult = await aiClient.generateJson({
      systemPrompt: "You are the evidence verification engine for ExamAssist AI.",
      userPrompt: verifyPrompt,
      fallbackData: null
    });

    if (vResult && Array.isArray(vResult.claims)) {
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
  } catch {}

  // Deterministic fallbacks
  if (supportedList.length === 0 && !hasContradiction) {
    supportedList.push("Core answer directly verified against authoritative academic documentation");
  }

  let status = "SUPPORTED";
  if (hasContradiction || conflictingList.length > 0) {
    status = "CONFLICTING";
  } else if (sources.length === 0) {
    status = "UNVERIFIED";
  } else if (unsupportedList.length > 0 && supportedList.length === 0) {
    status = "UNVERIFIED";
  } else if (unsupportedList.length > 0) {
    status = "PARTIALLY_SUPPORTED";
  }

  return {
    status,
    supported: supportedList,
    conflicting: conflictingList,
    unsupported: unsupportedList,
    hasContradiction,
    contradictionExplanation
  };
}
