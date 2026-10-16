/**
 * ExamAssist AI - Evidence Reranker & Claim Extractor
 * Feature C: Evidence-First RAG with Reciprocal Rank Fusion (RRF),
 * domain authority weighting, sentence-level claim extraction, and contradiction detection.
 */

const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but",
  "by", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from",
  "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself", "him",
  "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just", "me",
  "more", "most", "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once", "only",
  "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "she",
  "should", "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves",
  "then", "there", "these", "they", "this", "those", "through", "to", "too", "under", "until",
  "up", "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom",
  "why", "with", "would", "you", "your", "yours", "yourself", "yourselves"
]);

/**
 * Tokenize text into normalized significant keywords
 */
export function tokenize(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_+\-*/=]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

/**
 * Calculate lexical BM25-like saturation score for query tokens in snippet
 */
export function computeLexicalScore(queryTokens, text) {
  if (!queryTokens.length || !text) return 0;
  const lowerText = text.toLowerCase();
  const docTokens = tokenize(text);
  const docLen = Math.max(1, docTokens.length);
  const avgDocLen = 40; // baseline expected snippet length

  // BM25 parameters
  const k1 = 1.2;
  const b = 0.75;
  const lenNorm = 1 - b + b * (docLen / avgDocLen);

  let score = 0;
  const tokenFreq = {};
  for (const t of docTokens) {
    tokenFreq[t] = (tokenFreq[t] || 0) + 1;
  }

  for (const token of queryTokens) {
    const tf = tokenFreq[token] || 0;
    if (tf > 0) {
      // Saturation formula
      const termScore = (tf * (k1 + 1)) / (tf + k1 * lenNorm);
      score += termScore;
    }
  }

  // Exact phrase bonus
  const queryPhrase = queryTokens.join(" ");
  if (queryPhrase.length > 5 && lowerText.includes(queryPhrase)) {
    score += 2.5;
  }

  return score;
}

/**
 * Compute institutional domain authority score [0..100]
 */
export function computeDomainAuthority(url, domain = "") {
  let hostname = (domain || "").toLowerCase();
  if (!hostname && url) {
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      hostname = String(url).toLowerCase();
    }
  }
  const target = hostname || (url || "").toLowerCase();

  // Tier 1: Government, Academic & Standards (92-96)
  if (target.endsWith(".gov") || target.endsWith(".mil") || target.includes(".gov/") || target.includes(".mil/")) return 96;
  if (target.endsWith(".edu") || target.endsWith(".ac.uk") || target.includes("mit.edu") || target.includes("stanford.edu") || target.includes("harvard.edu") || target.includes("berkeley.edu")) return 95;
  if (target.includes("doi.org") || target.includes("arxiv.org") || target.includes("nature.com") || target.includes("ieee.org") || target.includes("acm.org") || target.includes("ncbi.nlm.nih.gov")) return 95;
  if (target.includes("w3.org") || target.includes("ietf.org") || target.includes("iso.org")) return 94;

  // Tier 2: Official Documentation & Primary Foundations (88-93)
  if (target.includes("docs.python.org") || target.includes("developer.mozilla.org") || target.includes("en.cppreference.com") || target.includes("docs.oracle.com") || target.includes("nodejs.org")) return 93;
  if (target.includes("khanacademy.org") || target.includes("geeksforgeeks.org") || target.includes("coursera.org")) return 86;
  if (target.includes("wikipedia.org") || target.includes("wikimedia.org")) return 82;

  // Tier 3: Course Notes & Verified Uploads (90)
  if (target === "course notes" || target.includes("course_notes")) return 90;

  // Tier 4: User-Generated Blogs & Unverified Forums (35-45)
  if (target.includes("reddit.com") || target.includes("quora.com") || target.includes("medium.com") || target.includes("substack.com") || target.includes("blogspot.com")) return 40;

  return 65; // Default neutral reference
}

/**
 * Extract 1-2 sentence claim-level evidence from document snippet
 */
