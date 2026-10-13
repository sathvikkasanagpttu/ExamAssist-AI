/**
 * ExamAssist AI — Phase 4: Official Language & Standard Library Documentation Corpus
 *
 * Covers:
 * 1. Python 3 Standard Library (docs.python.org)
 * 2. cppreference C & C++ Standard Library (en.cppreference.com)
 * 3. Java SE 17+ API Specification (docs.oracle.com/en/java/javase)
 * 4. MDN Web Docs — JavaScript (developer.mozilla.org)
 *
 * Indexed into the pgvector KB when Postgres is active, and searchable via
 * hybrid RRF + lexical BM25 scoring with a strict relevance threshold.
 * Every citation includes `doc` + `section`. Below threshold => returns [].
 */

export const OFFICIAL_DOCS_USER_ID = "00000000-0000-4000-8000-000000000001";

export const OFFICIAL_LANGUAGE_DOCS = [
  // --- Python Standard Library ---
  {
    id: "py-collections-deque",
    language: "python",
    doc: "Python 3.12 Standard Library (docs.python.org)",
    file: "python-stdlib-collections.md",
    url: "https://docs.python.org/3/library/collections.html#collections.deque",
    section: "collections.deque — Double-Ended Queue",
    keywords: ["deque", "popleft", "appendleft", "queue", "bfs", "sliding window", "o(1)", "collections"],
    text: "collections.deque([iterable[, maxlen]]) returns a new deque object initialized left-to-right. Deques support thread-safe, memory-efficient appends and pops from either side of the deque with approximately the same O(1) performance in either direction. Unlike list.pop(0) which is O(n) due to shifting elements, deque.popleft() and deque.appendleft() are strictly O(1)."
  },
  {
    id: "py-heapq",
    language: "python",
    doc: "Python 3.12 Standard Library (docs.python.org)",
    file: "python-stdlib-heapq.md",
    url: "https://docs.python.org/3/library/heapq.html",
    section: "heapq — Heap Queue Algorithm (Min-Heap)",
    keywords: ["heapq", "heappush", "heappop", "heapify", "nlargest", "nsmallest", "priority queue", "dijkstra", "min-heap"],
    text: "The heapq module implements a binary min-heap on top of a standard Python list where heap[0] is always the smallest element. heapq.heapify(x) transforms list x into a heap in-place in O(n) time. heapq.heappush(heap, item) and heapq.heappop(heap) operate in O(log n) time. For a max-heap, negate numeric keys or wrap custom objects."
  },
  {
    id: "py-bisect",
    language: "python",
    doc: "Python 3.12 Standard Library (docs.python.org)",
    file: "python-stdlib-bisect.md",
    url: "https://docs.python.org/3/library/bisect.html",
    section: "bisect — Array Bisection Algorithm (Binary Search)",
    keywords: ["bisect", "bisect_left", "bisect_right", "insort", "binary search", "sorted", "lower_bound", "upper_bound"],
    text: "bisect.bisect_left(a, x, lo=0, hi=len(a)) locates the insertion point for x in sorted sequence a to maintain sorted order in O(log n) comparisons. If x is already present, the insertion point is before (to the left of) any existing entries. bisect_right returns the insertion point after existing entries."
  },
  {
    id: "py-functools-cache",
    language: "python",
    doc: "Python 3.12 Standard Library (docs.python.org)",
    file: "python-stdlib-functools.md",
    url: "https://docs.python.org/3/library/functools.html#functools.lru_cache",
    section: "functools.lru_cache & functools.cache — Memoization",
    keywords: ["lru_cache", "cache", "functools", "memoization", "dynamic programming", "recursion", "dp"],
    text: "@functools.lru_cache(maxsize=128) and @functools.cache wrap a function with a memoizing callable that saves previous calls keyed by positional and keyword arguments. All arguments must be hashable. Useful for top-down dynamic programming to avoid exponential recomputation."
  },
  {
    id: "py-dict-set-complexity",
    language: "python",
    doc: "Python 3.12 Standard Library (docs.python.org)",
    file: "python-stdlib-datastructures.md",
    url: "https://docs.python.org/3/library/stdtypes.html#mapping-types-dict",
    section: "dict and set — Hash Table Lookup & Insertion Complexity",
    keywords: ["dict", "set", "hash table", "lookup", "counter", "defaultdict", "insertion order"],
    text: "Python dict and set are implemented as open-addressed hash tables. Average-case lookup (k in d), insertion (d[k] = v), and deletion take O(1) amortized time, with O(n) worst-case under hash collision attacks. Since Python 3.7, dictionaries preserve insertion order as a language guarantee."
  },

  // --- cppreference C / C++ Standard Library ---
  {
    id: "cpp-std-sort-bounds",
    language: "cpp",
    doc: "cppreference C++20 Standard Library (en.cppreference.com)",
    file: "cppreference-algorithm.md",
    url: "https://en.cppreference.com/w/cpp/algorithm/sort",
    section: "std::sort, std::lower_bound, std::upper_bound (<algorithm>)",
    keywords: ["std::sort", "lower_bound", "upper_bound", "binary_search", "introsort", "comparator", "o(n log n)", "algorithm"],
    text: "std::sort(first, last, comp) sorts elements in [first, last) in O(N log N) worst-case comparisons (since C++11, typically Introsort). The comparator must define a strict weak ordering (comp(a, a) must be false). std::lower_bound returns an iterator to the first element not less than value in O(log N) comparisons on random-access iterators."
  },
  {
    id: "cpp-containers-map-unordered",
    language: "cpp",
    doc: "cppreference C++20 Standard Library (en.cppreference.com)",
    file: "cppreference-containers.md",
    url: "https://en.cppreference.com/w/cpp/container/unordered_map",
    section: "std::unordered_map vs std::map (<unordered_map>, <map>)",
    keywords: ["unordered_map", "std::map", "unordered_set", "red-black tree", "hash table", "iterator"],
    text: "std::unordered_map is an associative container with average O(1) search, insertion, and removal backed by a hash table (worst-case O(N)). std::map is a sorted associative container typically implemented as a red-black tree with guaranteed O(log N) search, insertion, and removal, supporting ordered iteration and lower_bound."
  },
  {
    id: "cpp-priority-queue",
    language: "cpp",
    doc: "cppreference C++20 Standard Library (en.cppreference.com)",
    file: "cppreference-queue.md",
    url: "https://en.cppreference.com/w/cpp/container/priority_queue",
    section: "std::priority_queue (<queue>)",
    keywords: ["priority_queue", "std::greater", "max-heap", "min-heap", "dijkstra"],
    text: "std::priority_queue<T, Container, Compare> provides constant-time O(1) lookup of the largest element (by default, max-heap using std::less<T>) and O(log N) insertion (push) and extraction (pop). To create a min-heap, use std::priority_queue<T, std::vector<T>, std::greater<T>>."
  },
  {
    id: "c-stdlib-qsort-bsearch",
    language: "c",
    doc: "cppreference C11 Standard Library (en.cppreference.com)",
    file: "cppreference-c-stdlib.md",
    url: "https://en.cppreference.com/w/c/algorithm/qsort",
    section: "qsort and bsearch (<stdlib.h>)",
    keywords: ["qsort", "bsearch", "stdlib.h", "comparator", "malloc", "free"],
    text: "void qsort(void *ptr, size_t count, size_t size, int (*comp)(const void *, const void *)) sorts an array of count elements. Avoid returning (a - b) directly in the integer comparator when signed integer overflow is possible; instead use (a > b) - (a < b) to prevent undefined signed overflow."
  },

  // --- Java SE API Specification ---
  {
    id: "java-util-collections",
    language: "java",
    doc: "Java SE 17 API Specification (docs.oracle.com)",
    file: "java-se-collections.md",
    url: "https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/ArrayDeque.html",
    section: "java.util.ArrayDeque, PriorityQueue, and HashMap",
    keywords: ["arraydeque", "priorityqueue", "hashmap", "treemap", "linkedlist", "pollfirst", "addfirst"],
    text: "java.util.ArrayDeque is a resizable-array implementation of the Deque interface with amortized O(1) addFirst, addLast, pollFirst, and pollLast. It is faster than Stack when used as a stack and faster than LinkedList when used as a queue. java.util.PriorityQueue is an unbounded min-heap based on a priority heap with O(log n) offer/poll and O(1) peek."
  },
  {
    id: "java-arrays-sort",
    language: "java",
    doc: "Java SE 17 API Specification (docs.oracle.com)",
    file: "java-se-arrays.md",
    url: "https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/Arrays.html",
    section: "java.util.Arrays.sort & Collections.sort",
    keywords: ["arrays.sort", "collections.sort", "timsort", "dual-pivot quicksort", "binarysearch", "integer.compare"],
    text: "Arrays.sort(int[]) uses a Dual-Pivot Quicksort offering O(n log n) average performance on primitives. Arrays.sort(Object[]) and Collections.sort(List) use adaptive, stable TimSort requiring O(n log n) worst-case comparisons and O(n) comparisons on nearly sorted inputs. Use Integer.compare(a, b) in custom comparators to avoid subtraction overflow."
  },

  // --- MDN Web Docs (JavaScript) ---
  {
    id: "mdn-js-array-sort",
    language: "javascript",
    doc: "MDN Web Docs — JavaScript Standard Built-in Objects",
    file: "mdn-javascript-array.md",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort",
    section: "Array.prototype.sort() & Numeric Comparator Gotcha",
    keywords: ["array.prototype.sort", "lexicographical", "utf-16", "comparefn", "timsort"],
    text: "By default, Array.prototype.sort() converts elements to strings and sorts them in UTF-16 code unit order (e.g., [10, 2].sort() produces [10, 2]). To sort numbers numerically, always supply a compareFn: arr.sort((a, b) => a - b). Since ECMAScript 2019, Array.prototype.sort() is guaranteed to be stable."
  },
  {
    id: "mdn-js-map-set",
    language: "javascript",
    doc: "MDN Web Docs — JavaScript Standard Built-in Objects",
    file: "mdn-javascript-map-set.md",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map",
    section: "Map and Set — Sublinear Average Key Lookup",
    keywords: ["new map", "new set", "prototype pollution", "insertion order", "sublinear"],
    text: "Map and Set objects hold key-value pairs and unique values respectively, remembering the original insertion order of keys. Specification requires average access time to be sublinear O(1) on the number of elements. Unlike plain Objects, Map keys can be any value (including objects and primitives) and avoid prototype pollution."
  }
];

