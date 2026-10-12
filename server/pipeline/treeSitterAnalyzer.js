/**
 * ExamAssist AI - Tree-sitter WASM AST Analyzer (Phase 2)
 * Supports Python, Java, C, C++, JavaScript, and SQL:
 * - Language auto-detection
 * - Syntax error extraction with 1-indexed line & column
 * - Function definitions, loop nesting depth, and recursion detection from AST
 * - Undefined variable/name detection
 * - Static time & space complexity estimation with confidence level
 */

import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import Parser from "web-tree-sitter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WASM_DIR = path.resolve(__dirname, "..", "node_modules", "tree-sitter-wasms", "out");

const GRAMMAR_FILES = {
  python: "tree-sitter-python.wasm",
  javascript: "tree-sitter-javascript.wasm",
  java: "tree-sitter-java.wasm",
  c: "tree-sitter-c.wasm",
  cpp: "tree-sitter-cpp.wasm"
};

const LANGUAGE_BUILTINS = {
  python: new Set([
    "abs", "all", "any", "ascii", "bin", "bool", "breakpoint", "bytearray", "bytes",
    "callable", "chr", "classmethod", "compile", "complex", "delattr", "dict", "dir",
    "divmod", "enumerate", "eval", "exec", "filter", "float", "format", "frozenset",
    "getattr", "globals", "hasattr", "hash", "help", "hex", "id", "input", "int",
    "isinstance", "issubclass", "iter", "len", "list", "locals", "map", "max",
    "memoryview", "min", "next", "object", "oct", "open", "ord", "pow", "print",
    "property", "range", "repr", "reversed", "round", "set", "setattr", "slice",
    "sorted", "staticmethod", "str", "sum", "super", "tuple", "type", "vars", "zip",
    "True", "False", "None", "Exception", "ValueError", "TypeError", "KeyError",
    "IndexError", "RuntimeError", "StopIteration", "ZeroDivisionError", "self", "cls",
    "__name__", "__main__", "math", "sys", "os", "collections", "heapq", "bisect",
    "itertools", "functools", "re", " typing", "List", "Dict", "Set", "Tuple", "Optional",
    "deque", "defaultdict", "Counter", "lru_cache", "inf"
  ]),
  javascript: new Set([
    "Array", "Boolean", "BigInt", "Date", "Error", "TypeError", "RangeError", "Function",
    "JSON", "Map", "Math", "Number", "Object", "Promise", "Proxy", "Reflect", "RegExp",
    "Set", "String", "Symbol", "WeakMap", "WeakSet", "console", " clearInterval",
    "clearTimeout", "decodeURI", "decodeURIComponent", "encodeURI", "encodeURIComponent",
    "escape", "eval", "fetch", "globalThis", "Infinity", "isFinite", "isNaN", "NaN",
    "parseFloat", "parseInt", " process", "require", "module", "exports", "setInterval",
    "setTimeout", "undefined", "null", "true", "false", "this", "arguments", "fs"
  ]),
  java: new Set([
    "System", "String", "Integer", "Long", "Double", "Float", "Boolean", "Character",
    "Byte", "Short", "Math", "Object", "Class", "Thread", "Runnable", "Exception",
    "RuntimeException", "IllegalArgumentException", "IndexOutOfBoundsException",
    "NullPointerException", "StringBuilder", "StringBuffer", "Arrays", "Collections",
    "List", "ArrayList", "LinkedList", "Map", "HashMap", "TreeMap", "LinkedHashMap",
    "Set", "HashSet", "TreeSet", "Queue", "Deque", "ArrayDeque", "PriorityQueue",
    "Stack", "Scanner", "BufferedReader", "InputStreamReader", "Comparator", "Comparable",
    "Override", "true", "false", "null", "this", "super", "out", "in", "err", "println",
    "print", "printf", "length", "size", "get", "put", "add", "remove", "contains",
    "containsKey", "isEmpty", "poll", "offer", "peek", "push", "pop", "sort", "max",
    "min", "abs", "valueOf", "parseInt", "parseLong", "toCharArray", "charAt", "substring"
  ]),
  c: new Set([
    "printf", "scanf", "fprintf", "fscanf", "sprintf", "snprintf", "sscanf", "fgets",
    "fputs", "getchar", "putchar", "puts", "malloc", "calloc", "realloc", "free",
    "memcpy", "memmove", "memset", "memcmp", "strlen", "strcpy", "strncpy", "strcat",
    "strncat", "strcmp", "strncmp", "strchr", "strstr", "strtok", "atoi", "atol",
    "atof", "strtol", "strtoul", "qsort", "bsearch", "abs", "labs", "llabs", "fabs",
    "sqrt", "pow", "sin", "cos", "tan", "log", "exp", "floor", "ceil", "exit", "abort",
    "assert", "sizeof", "NULL", "stdin", "stdout", "stderr", "EOF", "INT_MAX", "INT_MIN",
    "LONG_MAX", "LONG_MIN", "size_t", "bool", "true", "false", "uint64_t", "int64_t"
  ]),
  cpp: new Set([
    "std", "cin", "cout", "cerr", "endl", "string", "vector", "map", "unordered_map",
    "set", "unordered_set", "multiset", "queue", "priority_queue", "deque", "stack",
    "pair", "tuple", "list", "array", "bitset", "sort", "stable_sort", "lower_bound",
    "upper_bound", "binary_search", "reverse", "max", "min", "swap", "accumulate",
    "fill", "find", "count", "unique", "next_permutation", "make_pair", "make_tuple",
    "move", "forward", "size_t", "nullptr", "NULL", "true", "false", "this", "INT_MAX",
    "INT_MIN", "LLONG_MAX", "LLONG_MIN", "printf", "scanf", "malloc", "free", "abs",
    "sqrt", "pow", "log", "sin", "cos", "push_back", "emplace_back", "pop_back",
    "begin", "end", "rbegin", "rend", "size", "empty", "clear", "insert", "erase",
    "find", "first", "second", "top", "front", "back", "push", "pop", "substr", "length"
  ])
};

