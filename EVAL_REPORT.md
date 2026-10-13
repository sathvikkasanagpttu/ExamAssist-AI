# ExamAssist AI — Comprehensive Evaluation & Ablation Report

See [`docs/EVAL_REPORT.md`](./docs/EVAL_REPORT.md) for the full report, or review the summary tables below.

## 1. Academic Assessment Ablation (`server/eval/dataset.jsonl`, 236 Questions)

| Config ID | Pipeline Description | Overall Accuracy (%) | UNVERIFIED Wrong-Answer Rate (%) | Delta vs `a_single_pass` |
|---|---|---:|---:|---:|
| `a_single_pass` | Single-pass solver + quality check | **91.53%** | **100.00%** | `0.00%` |
| `b_solve_evidence` | + Multi-source search & evidence verification | **91.53%** | **100.00%** | `0.00%` |
| `c_solve_tiebreak` | + Dual-pass disagreement detection & tie-breaker | **91.95%** | **100.00%** | `+0.42%` |
| `d_rag` | + Course Notes & Official Docs RAG (`pgvector`) | **91.53%** | **100.00%** | `0.00%` |
| `e_specialized` | + Deterministic mathjs / SymPy / SQL / code verifiers | **91.53%** | **100.00%** | `0.00%` |
| `f_agent` | + Bounded tool-calling agent (flag default OFF) | **91.53%** | **100.00%** | `0.00%` |

## 2. Coding Engine Ablation (`server/eval/code-dataset.jsonl`, 185 Scored Problems + 3 `needsReview`)

| Ablation Config | pass@1 (%) | Pass w/ Repair (%) | Hidden-Test Pass (%) | False-Pass Rate (%) | Compile Err (%) | Timeout (%) | Test Strength (Mutation %) | Complexity Agreement (%) | Hint Judge (1-5, Judge) | Latency p50 / p95 (ms) | Est. Cost ($) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `1_single_call` | 90.27% | 90.27% | 89.95% | 0.00% | 0.00% | 0.00% | N/A | 100.00% | 4.89/5 (Judge) | 4 / 9 | $0.1943 |
| `2_plus_tests` | 90.27% | 90.27% | 89.95% | 0.68% | 0.00% | 0.00% | 100.00% | 47.27% | 4.89/5 (Judge) | 3 / 8 | $0.1943 |
| `3_plus_repair` | 90.27% | **97.30%** | **97.35%** | **0.62%** | 0.00% | 0.00% | 100.00% | 51.52% | 4.89/5 (Judge) | 3 / 7 | $0.2034 |
| `4_plus_diff_property` | 90.27% | **97.30%** | **97.35%** | **0.62%** | 0.00% | 0.00% | 100.00% | 51.52% | 4.89/5 (Judge) | 3 / 7 | $0.2034 |
| `5_plus_agent` | 90.27% | **97.30%** | **97.35%** | **0.62%** | 0.00% | 0.00% | 100.00% | 51.52% | 4.89/5 (Judge) | 3 / 7 | $0.2034 |
| `6_plus_docs_rag` | 90.27% | **97.30%** | **97.35%** | **0.62%** | 0.00% | 0.00% | 100.00% | 51.52% | 4.89/5 (Judge) | 3 / 7 | $0.2034 |

## 3. Red-Team Containment Summary

All **7/7** red-team test cases (`rt-ambiguous-missing-program`, `rt-prompt-injection-statement`, `rt-malicious-fork-bomb`, `rt-malicious-infinite-loop`, `rt-malicious-memory-bomb`, `rt-malicious-network-egress`, `rt-malicious-filesystem-write`) **PASS**.
