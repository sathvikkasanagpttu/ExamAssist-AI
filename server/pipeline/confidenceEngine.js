/**
 * ExamAssist AI - Confidence Engine
 * Computes calibrated confidence level (HIGH / MEDIUM / LOW / UNVERIFIED)
 * and generates a concise, transparent one-line confidence reason.
 */

export function computeConfidence({
  verificationStatus,
  sources = [],
  hasContradiction = false,
  contradictionExplanation = "",
  questionType = "CONCEPTUAL"
}) {
  // If sources disagree, mark as LOW or UNVERIFIED with explicit conflict rationale
  if (hasContradiction || verificationStatus === "CONFLICTING") {
    return {
      confidence: "LOW",
      confidenceReason: contradictionExplanation
        ? `Conflicting evidence detected: ${contradictionExplanation}`
        : "Retrieved academic sources exhibit active disagreement on core premises."
    };
  }

  // If no sources are present or verification is UNVERIFIED
  if (!sources || sources.length === 0 || verificationStatus === "UNVERIFIED") {
    return {
      confidence: "UNVERIFIED",
      confidenceReason: "Unable to verify this answer because reliable evidence was not available."
    };
  }

  // Count high authority sources (authority >= 85)
  const highAuthCount = sources.filter(s => (s.authority || 0) >= 85).length;
  const highRelCount = sources.filter(s => (s.relevance || 0) >= 75).length;

  // High confidence criteria: at least 2 authoritative sources agree and high relevance
  if (highAuthCount >= 2 && highRelCount >= 2 && verificationStatus === "SUPPORTED") {
    return {
      confidence: "HIGH",
      confidenceReason: `Multiple authoritative academic sources (${highAuthCount}) agree and directly support the answer.`
    };
  }

  // Medium confidence criteria: at least 1 reliable source or partially supported
  if (sources.length >= 1 && (verificationStatus === "SUPPORTED" || verificationStatus === "PARTIALLY_SUPPORTED")) {
    return {
      confidence: "MEDIUM",
      confidenceReason: "Evidence is generally supportive, but retrieved citations are limited or indirect."
    };
  }

  // Low confidence
  return {
    confidence: "LOW",
    confidenceReason: "Available evidence is weak or incomplete; independent verification is recommended."
  };
}
