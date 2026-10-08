/**
 * ExamAI Pipeline - Step 4: Source Evaluator
 * Evaluates retrieved sources for authority, relevance, and evidence quality based on Prompt #3.
 */

import { SOURCE_EVALUATION_PROMPT } from "../prompts.js";
import { defaultAIClient } from "../aiClient.js";

/**
 * Heuristic fallback authority evaluator based on domain reputation
 */
function calculateHeuristicScore(source, question, keywords) {
  const url = (source.url || "").toLowerCase();
  const domain = (source.domain || "").toLowerCase();
  const title = (source.title || "").toLowerCase();
  const snippet = (source.snippet || "").toLowerCase();

  let authority = 65;
  let isPrimary = false;

  // Domain authority bonuses
  if (domain.endsWith(".gov") || domain.endsWith(".mil")) {
    authority = 95;
    isPrimary = true;
  } else if (domain.endsWith(".edu") || domain.endsWith(".ac.uk") || domain.includes("harvard") || domain.includes("mit.edu") || domain.includes("stanford")) {
    authority = 92;
    isPrimary = true;
  } else if (domain.includes("doi.org") || domain.includes("ncbi") || domain.includes("nature.com") || domain.includes("sciencedirect") || domain.includes("ieee.org") || domain.includes("acm.org") || domain.includes("arxiv.org")) {
    authority = 94;
    isPrimary = true;
  } else if (domain.includes("wikipedia.org")) {
    authority = 82;
  } else if (domain.includes("developer.mozilla.org") || domain.includes("docs.python.org") || domain.includes("w3.org")) {
    authority = 90;
    isPrimary = true;
  } else if (domain.includes("reddit.com") || domain.includes("quora.com") || domain.includes("medium.com") || domain.includes("blogspot.com") || domain.includes("blog")) {
    authority = 42;
  }

  // Relevance calculation: check presence of keywords
  let matchedKeywords = 0;
  for (const kw of keywords) {
    if (title.includes(kw.toLowerCase()) || snippet.includes(kw.toLowerCase())) {
      matchedKeywords++;
    }
  }
  const matchRatio = keywords.length > 0 ? (matchedKeywords / keywords.length) : 0.5;
  const relevance = Math.min(100, Math.round(50 + (matchRatio * 50)));

  // Evidence score
  let quality = "MEDIUM";
  if (authority >= 85 && relevance >= 70) quality = "HIGH";
  else if (authority < 50 || relevance < 40) quality = "LOW";
  else if (authority < 30) quality = "UNRELIABLE";

  const reason = isPrimary
    ? `Authoritative institutional/academic source with high domain verification (${domain}).`
    : `Standard reference material with ${matchedKeywords} matching concept keywords.`;

  const authorityTier = authority >= 85 ? "HIGH" : authority < 50 ? "LOW" : "MEDIUM";
  const relevanceTier = relevance >= 75 ? "HIGH" : relevance < 45 ? "LOW" : "MEDIUM";
  return {
    url: source.url,
    authorityTier,
    relevanceTier,
    quality,
    reason
  };
}

export async function evaluateSources(sources, analysis, aiClient = defaultAIClient) {
  if (!sources || sources.length === 0) return [];

  const { rawQuestion, keywords } = analysis;

  const sourcesFormatted = sources.map((s, idx) =>
    `[${idx + 1}] Title: ${s.title}\nURL: ${s.url}\nDomain: ${s.domain}\nSnippet: ${s.snippet || "N/A"}`
  ).join("\n\n");

  const prompt = SOURCE_EVALUATION_PROMPT
    .replace("{{QUESTION}}", rawQuestion)
    .replace("{{SOURCES}}", sourcesFormatted);

  try {
    const aiEvaluation = await aiClient.generateJson({
      systemPrompt: "You are the source-evaluation module for ExamAI.",
      userPrompt: prompt,
      fallbackData: null
    });

    if (Array.isArray(aiEvaluation) && aiEvaluation.length > 0) {
      return sources.map(src => {
        const evalItem = aiEvaluation.find(e => e.url === src.url);
        if (evalItem && evalItem.authorityTier) {
          return {
            ...src,
            authorityTier: evalItem.authorityTier,
            relevanceTier: evalItem.relevanceTier || "UNASSESSED",
            quality: evalItem.quality || "MEDIUM",
            evaluation_reason: evalItem.reason || "Evaluated against academic standards."
          };
        }
        const fallbackScores = calculateHeuristicScore(src, rawQuestion, keywords);
        return {
          ...src,
          authorityTier: fallbackScores.authorityTier,
          relevanceTier: fallbackScores.relevanceTier,
          quality: fallbackScores.quality,
          evaluation_reason: fallbackScores.reason
        };
      });
    }
  } catch (err) {
    console.warn("[SourceEvaluator] AI evaluation error:", err.message);
  }

  // Heuristic evaluation fallback
  return sources.map(src => {
    const scores = calculateHeuristicScore(src, rawQuestion, keywords);
    return {
      ...src,
      authorityTier: scores.authorityTier,
      relevanceTier: scores.relevanceTier,
      quality: scores.quality,
      evaluation_reason: scores.reason
    };
  });
}
