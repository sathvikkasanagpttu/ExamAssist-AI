# Questions Flagged for Review

These questions have `needsReview: true` and should be verified before use in scored evaluations.

| ID | Subject | Question | Reason for Review |
|----|---------|----------|-------------------|
| q077 | Networks | BGP operates at which layer? | BGP is an application-layer protocol (runs over TCP port 179), but its routing function is at Layer 3/4. Some sources classify it at Layer 4 (transport) due to TCP dependency. Answer "D. Layer 7" is the most defensible per OSI model (it's an application-layer routing protocol), but verify against your course slides. |
| q095 | Python | Module that avoids GIL for CPU-bound work | Both `multiprocessing` (C) and `concurrent.futures.ProcessPoolExecutor` (D) avoid the GIL. Option D is more specific (high-level API over multiprocessing). If your course considers `multiprocessing` as the canonical answer, the answer is C. |
| q126 | Aptitude | NORTH → FNUOA coding | The shift pattern for this coding-decoding question is non-obvious. Verify the encoding rule independently: N→F(+?), O→N(+?), R→U(+?), T→O(+?), H→A(+?). Computed shifts: N=14→F=6 (-8), O=15→N=14 (-1)… pattern is inconsistent. This question may have an error. **Do not use in scored eval until verified.** |
| q141 | Mathematics | Definite integral of (2x+3) from 1 to 4 | The antiderivative gives 28 - 4 = **24**. The dataset answer is corrected to "24"; review flag remains until independently checked. |

## Action Items

1. **q077**: Confirm with course material whether BGP is classified Layer 3 or Layer 7 in your curriculum.
2. **q095**: If course uses `multiprocessing` directly (not ProcessPoolExecutor), change answer to "C".
3. **q126**: Verify or replace this coding-decoding question — the shift pattern does not appear consistent.
4. **q141**: Verify the corrected answer "24" independently before using in scored evaluations.