const DOCS_STOPWORDS = new Set([
  "in", "to", "of", "on", "by", "is", "as", "at", "or", "an", "be", "the", "and",
  "for", "with", "from", "how", "why", "what", "when", "does", "use", "using", "used"
]);

function tokenizeForDocsSearch(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9_+:#.-]+/g, " ")
    .split(/\s+/)
    .filter((tok) => tok.length >= 3 && !DOCS_STOPWORDS.has(tok));
}

/**
 * Searches the official language and library documentation corpus using
 * keyword + token overlap + language affinity scoring.
 * Strictly returns `[]` if no entry meets `minScore` (default 0.22).
 * Every returned item cites `doc` + `section`.
 */
export function searchOfficialLanguageDocs({
  question = "",
  language = "",
  minScore = Number(process.env.DOCS_RAG_MIN_SCORE || 0.22),
  maxResults = 4
} = {}) {
  const queryTokens = new Set(tokenizeForDocsSearch(question));
  if (queryTokens.size === 0) {
    return { matches: [], threshold: minScore };
  }

  const normLang = String(language || "").toLowerCase().trim();
  const scored = [];
  const lowerQ = ` ${String(question || "").toLowerCase()} `;

  for (const entry of OFFICIAL_LANGUAGE_DOCS) {
    const entryTokens = new Set([
      ...tokenizeForDocsSearch(entry.section),
      ...tokenizeForDocsSearch(entry.text),
      ...entry.keywords.flatMap((k) => tokenizeForDocsSearch(k))
    ]);

    let tokenHits = 0;
    for (const qt of queryTokens) {
      if (entryTokens.has(qt)) tokenHits++;
    }

    let keywordPhraseHits = 0;
    for (const kw of entry.keywords) {
      const kwLower = kw.toLowerCase();
      if (kwLower.includes(" ") || kwLower.includes(".") || kwLower.includes(":")) {
        if (lowerQ.includes(kwLower)) keywordPhraseHits++;
      } else if (queryTokens.has(kwLower)) {
        keywordPhraseHits++;
      }
    }

    if (tokenHits === 0 && keywordPhraseHits === 0) continue;

    const tokenRecall = tokenHits / Math.max(3, Math.min(queryTokens.size, 12));
    const kwBoost = Math.min(0.45, keywordPhraseHits * 0.16);
    const langBoost = normLang && entry.language === normLang ? 0.12 : 0;

    // Require genuine keyword or multi-token overlap before applying language boost
    const rawScore = tokenHits >= 2 || keywordPhraseHits >= 1
      ? Math.min(1, tokenRecall * 0.65 + kwBoost + langBoost)
      : tokenRecall * 0.3;

    const score = Math.round(rawScore * 1000) / 1000;
    if (score >= minScore) {
      scored.push({
        type: "course_notes",
        doc: entry.doc,
        title: `${entry.doc} — ${entry.section}`,
        file: entry.file,
        url: entry.url,
        page: null,
        section: entry.section,
        language: entry.language,
        authorityTier: "HIGH",
        relevanceTier: score >= 0.45 ? "HIGH" : "MEDIUM",
        snippet: `[${entry.doc} | Section: ${entry.section}] ${entry.text}`,
        retrievalScore: score
      });
    }
  }

  scored.sort((a, b) => b.retrievalScore - a.retrievalScore);
  return {
    matches: scored.slice(0, maxResults),
    threshold: minScore
  };
}
