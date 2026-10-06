/**
 * ExamAssist AI - Multi-Provider Web Search & Deduplication
 * Supports Tavily, Serper, and Brave Search APIs with unified environment configuration.
 * Never fabricates or injects fake fallback sources.
 */

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    const tracking = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "fbclid", "gclid"];
    tracking.forEach(p => parsed.searchParams.delete(p));
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    let clean = parsed.toString();
    if (clean.endsWith("/") && parsed.pathname === "/") {
      clean = clean.slice(0, -1);
    }
    return clean;
  } catch {
    return String(url || "").trim().toLowerCase();
  }
}

function extractDomain(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "source";
  }
}

let mockSearchHandler = null;

export function setMockSearchHandler(fn) {
  mockSearchHandler = fn;
}

export function getMockSearchHandler() {
  return mockSearchHandler;
}

export function getActiveSearchProvider() {
  if (mockSearchHandler) return "mock";

  const tavily = process.env.TAVILY_API_KEY;
  if (tavily && tavily !== "replace_me" && tavily.trim()) return "tavily";

  const serper = process.env.SERPER_API_KEY;
  if (serper && serper !== "replace_me" && serper.trim()) return "serper";

  const brave = process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY;
  if (brave && brave !== "replace_me" && brave.trim()) return "brave";

  return "none";
}

export function hasSearchApiKey() {
  return getActiveSearchProvider() !== "none";
}

/**
 * Searches Wikipedia OpenSearch API (public, no key required, for definitions/concepts)
 */
export async function searchWikipedia(query) {
  try {
    const endpoint = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=3&namespace=0&format=json`;
    const res = await fetch(endpoint, {
      headers: { "User-Agent": "ExamAssist-AI/2.1 (Academic Study Copilot)" },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return [];
    const data = await res.json();
    const [, titles, snippets, urls] = data;
    const results = [];
    if (Array.isArray(titles)) {
      for (let i = 0; i < titles.length; i++) {
        if (urls[i] && titles[i]) {
          results.push({
            title: titles[i],
            url: urls[i],
            snippet: snippets[i] || `Overview of ${titles[i]} on Wikipedia.`,
            domain: "en.wikipedia.org",
            provider: "wikipedia"
          });
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Searches Tavily API
 */
async function searchTavily(query, apiKey) {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: false,
        max_results: 4
      }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      domain: extractDomain(r.url),
      provider: "tavily"
    }));
  } catch {
    return [];
  }
}

/**
 * Searches Serper (Google API)
 */
async function searchSerper(query, apiKey) {
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ q: query, num: 4 }),
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.organic || []).map(r => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
      domain: extractDomain(r.link),
      provider: "serper"
    }));
  } catch {
    return [];
  }
}

/**
 * Searches Brave Search API
 */
async function searchBrave(query, apiKey) {
  try {
    const endpoint = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=4`;
    const res = await fetch(endpoint, {
      headers: {
        "X-Subscription-Token": apiKey,
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.web?.results || []).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
      domain: extractDomain(r.url),
      provider: "brave"
    }));
  } catch {
    return [];
  }
}

/**
 * Deduplicates retrieved sources by canonical URL and title
 */
export function deduplicateSources(sourcesList, maxSources = 8) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  const deduplicated = [];

  for (const src of sourcesList) {
    if (!src || !src.url) continue;

    const normUrl = normalizeUrl(src.url);
    const normTitle = (src.title || "").toLowerCase().trim();

    if (seenUrls.has(normUrl)) continue;
    if (normTitle && seenTitles.has(normTitle)) continue;

    seenUrls.add(normUrl);
    if (normTitle) seenTitles.add(normTitle);

    deduplicated.push({
      title: src.title || "Academic Reference",
      url: normUrl,
      snippet: (src.snippet || "").trim(),
      domain: src.domain || extractDomain(src.url),
      provider: src.provider || "retriever",
      authority: src.authority,
      relevance: src.relevance
    });

    if (deduplicated.length >= maxSources) break;
  }

  return deduplicated;
}

/**
 * Executes a single search query against active configured provider
 */
export async function executeSingleQuery(queryObj, { isDefinitional = false } = {}) {
  const query = typeof queryObj === "string" ? queryObj : (queryObj.query || "");
  if (!query) return [];

  if (mockSearchHandler) {
    try {
      const mockResults = await mockSearchHandler(query);
      if (Array.isArray(mockResults)) return mockResults;
    } catch {}
  }

  const provider = getActiveSearchProvider();
  const searchPromises = [];

  if (provider === "tavily") {
    searchPromises.push(searchTavily(query, process.env.TAVILY_API_KEY));
  } else if (provider === "serper") {
    searchPromises.push(searchSerper(query, process.env.SERPER_API_KEY));
  } else if (provider === "brave") {
    const braveKey = process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY;
    searchPromises.push(searchBrave(query, braveKey));
  }

  // If definitional or no search key, Wikipedia provides foundational definitions
  if (isDefinitional || provider === "none") {
    searchPromises.push(searchWikipedia(query));
  }

  const results = await Promise.allSettled(searchPromises);
  const flattened = [];
  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      flattened.push(...r.value);
    }
  }
  return flattened;
}

/**
 * Coordinates parallel multi-angle searches and deduplication.
 * Returns empty array if no genuine sources are found (never fabricates fallbacks).
 */
export async function executeParallelSearches(queries, maxSources = 8, { isDefinitional = false } = {}) {
  const searchPromises = queries.map(q => executeSingleQuery(q, { isDefinitional }));
  const rawResultsPerQuery = await Promise.all(searchPromises);
  const allSources = rawResultsPerQuery.flat();

  return deduplicateSources(allSources, maxSources);
}