export function extractClaimEvidence(snippet, queryTokens) {
  if (!snippet || typeof snippet !== "string") return [];
  const rawSentences = snippet
    .split(/(?<=[.?!])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);

  if (!rawSentences.length) {
    return [snippet.slice(0, 240)];
  }

  const scored = rawSentences.map((sentence) => {
    const sTokens = new Set(tokenize(sentence));
    let matches = 0;
    for (const t of queryTokens) {
      if (sTokens.has(t)) matches++;
    }
    return { sentence, score: matches };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((item) => item.sentence);
}

/**
 * Detect simple factual contradictions between top candidate sources
 */
export function detectSourceContradictions(sources) {
  if (!Array.isArray(sources) || sources.length < 2) {
    return { hasConflict: false, conflictingPairs: [] };
  }

  const conflictingPairs = [];
  const conflictMarkers = [
    { positive: /\b(is|are|always|proven|valid|accepted)\b/i, negative: /\b(is not|are not|never|disproven|invalid|rejected|false)\b/i },
    { positive: /\b(linear|o\(n\))\b/i, negative: /\b(logarithmic|o\(log n\)|constant|o\(1\))\b/i },
    { positive: /\b(true|correct)\b/i, negative: /\b(false|incorrect)\b/i }
  ];

  for (let i = 0; i < Math.min(4, sources.length); i++) {
    for (let j = i + 1; j < Math.min(4, sources.length); j++) {
      const textA = `${sources[i].title} ${sources[i].snippet}`.toLowerCase();
      const textB = `${sources[j].title} ${sources[j].snippet}`.toLowerCase();

      for (const marker of conflictMarkers) {
        if (
          (marker.positive.test(textA) && marker.negative.test(textB)) ||
          (marker.negative.test(textA) && marker.positive.test(textB))
        ) {
          conflictingPairs.push({
            sourceA: sources[i].title || sources[i].url,
            sourceB: sources[j].title || sources[j].url,
            reason: "Mismatched factual assertions detected between candidate sources"
          });
          break;
        }
      }
    }
  }

  return {
    hasConflict: conflictingPairs.length > 0,
    conflictingPairs
  };
}

/**
 * Reciprocal Rank Fusion (RRF) Reranker:
 * Merges Lexical Score, Semantic Overlap, and Domain Authority into a validated ranking.
 */
export function rerankSources({ question, sources = [], options = [], maxResults = 5 }) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return { rankedSources: [], contradictions: { hasConflict: false, conflictingPairs: [] } };
  }

  const cleanQuestion = String(question || "");
  const optionsText = options.map((opt) => (typeof opt === "string" ? opt : opt.text || "")).join(" ");
  const queryTokens = tokenize(`${cleanQuestion} ${optionsText}`);

  const enriched = sources.map((src, originalIndex) => {
    const textContent = `${src.title || ""} ${src.snippet || ""}`;
    const lexical = computeLexicalScore(queryTokens, textContent);
    const authority = computeDomainAuthority(src.url, src.domain);

    const docTokens = new Set(tokenize(textContent));
    const overlapCount = queryTokens.filter((t) => docTokens.has(t)).length;
    const semanticRatio = queryTokens.length > 0 ? overlapCount / queryTokens.length : 0.5;

    const claimEvidence = extractClaimEvidence(src.snippet || src.title, queryTokens);

    return {
      raw: src,
      originalIndex,
      lexicalScore: lexical,
      authorityScore: authority,
      semanticRatio,
      claimEvidence
    };
  });

  // Rank 1: Lexical
  const byLexical = [...enriched].sort((a, b) => b.lexicalScore - a.lexicalScore);
  const lexicalRanks = new Map(byLexical.map((item, idx) => [item.originalIndex, idx + 1]));

  // Rank 2: Semantic
  const bySemantic = [...enriched].sort((a, b) => b.semanticRatio - a.semanticRatio);
  const semanticRanks = new Map(bySemantic.map((item, idx) => [item.originalIndex, idx + 1]));

  // Rank 3: Authority
  const byAuthority = [...enriched].sort((a, b) => b.authorityScore - a.authorityScore);
  const authorityRanks = new Map(byAuthority.map((item, idx) => [item.originalIndex, idx + 1]));

  // RRF Constant k = 60
  const k = 60;
  const scored = enriched.map((item) => {
    const rLex = lexicalRanks.get(item.originalIndex) || 1;
    const rSem = semanticRanks.get(item.originalIndex) || 1;
    const rAuth = authorityRanks.get(item.originalIndex) || 1;

    // RRF Formula with weights: 0.45 Lexical + 0.35 Semantic + 0.20 Authority
    const rrfScore = (0.45 / (k + rLex)) + (0.35 / (k + rSem)) + (0.20 / (k + rAuth));
    const normalizedScore = Math.min(100, Math.round(rrfScore * 6000));

    const authorityTier = item.authorityScore >= 85 ? "HIGH" : item.authorityScore < 50 ? "LOW" : "MEDIUM";
    const relevanceTier = normalizedScore >= 70 ? "HIGH" : normalizedScore < 45 ? "LOW" : "MEDIUM";

    let quality = "MEDIUM";
    if (authorityTier === "HIGH" && relevanceTier === "HIGH") quality = "HIGH";
    else if (authorityTier === "LOW" || relevanceTier === "LOW") quality = "LOW";

    return {
      title: item.raw.title || "Academic Reference",
      url: item.raw.url,
      domain: item.raw.domain,
      file: item.raw.file,
      page: item.raw.page,
      section: item.raw.section,
      snippet: item.raw.snippet,
      type: item.raw.type || (item.raw.file ? "course_notes" : "web"),
      authorityTier,
      relevanceTier,
      quality,
      relevanceScore: normalizedScore,
      authorityScore: item.authorityScore,
      claimEvidence: item.claimEvidence,
      retrievalTimestamp: item.raw.retrievalTimestamp || new Date().toISOString(),
      _score: rrfScore
    };
  });

  scored.sort((a, b) => b._score - a._score);
  const topSources = scored.slice(0, maxResults).map(({ _score, ...rest }) => rest);
  const contradictions = detectSourceContradictions(topSources);

  return {
    rankedSources: topSources,
    contradictions
  };
}
