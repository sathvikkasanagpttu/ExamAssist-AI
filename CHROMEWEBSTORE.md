# Chrome Web Store Listing — ExamAI Study Assistant

*Last Updated: 2026-10-06*

---

## 1. Store Metadata

- **Extension Name**: ExamAI Practice & Study Assistant
- **Summary / Short Description** (≤ 132 characters):
  An evidence-first practice study assistant that researches academic questions, verifies claims against sources, and cites evidence.
- **Category**: Education / Productivity
- **Language**: English
- **Pricing**: Free

---

## 2. Detailed Description

ExamAI is an evidence-first academic study assistant designed for practice tests, review problem sets, and authorized AI-assisted assessments. 

Rather than generating plausible-sounding guesses without evidence, ExamAI conducts multi-angle research, evaluates source authority, verifies individual factual claims, and presents the best-supported answer with transparent citations directly on your study page.

### Key Capabilities

1. **Smart Question & Option Capture**:
   - Highlight any practice question on Canvas, Blackboard, Moodle, Google Forms, or practice testing sites.
   - Intelligently captures question text and available multiple-choice options.

2. **Multi-Angle Research Retrieval**:
   - Automatically generates targeted search queries across academic terminology, official documentation, peer-reviewed publications, and verification angles.
   - Searches authoritative reference databases and institutional sources.

3. **Rigorous Source Evaluation**:
   - Rates each source for authority, relevance, and evidence strength (0–100 scale).
   - Prioritizes university archives, government resources, and peer-reviewed journals over low-quality or unsourced content.

4. **Claim-by-Claim Verification Audit**:
   - Tests every assertion in the answer against retrieved sources, classifying claims as directly supported, inferred, or contradicted.
   - Flags conflicting findings when credible sources disagree instead of forcing an artificial consensus.

5. **Exam-Ready Explanation & Distractor Elimination**:
   - Provides the shortest direct answer and explains why the correct option is best-supported.
   - Details why alternative options are less suitable or incorrect.
   - Shows key supporting points and step-by-step reasoning.

6. **Interactive On-Page Practice Panel**:
   - Floating, draggable panel that can be repositioned anywhere on the screen so it never covers test questions.
   - Minimizable into a discreet status pill during timed practice sessions.

---

## 3. Permissions Justification

| Permission | Why It Is Needed |
| :--- | :--- |
| `storage` | Saves user preferences locally, including backend server address and UI trigger settings. |
| `activeTab` | Allows the extension to interact with the current practice assessment page when triggered by the user. |
| `scripting` | Enables dynamic interaction between extension components and the active practice assessment tab. |
| `contextMenus` | Adds a right-click "Research Question with ExamAI" option to selected text for seamless one-click research. |
| `host_permissions` (`http://localhost:*/*`, `http://127.0.0.1:*/*`) | Connects to the local evidence-first reasoning server that runs research queries and LLM verification without exposing API keys in the browser. |

---

## 4. Privacy & Data Use Disclosure

- **Data Collected**: None transmitted to external third parties by the extension frontend.
- **Account Requirements**: None required for extension operation.
- **Network Traffic**: Queries are sent solely to the user-configured local backend server (`http://localhost:8787`).
- **Data Retention**: No personal browsing history or student identity data is stored or tracked.

---

## 5. Version History

- **v1.1.0** (Current Release):
  - Added smart DOM option detection for online practice assessments.
  - Added floating selection trigger button (`⚡ Research with ExamAI`).
  - Added draggable on-page assessment panel with minimization.
  - Added right-click context menu research trigger.
  - Added connection health indicator in popup.
  - Updated CSP-compliant Manifest V3 options architecture.
- **v1.0.0**:
  - Initial 11-step pipeline release.