let initPromise = null;
let treeSitterReady = false;
const loadedLanguages = new Map();
const parserPool = new Map();

export async function initTreeSitter() {
  if (treeSitterReady) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await Parser.init();
      for (const [lang, file] of Object.entries(GRAMMAR_FILES)) {
        const wasmPath = path.join(WASM_DIR, file);
        if (existsSync(wasmPath)) {
          const loaded = await Parser.Language.load(wasmPath);
          loadedLanguages.set(lang, loaded);
          const parser = new Parser();
          parser.setLanguage(loaded);
          parserPool.set(lang, parser);
        }
      }
      treeSitterReady = loadedLanguages.size > 0;
      return treeSitterReady;
    } catch {
      treeSitterReady = false;
      return false;
    }
  })();

  return initPromise;
}

// Trigger eager background initialization
void initTreeSitter();

export function normalizeLanguageName(lang = "python") {
  const s = String(lang || "python").toLowerCase().trim();
  if (s === "py" || s === "python3" || s.includes("python")) return "python";
  if (s === "js" || s === "node" || s === "ts" || s === "typescript" || s.includes("javascript")) return "javascript";
  if (s === "c++" || s === "cpp" || s === "g++" || s === "cc" || s === "cxx") return "cpp";
  if (s === "c" || s === "gcc") return "c";
  if (s.includes("java")) return "java";
  if (s.includes("sql") || s.includes("sqlite") || s.includes("postgres") || s.includes("mysql")) return "sql";
  return "python";
}

/**
 * Automatically detects the programming language from code content and optional hint.
 */
