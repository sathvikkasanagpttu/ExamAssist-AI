/**
 * ExamAI Pipeline - Step 2: Query Generator
 * Generates 3-6 multi-angle search queries based on Search Query Generation Prompt.
 */

import { SEARCH_QUERY_GENERATION_PROMPT } from "../prompts.js";
import { defaultAIClient } from "../aiClient.js";

export async function generateSearchQueries(analysis, aiClient = defaultAIClient) {
  const { rawQuestion, subject, keywords } = analysis;

  const prompt = SEARCH_QUERY_GENERATION_PROMPT.replace("{{QUESTION}}", rawQuestion);

  try {
    const result = await aiClient.generateJson({
      systemPrompt: "You are the search-query generation module for ExamAI.",
      userPrompt: prompt,
      fallbackData: null
    });

    if (result && Array.isArray(result.queries) && result.queries.length >= 3) {
      return result.queries
        .map(q => typeof q === "string" ? { type: "exact", query: q } : q)
        .filter(q => q && q.query && typeof q.query === "string");
    }
  } catch (err) {
    console.warn("[QueryGenerator] AI query generation error:", err.message);
  }

  // Deterministic multi-angle fallback generation
  const coreTerm = keywords.slice(0, 4).join(" ") || rawQuestion.slice(0, 60);
  const cleanQ = rawQuestion.replace(/^(What is|Why does|How do|Explain|Calculate|Find|Which of the following)\s+/i, "");

  const queries = [
    {
      type: "exact",
      query: cleanQ.slice(0, 100)
    },
    {
      type: "academic",
      query: `${coreTerm} ${subject} academic theory definition principles`
    },
    {
      type: "primary_source",
      query: `${coreTerm} official documentation university research peer-reviewed`
    },
    {
      type: "verification",
      query: `${coreTerm} empirical evidence verification established facts`
    },
    {
      type: "counter_evidence",
      query: `${coreTerm} common misconceptions alternative models limitations`
    }
  ];

  if (subject && subject !== "General Academic") {
    queries.push({
      type: "domain_specific",
      query: `${coreTerm} ${subject} standard textbook reference`
    });
  }

  return queries;
}
