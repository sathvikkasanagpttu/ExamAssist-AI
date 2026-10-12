# Evaluation Dataset Review (`REVIEW.md`)

See also [`server/eval/REVIEW.md`](server/eval/REVIEW.md).

## 1. Text & Academic Dataset (`server/eval/dataset.jsonl`)

There are no unresolved `needsReview` rows in the scored 236-question practice dataset (`dataset.jsonl`).

- `q077`: Specifies the unambiguous OSI classification of BGP.
- `q095`: Names `ProcessPoolExecutor`, removing ambiguity with lower-level process APIs.
- `q126`: Uses a consistent one-character shift rule.
- `q141`: Retains the independently checked definite integral result of `24`.

---

## 2. Coding Evaluation Dataset (`server/eval/code-dataset.jsonl`)

The coding benchmark contains **188 total problems**:
- **185 scored problems** (`needsReview: false`) spanning **Python, JavaScript, C, C++, Java, and SQL**, including **46 Advanced** problems across arrays, strings, dynamic programming, graphs/trees, SQL queries, output prediction, and code debugging, each with unseen `hiddenTests`.
- **3 uncertain / underspecified problems** marked `needsReview: true` and excluded from scored evaluation runs:

| Problem ID | Title | Language | Category | Reason Marked `needsReview: true` |
|---|---|---|---|---|
| `c186` | Ambiguous Tie-Breaking in K-Most Frequent Words | `python` | `strings` | Tie-breaking rule between lexicographical order and first-appearance order is underspecified in the prompt. |
| `c187` | Floating-Point Rounding Tolerance in Geometric Centroid | `cpp` | `arrays` | Output formatting precision (2 decimal places vs. 6 decimal places) and rounding mode are not specified. |
| `c188` | Dialect-Dependent SQL Division Truncation | `sql` | `sql` | Integer division (`total / items`) truncates in SQLite/PostgreSQL but produces float in MySQL unless `CAST` is explicitly mandated. |