export function detectCodeLanguage(code = "", hintLanguage = "") {
  const src = String(code || "").trim();
  if (!src) return normalizeLanguageName(hintLanguage || "python");

  if (/^\s*(?:SELECT|WITH|INSERT\s+INTO|UPDATE\s+\w+\s+SET|CREATE\s+TABLE|ALTER\s+TABLE)\b/i.test(src)) {
    return "sql";
  }
  if (/^\s*#include\s*<(?:iostream|vector|algorithm|unordered_map|bits\/stdc\+\+\.h|string|queue|stack|map|set)>/m.test(src) ||
      /\bstd::|using\s+namespace\s+std\b/.test(src)) {
    return "cpp";
  }
  if (/^\s*#include\s*<(?:stdio\.h|stdlib\.h|string\.h|stdbool\.h|limits\.h|stdint\.h)>/m.test(src)) {
    return "c";
  }
  if (/\b(?:public|private|protected)?\s*class\s+[A-Za-z_]\w*|\bSystem\.out\.print|\bpublic\s+static\s+void\s+main\b/.test(src)) {
    return "java";
  }
  if (/\b(?:function\s+[A-Za-z_]\w*\s*\(|const\s+[A-Za-z_]\w*\s*=|let\s+[A-Za-z_]\w*\s*=|console\.log\s*\(|=>)/.test(src)) {
    return "javascript";
  }
  if (/^\s*(?:def\s+[A-Za-z_]\w*\s*\(|import\s+\w+|from\s+\w+\s+import\b|if\s+__name__\s*==)/m.test(src)) {
    return "python";
  }

  return normalizeLanguageName(hintLanguage || "python");
}

const LOOP_NODE_TYPES = new Set([
  "for_statement",
  "while_statement",
  "do_statement",
  "for_in_statement",
  "enhanced_for_statement",
  "for_range_loop",
  "list_comprehension",
  "set_comprehension",
  "dictionary_comprehension"
]);

const FUNCTION_NODE_TYPES = new Set([
  "function_definition",
  "function_declaration",
  "method_declaration",
  "function_expression",
  "arrow_function"
]);

const CALL_NODE_TYPES = new Set([
  "call",
  "call_expression",
  "method_invocation"
]);

function extractFunctionNameFromNode(node) {
  const nameField = node.childForFieldName?.("name") || node.childForFieldName?.("declarator");
  if (nameField) {
    if (nameField.type === "identifier" || nameField.type === "field_identifier") {
      return nameField.text;
    }
    const nestedId = nameField.descendantsOfType?.(["identifier", "field_identifier"])?.[0];
    if (nestedId) return nestedId.text;
  }
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child && (child.type === "identifier" || child.type === "field_identifier")) {
      return child.text;
    }
  }
  return null;
}

function extractCalledFunctionName(callNode) {
  const fnNode =
    callNode.childForFieldName?.("function") ||
    callNode.childForFieldName?.("name") ||
    callNode.namedChild?.(0);
  if (!fnNode) return null;
  if (fnNode.type === "identifier" || fnNode.type === "field_identifier") {
    return fnNode.text;
  }
  if (fnNode.type === "attribute" || fnNode.type === "member_expression" || fnNode.type === "field_expression") {
    const parts = fnNode.text.split(".");
    return parts[parts.length - 1] || fnNode.text;
  }
  return fnNode.text;
}

function analyzeSqlAst(src) {
  const lines = src.split(/\r?\n/);
  const syntaxErrors = [];
  const warnings = [];
  const trimmed = src.trim();

  // Check balanced parentheses and quotes
  let parenDepth = 0;
  let inSingleQuote = false;
  let singleQuoteLine = 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === "'" && line[j - 1] !== "\\") {
        if (!inSingleQuote) singleQuoteLine = i + 1;
        inSingleQuote = !inSingleQuote;
      } else if (!inSingleQuote) {
        if (ch === "(") parenDepth++;
        else if (ch === ")") {
          parenDepth--;
          if (parenDepth < 0) {
            syntaxErrors.push({
              line: i + 1,
              column: j + 1,
              message: "Unexpected closing parenthesis ')' in SQL query"
            });
            parenDepth = 0;
          }
        }
      }
    }
  }

  if (inSingleQuote) {
    syntaxErrors.push({
      line: singleQuoteLine,
      column: 1,
      message: "Unterminated string literal in SQL query"
    });
  }
  if (parenDepth > 0) {
    syntaxErrors.push({
      line: lines.length,
      column: 1,
      message: `Unclosed parenthesis in SQL query (${parenDepth} unclosed)`
    });
  }

  if (/\bSELECT\s+FROM\b/i.test(trimmed)) {
    const matchLine = lines.findIndex((l) => /\bSELECT\s+FROM\b/i.test(l));
    syntaxErrors.push({
      line: matchLine >= 0 ? matchLine + 1 : 1,
      column: 1,
      message: "Missing projection list between SELECT and FROM"
    });
  }
  if (/\b(?:WHERE|JOIN|ON|GROUP\s+BY|ORDER\s+BY|HAVING)\s*;?\s*$/i.test(trimmed)) {
    syntaxErrors.push({
      line: lines.length,
      column: 1,
      message: "Incomplete SQL clause at end of query"
    });
  }

  const hasSubquery = /\(\s*SELECT\b/i.test(src);
  const hasRecursiveCte = /\bWITH\s+RECURSIVE\b/i.test(src);
  const joinCount = (src.match(/\bJOIN\b/gi) || []).length;
  const hasOrderOrGroup = /\b(?:GROUP\s+BY|ORDER\s+BY|DISTINCT|PARTITION\s+BY)\b/i.test(src);

  let staticTimeComplexity = "O(n)";
  if (hasRecursiveCte) staticTimeComplexity = "O(n * d) (recursive CTE)";
  else if (joinCount >= 2 || (hasSubquery && joinCount >= 1)) staticTimeComplexity = "O(n log n) to O(n^2) (multi-join / subquery)";
  else if (hasOrderOrGroup || joinCount === 1) staticTimeComplexity = "O(n log n)";

  if (syntaxErrors.length > 0) {
    warnings.push(...syntaxErrors.map((e) => `Line ${e.line}:${e.column} - ${e.message}`));
  }

  return {
    language: "sql",
    detectedLanguage: "sql",
    astEngine: "sql-ast-parser",
    lineCount: lines.length,
    maxLoopDepth: hasSubquery ? 2 : 1,
    hasRecursion: hasRecursiveCte,
    hasSorting: /\bORDER\s+BY\b/i.test(src),
    hasHashStructure: /\b(?:GROUP\s+BY|DISTINCT|HASH)\b/i.test(src),
    functions: [],
    syntaxErrors,
    undefinedNames: [],
    staticTimeComplexity,
    staticSpaceComplexity: hasOrderOrGroup || joinCount > 0 ? "O(n)" : "O(1)",
    complexityConfidence: "MEDIUM",
    complexitySource: "static_ast_analysis",
    method: "static_ast_analysis",
    warnings
  };
}

