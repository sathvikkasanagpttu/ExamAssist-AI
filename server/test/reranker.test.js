import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tokenize,
  computeLexicalScore,
  computeDomainAuthority,
  extractClaimEvidence,
  detectSourceContradictions,
  rerankSources
} from "../pipeline/reranker.js";

test("Reranker: tokenize strips stop words and normalizes tokens", () => {
  const tokens = tokenize("What is the time complexity of Dijkstra's algorithm?");
  assert.ok(tokens.includes("time"));
  assert.ok(tokens.includes("complexity"));
  assert.ok(tokens.includes("dijkstra"));
  assert.ok(tokens.includes("algorithm"));
  assert.ok(!tokens.includes("what"));
  assert.ok(!tokens.includes("is"));
  assert.ok(!tokens.includes("the"));
  assert.ok(!tokens.includes("of"));
});

test("Reranker: domain authority ranks academic and institutional sources higher than forums", () => {
  const gov = computeDomainAuthority("https://www.nist.gov/publications/algo");
  const edu = computeDomainAuthority("https://ocw.mit.edu/courses/intro-algorithms");
  const arxiv = computeDomainAuthority("https://arxiv.org/abs/2104.12345");
  const mdn = computeDomainAuthority("https://developer.mozilla.org/en-US/docs/Web/API");
  const reddit = computeDomainAuthority("https://www.reddit.com/r/learnprogramming/comments");
  const quora = computeDomainAuthority("https://www.quora.com/What-is-dijkstra");

  assert.ok(gov >= 95);
  assert.ok(edu >= 92);
  assert.ok(arxiv >= 92);
  assert.ok(mdn >= 90);
  assert.ok(reddit <= 45);
  assert.ok(quora <= 45);
});

test("Reranker: extractClaimEvidence extracts relevant sentences with token matches", () => {
  const snippet = "Dijkstra algorithm calculates the shortest path in a weighted graph with non-negative edge weights. It uses a priority queue to achieve O((V + E) log V) time complexity. The sky is blue today.";
  const queryTokens = ["dijkstra", "shortest", "path", "complexity"];
  const claims = extractClaimEvidence(snippet, queryTokens);

  assert.ok(Array.isArray(claims));
  assert.ok(claims.length >= 1 && claims.length <= 2);
  assert.ok(claims[0].includes("shortest path") || claims[0].includes("complexity"));
  assert.ok(!claims[0].includes("sky is blue"));
});

test("Reranker: detectSourceContradictions identifies direct opposing claims", () => {
  const sources = [
    { title: "Binary Search Complexity", snippet: "Binary search is logarithmic time complexity with O(log n)." },
    { title: "Misconceptions on Searching", snippet: "Binary search is not logarithmic time complexity." }
  ];
  const check = detectSourceContradictions(sources);
  assert.equal(check.hasConflict, true);
  assert.equal(check.conflictingPairs.length, 1);
});

test("Reranker: RRF ranks high-relevance and authoritative sources above low-quality sources", () => {
  const question = "Explain how QuickSort works and its average time complexity";
  const sources = [
    {
      title: "Random Blog Thoughts",
      url: "https://myblog.medium.com/quicksort",
      domain: "medium.com",
      snippet: "I tried sorting some numbers yesterday and it was fast."
    },
    {
      title: "MIT OpenCourseWare - QuickSort Analysis",
      url: "https://ocw.mit.edu/courses/electrical-engineering-and-computer-science/quicksort",
      domain: "mit.edu",
      snippet: "QuickSort uses divide-and-conquer partitioning. The average case time complexity is O(n log n) with balanced pivots."
    },
    {
      title: "Reddit Thread on Python Sorting",
      url: "https://www.reddit.com/r/python/comments/quicksort_vs_timsort",
      domain: "reddit.com",
      snippet: "Python actually uses Timsort not Quicksort by default."
    }
  ];

  const result = rerankSources({ question, sources, maxResults: 3 });
  assert.ok(result.rankedSources.length === 3);
  assert.equal(result.rankedSources[0].domain, "mit.edu");
  assert.equal(result.rankedSources[0].authorityTier, "HIGH");
  assert.ok(result.rankedSources[0].claimEvidence.length >= 1);
  assert.ok(result.rankedSources[0].claimEvidence[0].includes("divide-and-conquer") || result.rankedSources[0].claimEvidence[0].includes("O(n log n)"));
});
