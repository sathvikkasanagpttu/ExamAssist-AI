/**
 * ExamAssist AI - Search Orchestrator
 * Coordinates search query formulation, provider querying (Tavily, Serper, Brave, Wikipedia),
 * and relevance-first ranking. Never fabricates fallback sources.
 */

import { globalCache } from "../cache.js";
import { defaultAIClient } from "../aiClient.js";
import { SEARCH_QUERY_GENERATION_PROMPT } from "../prompts.js";
import {
  hasSearchApiKey,
  getActiveSearchProvider,
  executeSingleQuery,
  deduplicateSources
} from "./search.js";

function extractDomain(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "source";
  }
}

/**
 * Generate 3-5 complementary search queries
 */
export async function generateSearchQueries(question, subject, aiClient = defaultAIClient) {
  const cacheKey = globalCache.generateKey("queries", question);
  const cached = globalCache.get(cacheKey);
  if (cached) return cached;

  const prompt = SEARCH_QUERY_GENERATION_PROMPT.replace("{{QUESTION}}", question);

  try {
    const result = await aiClient.generateJson({
      systemPrompt: "You are the search-query generation module for ExamAssist AI.",
      userPrompt: prompt
    });

    if (result && Array.isArray(result.queries) && result.queries.length >= 3) {
      const valid = result.queries.map(q => typeof q === "string" ? q : q.query).filter(Boolean);
      if (valid.length >= 3) {
        globalCache.set(cacheKey, valid);
        return valid;
      }
    }
  } catch {}

  // Deterministic fallback query generation
  const cleanQ = question.replace(/^(What is|Why does|How do|Explain|Calculate|Find|Which of the following)\s+/i, "").slice(0, 100);
  const queries = [
    cleanQ,
    `${cleanQ} ${subject || "academic"} principles definition`,
    `${cleanQ} peer reviewed study university documentation`,
    `${cleanQ} empirical consensus`
  ];

  globalCache.set(cacheKey, queries);
  return queries;
}

/**
 * Score authority and relevance for each source (0-100).
 * Relevance is prioritized first.
 */
export function scoreSource(source, questionWords) {
  if (source.provider === "mock" && typeof source.relevance === "number") {
    return { authority: source.authority || 90, relevance: source.relevance };
  }

  const domain = (source.domain || "").toLowerCase();
  const title = (source.title || "").toLowerCase();
  const snippet = (source.snippet || "").toLowerCase();

  let authority = 65;
  if (domain.endsWith(".gov") || domain.endsWith(".mil")) authority = 96;
  else if (domain.endsWith(".edu") || domain.endsWith(".ac.uk") || domain.includes("harvard") || domain.includes("mit.edu") || domain.includes("stanford")) authority = 94;
  else if (domain.includes("doi.org") || domain.includes("ncbi") || domain.includes("nature.com") || domain.includes("sciencedirect") || domain.includes("ieee.org") || domain.includes("acm.org") || domain.includes("arxiv.org")) authority = 95;
  else if (domain.includes("wikipedia.org")) authority = 82;
  else if (domain.includes("docs.python.org") || domain.includes("developer.mozilla.org") || domain.includes("w3.org") || domain.includes("nodejs.org")) authority = 92;
  else if (domain.includes("reddit.com") || domain.includes("quora.com") || domain.includes("medium.com")) authority = 40;

  // Calculate relevance based on question keywords appearing in title and snippet
  let matches = 0;
  for (const w of questionWords) {
    if (title.includes(w)) matches += 2; // Title matches weighted higher
    if (snippet.includes(w)) matches += 1;
  }

  const maxPossible = Math.max(1, questionWords.length * 3);
  const ratio = Math.min(1, matches / maxPossible);
  const relevance = Math.round(20 + (ratio * 80));

  return { authority, relevance };
}

/**
 * Parallel Search Orchestration with Relevance-First Ranking.
 * Skips search for math/code questions or when no search key is configured (unless definitional).
 */
export async function orchestrateSearch(queries, maxResults = 5, rawQuestion = "", questionType = "") {
  // Pure math and coding questions do not need web search
  if (questionType === "NUMERICAL" || questionType === "CODING" || questionType === "DEBUGGING") {
    return [];
  }

  const isConfigured = hasSearchApiKey();
  const isDefinitional = !rawQuestion || questionType === "CONCEPTUAL" || /^(what is|define|who is|explain the concept)/i.test(rawQuestion);

  // If no search API key and not a definitional question, skip search
  if (!isConfigured && !isDefinitional) {
    return [];
  }

  const cacheKey = globalCache.generateKey("search_results", queries.slice(0, 3));
  const cached = globalCache.get(cacheKey);
  if (cached) return cached;

  const queryPromises = queries.map(q => executeSingleQuery(q, { isDefinitional }));
  const allQueryResults = await Promise.all(queryPromises);
  const flattened = allQueryResults.flat();

  const stopWords = new Set(["what", "is", "the", "are", "which", "and", "or", "for", "with", "how", "why", "that", "this", "from"]);
  const questionText = rawQuestion || queries.join(" ");
  const questionWords = questionText.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

  const dedupedRaw = deduplicateSources(flattened, maxResults * 2);
  const scoredSources = [];

  for (const src of dedupedRaw) {
    const scores = scoreSource(src, questionWords);
    // Ignore completely irrelevant sources (unless mock or wikipedia)
    if (scores.relevance < 20 && !src.url.includes("wikipedia.org") && src.provider !== "mock") continue;

    scoredSources.push({
      title: src.title || "Academic Reference",
      url: src.url,
      domain: src.domain || extractDomain(src.url),
      snippet: (src.snippet || "").trim(),
      authority: scores.authority,
      relevance: scores.relevance
    });
  }

  // Priority 3: Rank sources by relevance to question first (70%), then authority (30%)
  scoredSources.sort((a, b) => {
    const scoreA = (a.relevance * 0.7) + (a.authority * 0.3);
    const scoreB = (b.relevance * 0.7) + (b.authority * 0.3);
    return scoreB - scoreA;
  });

  const finalResults = scoredSources.slice(0, maxResults);
  globalCache.set(cacheKey, finalResults);
  return finalResults;
}