/**
 * Walks a Tree-sitter CST rootNode to extract syntax errors, functions, loop depth,
 * recursion, undefined identifiers, and static complexity hints.
 */
function analyzeTreeSitterCst(rootNode, src, normLang, detectedLang) {
  const lines = src.split(/\r?\n/);
  const syntaxErrors = [];
  const functions = [];
  const declaredNames = new Set(LANGUAGE_BUILTINS[normLang] || []);
  const referencedIdentifiers = [];

  let maxLoopDepth = 0;
  let hasSorting = false;
  let hasHashStructure = false;
  let hasRecursion = false;
  let hasBinarySearchPattern = false;

  if (/\b(?:mid\s*=|low\s*<=\s*high|left\s*<=\s*right|l\s*<=\s*r|bisect)\b/.test(src) && /(?:>>\s*1|\/\s*2|\/\/\s*2)/.test(src)) {
    hasBinarySearchPattern = true;
  }

  function walk(node, loopDepth = 0, enclosingFn = null) {
    if (!node) return;

    // 1. Syntax Errors
    if (node.type === "ERROR" || node.isMissing?.()) {
      const start = node.startPosition || { row: 0, column: 0 };
      const end = node.endPosition || start;
      const lineNum = start.row + 1;
      const colNum = start.column + 1;
      const snippet = (lines[start.row] || "").trim().slice(0, 80);
      syntaxErrors.push({
        line: lineNum,
        column: colNum,
        endLine: end.row + 1,
        endColumn: end.column + 1,
        message: node.isMissing?.()
          ? `Missing expected syntax token (${node.type})`
          : `Syntax error near '${ (node.text || snippet).slice(0, 32).replace(/\s+/g, " ") }'`,
        snippet
      });
    }

    // 2. Loop Nesting Depth
    const isLoop = LOOP_NODE_TYPES.has(node.type);
    const nextLoopDepth = isLoop ? loopDepth + 1 : loopDepth;
    if (nextLoopDepth > maxLoopDepth) {
      maxLoopDepth = nextLoopDepth;
    }

    // 3. Function Definitions
    let currentFn = enclosingFn;
    if (FUNCTION_NODE_TYPES.has(node.type)) {
      const fnName = extractFunctionNameFromNode(node);
      if (fnName) {
        declaredNames.add(fnName);
        const fnRecord = {
          name: fnName,
          startLine: (node.startPosition?.row ?? 0) + 1,
          endLine: (node.endPosition?.row ?? 0) + 1,
          isRecursive: false
        };
        functions.push(fnRecord);
        currentFn = fnRecord;
      }
    }

    // 4. Collect Declarations (variables, parameters, classes, imports)
    if (
      node.type === "assignment" ||
      node.type === "augmented_assignment" ||
      node.type === "variable_declarator" ||
      node.type === "init_declarator" ||
      node.type === "parameter_declaration" ||
      node.type === "formal_parameter" ||
      node.type === "typed_parameter" ||
      node.type === "default_parameter" ||
      node.type === "class_definition" ||
      node.type === "class_declaration" ||
      node.type === "import_statement" ||
      node.type === "import_from_statement" ||
      node.type === "for_statement" ||
      node.type === "for_in_statement" ||
      node.type === "enhanced_for_statement" ||
      node.type === "for_range_loop" ||
      node.type === "except_clause" ||
      node.type === "with_item"
    ) {
      const leftNode =
        node.childForFieldName?.("left") ||
        node.childForFieldName?.("name") ||
        node.childForFieldName?.("declarator") ||
        node.childForFieldName?.("pattern") ||
        node.namedChild?.(0);
      if (leftNode) {
        if (leftNode.type === "identifier") {
          declaredNames.add(leftNode.text);
        } else if (leftNode.descendantsOfType) {
          for (const idNode of leftNode.descendantsOfType("identifier")) {
            declaredNames.add(idNode.text);
          }
        }
      }
      if (node.type === "import_statement" || node.type === "import_from_statement") {
        for (const idNode of node.descendantsOfType?.(["identifier", "dotted_name"]) || []) {
          for (const part of idNode.text.split(".")) {
            declaredNames.add(part.trim());
          }
        }
      }
    }

    if (node.type === "parameters" || node.type === "formal_parameters" || node.type === "parameter_list") {
      for (const idNode of node.descendantsOfType?.("identifier") || []) {
        declaredNames.add(idNode.text);
      }
    }

    // 5. Function Calls (Recursion, Sorting, Hash Structures)
    if (CALL_NODE_TYPES.has(node.type)) {
      const callee = extractCalledFunctionName(node);
      if (callee) {
        if (currentFn && callee === currentFn.name) {
          currentFn.isRecursive = true;
          hasRecursion = true;
        }
        if (/^(?:sort|sorted|qsort|stable_sort|heappush|heappop)$/.test(callee)) {
          hasSorting = true;
        }
        if (/^(?:dict|set|Map|Set|HashMap|HashSet|unordered_map|unordered_set|defaultdict|Counter)$/.test(callee)) {
          hasHashStructure = true;
        }
      }
    }

    // 6. Track identifier references in expressions (for undefined name detection in Python/JS)
    if (node.type === "identifier" && (normLang === "python" || normLang === "javascript")) {
      const parent = node.parent;
      const parentType = parent?.type || "";
      const isPropertyAccess =
        (parentType === "attribute" || parentType === "member_expression") &&
        parent?.childForFieldName?.(" object") !== node &&
        parent?.namedChild?.(0) !== node;
      const isDeclarationSite =
        parentType.includes("parameter") ||
        parentType.includes("import") ||
        parentType === "function_definition" ||
        parentType === "function_declaration" ||
        parentType === "class_definition" ||
        parentType === "class_declaration" ||
        parentType === "keyword_argument" ||
        parentType === "pair";

      if (!isPropertyAccess && !isDeclarationSite) {
        referencedIdentifiers.push({
          name: node.text,
          line: (node.startPosition?.row ?? 0) + 1,
          column: (node.startPosition?.column ?? 0) + 1
        });
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      walk(node.child(i), nextLoopDepth, currentFn);
    }
  }

  walk(rootNode, 0, null);

  if (/\b(?:\.sort\(|sorted\(|Arrays\.sort|Collections\.sort|std::sort|qsort)\b/.test(src)) {
    hasSorting = true;
  }
  if (/\b(?:dict\(|set\(|Map\(|Set\(|HashMap|HashSet|unordered_map|unordered_set|\{\})\b/.test(src)) {
    hasHashStructure = true;
  }

  const undefinedNames = [];
  const seenUndefined = new Set();
  for (const ref of referencedIdentifiers) {
    if (!declaredNames.has(ref.name) && !seenUndefined.has(ref.name)) {
      seenUndefined.add(ref.name);
      undefinedNames.push(ref);
    }
  }

  // Static complexity estimation from AST structure
  let staticTimeComplexity = "O(1)";
  let complexityConfidence = "HIGH";

  if (hasRecursion && maxLoopDepth >= 1) {
    staticTimeComplexity = "O(n * 2^n) or O(n log n)";
    complexityConfidence = "MEDIUM";
  } else if (hasRecursion) {
    // Check if divide-and-conquer / memoized vs branching recursion
    const hasMemo = /\b(?:memo|dp|cache|lru_cache|@cache)\b/.test(src);
    const selfCallsInFn = functions
      .filter((f) => f.isRecursive)
      .reduce((acc, f) => {
        const re = new RegExp(`\\b${f.name}\\s*\\(`, "g");
        return Math.max(acc, (src.match(re) || []).length - 1);
      }, 1);
    if (hasMemo) {
      staticTimeComplexity = "O(n)";
      complexityConfidence = "MEDIUM";
    } else if (selfCallsInFn >= 2) {
      staticTimeComplexity = /(?:\/\s*2|\/\/\s*2|>>\s*1|mid)/.test(src) ? "O(n log n)" : "O(2^n)";
      complexityConfidence = "MEDIUM";
    } else {
      staticTimeComplexity = "O(n)";
      complexityConfidence = "MEDIUM";
    }
  } else if (maxLoopDepth >= 3) {
    staticTimeComplexity = `O(n^${maxLoopDepth})`;
  } else if (maxLoopDepth === 2) {
    staticTimeComplexity = "O(n^2)";
  } else if (hasSorting && maxLoopDepth <= 1) {
    staticTimeComplexity = "O(n log n)";
  } else if (hasBinarySearchPattern && maxLoopDepth === 1) {
    staticTimeComplexity = "O(log n)";
  } else if (maxLoopDepth === 1) {
    staticTimeComplexity = "O(n)";
  }

  const staticSpaceComplexity = hasHashStructure || hasRecursion || /\bnew\s+\w+\[|\[.*for\b/.test(src) ? "O(n)" : "O(1)";

  const warnings = [
    ...syntaxErrors.map((e) => `Line ${e.line}:${e.column} - ${e.message}`),
    ...undefinedNames.map((u) => `Potentially undefined identifier '${u.name}' at line ${u.line}:${u.column}`)
  ];

  return {
    language: normLang,
    detectedLanguage: detectedLang,
    astEngine: "web-tree-sitter-wasm",
    lineCount: lines.length,
    maxLoopDepth,
    hasRecursion,
    hasSorting,
    hasHashStructure,
    functions,
    syntaxErrors,
    undefinedNames,
    staticTimeComplexity,
    staticSpaceComplexity,
    complexityConfidence,
    complexitySource: "static_ast_analysis",
    method: "static_ast_analysis",
    warnings
  };
}

/**
 * Synchronous AST analysis (uses loaded web-tree-sitter WASM parser when initialized,
 * or heuristic fallback if called before WASM init completes).
 */
export function analyzeCodeAstSync(code = "", language = "python") {
  const src = String(code || "");
  const detectedLang = detectCodeLanguage(src, language);
  const normLang = normalizeLanguageName(language || detectedLang);

  if (normLang === "sql" || detectedLang === "sql") {
    return analyzeSqlAst(src);
  }

  const parser = parserPool.get(normLang) || parserPool.get(detectedLang);
  if (parser) {
    const tree = parser.parse(src);
    if (tree && tree.rootNode) {
      return analyzeTreeSitterCst(tree.rootNode, src, normLang, detectedLang);
    }
  }

  // Fallback before async WASM load finishes
  const lines = src.split(/\r?\n/);
  let maxLoopDepth = 0;
  let currentLoopDepth = 0;
  let hasRecursion = false;
  const fnNames = [];
  for (const line of lines) {
    const pyDef = line.match(/^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    const jsFn = line.match(/\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    const cFn = line.match(/\b(?:int|void|long|double|bool|string)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    const fn = pyDef?.[1] || jsFn?.[1] || cFn?.[1];
    if (fn && fn !== "main") fnNames.push(fn);
  }
  for (const fn of fnNames) {
    const matches = [...src.matchAll(new RegExp(`\\b${fn}\\s*\\(`, "g"))];
    if (matches.length >= 2) hasRecursion = true;
  }

  if (normLang === "python") {
    const loopIndents = [];
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const indent = rawLine.match(/^\s*/)?.[0]?.length || 0;
      while (loopIndents.length > 0 && indent <= loopIndents[loopIndents.length - 1]) {
        loopIndents.pop();
      }
      if (/^(?:for|while)\b/.test(trimmed)) {
        loopIndents.push(indent);
        if (loopIndents.length > maxLoopDepth) maxLoopDepth = loopIndents.length;
      }
    }
  } else {
    for (const line of lines) {
      const t = line.trim();
      if (/^(?:for|while)\b/.test(t)) {
        currentLoopDepth++;
        if (currentLoopDepth > maxLoopDepth) maxLoopDepth = currentLoopDepth;
      }
      if (t.includes("}") && currentLoopDepth > 0) currentLoopDepth--;
    }
  }
  const hasSorting = /\b(?:\.sort\(|sorted\(|Arrays\.sort|Collections\.sort|std::sort)\b/.test(src);
  const hasHashStructure = /\b(?:dict\(|set\(|Map\(|Set\(|HashMap|HashSet|unordered_map|unordered_set|\{\})\b/.test(src);
  const staticTimeComplexity =
    hasRecursion && maxLoopDepth >= 1
      ? "O(n * 2^n) or O(n log n)"
      : hasRecursion
      ? "O(2^n)"
      : maxLoopDepth >= 2
      ? `O(n^${maxLoopDepth})`
      : hasSorting
      ? "O(n log n)"
      : maxLoopDepth === 1
      ? "O(n)"
      : "O(1)";

  return {
    language: normLang,
    detectedLanguage: detectedLang,
    astEngine: "heuristic-fallback",
    lineCount: lines.length,
    maxLoopDepth,
    hasRecursion,
    hasSorting,
    hasHashStructure,
    functions: fnNames.map((name) => ({ name, startLine: 1, endLine: lines.length, isRecursive: hasRecursion })),
    syntaxErrors: [],
    undefinedNames: [],
    staticTimeComplexity,
    staticSpaceComplexity: hasHashStructure || hasRecursion ? "O(n)" : "O(1)",
    complexityConfidence: "MEDIUM",
    complexitySource: "static_ast_analysis",
    method: "static_ast_analysis",
    warnings: []
  };
}

/**
 * Ensures web-tree-sitter WASM grammars are initialized and performs full AST analysis.
 */
export async function analyzeAstWithTreeSitter(code = "", language = "python") {
  await initTreeSitter();
  return analyzeCodeAstSync(code, language);
}
