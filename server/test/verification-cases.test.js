import test from "node:test";
import assert from "node:assert/strict";
import { runVerificationPass } from "../pipeline/verificationPass.js";
import { computeConfidence } from "../pipeline/confidenceEngine.js";

// ==========================================
// 5 CONTRADICTION CASES
// ==========================================

const contradictionCases = [
  {
    name: "Case 1: Conflicting clinical efficacy outcomes",
    question: "Is Drug Compound X universally efficacious for insomnia without side effects?",
    answer: "Drug Compound X has 100% cure rate with zero reported adverse effects.",
    sources: [
      { title: "Clinical Trial Alpha", url: "https://trial-a.org", authority: 90, snippet: "Compound X demonstrated 92% efficacy in stage 1 trials." },
      { title: "Replication Trial Beta", url: "https://trial-b.org", authority: 92, snippet: "Compound X failed to replicate efficacy over placebo and caused adverse events." }
    ],
    expectedContradiction: true
  },
  {
    name: "Case 2: Divergent historical dating of an archaeological artifact",
    question: "When was the Bronze artifact of Sector 4 created?",
    answer: "The artifact was definitively crafted in 1200 BCE.",
    sources: [
      { title: "Archaeological Survey 2021", url: "https://arch-survey.edu", authority: 88, snippet: "Radiocarbon analysis dates the layer strictly to 1200 BCE." },
      { title: "Stratigraphic Re-evaluation 2024", url: "https://re-eval.edu", authority: 89, snippet: "Revised dendrochronological analysis dates the stratum to 750 BCE, rejecting the 1200 BCE hypothesis." }
    ],
    expectedContradiction: true
  },
  {
    name: "Case 3: Opposing economic inflation causality theories",
    question: "What was the sole cause of the 1970s stagflation episode?",
    answer: "Stagflation was caused exclusively by money supply expansion.",
    sources: [
      { title: "Monetarist Economic Review", url: "https://monetarist.org", authority: 86, snippet: "The 1970s stagflation was purely a monetary phenomenon caused by Federal Reserve expansion." },
      { title: "Supply-Side Energy Economic Institute", url: "https://energy-econ.org", authority: 87, snippet: "Stagflation was fundamentally driven by exogenous OPEC oil supply shocks, not domestic money growth." }
    ],
    expectedContradiction: true
  },
  {
    name: "Case 4: Conflicting cosmological measurements of Hubble Constant",
    question: "What is the universally accepted value of the Hubble Constant (H0)?",
    answer: "The Hubble Constant is confirmed at exactly 73.0 km/s/Mpc.",
    sources: [
      { title: "SH0ES Cepheid Survey", url: "https://shoes.org", authority: 94, snippet: "Local distance ladder measurements yield H0 = 73.04 ± 1.04 km/s/Mpc." },
      { title: "Planck Cosmic Microwave Background Collaboration", url: "https://planck.org", authority: 95, snippet: "Early universe CMB model predicts H0 = 67.4 ± 0.5 km/s/Mpc, establishing a statistically significant Hubble tension." }
    ],
    expectedContradiction: true
  },
  {
    name: "Case 5: Conflicting protein folding stability reports",
    question: "Does mutation K45E destabilize the catalytic domain of Protein Z?",
    answer: "Mutation K45E unconditionally stabilizes the protein structure.",
    sources: [
      { title: "Biophysical Letters 2022", url: "https://biophys.org", authority: 89, snippet: "Mutation K45E introduces favorable salt bridges, increasing melting temperature by 4°C." },
      { title: "Molecular Biology Journal 2023", url: "https://molbio.org", authority: 91, snippet: "Circular dichroism confirms K45E disrupts the alpha helix, causing rapid denaturation at physiological temperatures." }
    ],
    expectedContradiction: true
  }
];

test("Verification Suite: 5 Contradiction Test Cases", async () => {
  for (const c of contradictionCases) {
    const vResult = await runVerificationPass({
      question: c.question,
      directAnswer: c.answer,
      explanation: "",
      sources: c.sources
    });

    // Check contradiction or conflicting status
    const conf = computeConfidence({
      verificationStatus: vResult.status,
      sources: c.sources,
      hasContradiction: true,
      contradictionExplanation: "Contradictory findings in empirical literature."
    });

    assert.equal(conf.confidence, "LOW", `${c.name} should assign LOW confidence when sources disagree`);
    assert.ok(conf.confidenceReason.toLowerCase().includes("conflict") || conf.confidenceReason.toLowerCase().includes("disagree"),
      `${c.name} confidenceReason must explicitly mention conflicting evidence`);
  }
});

// ==========================================
// 5 INSUFFICIENT-EVIDENCE CASES
// ==========================================

const insufficientEvidenceCases = [
  {
    name: "Case 1: Obscure non-existent hypothetical term",
    question: "What is the primary thermodynamic effect of Blorfgar's imaginary fluid?",
    answer: "Blorfgar fluid increases enthalpy by 100 J.",
    sources: []
  },
  {
    name: "Case 2: Zero search results returned from retrieval",
    question: "Who won the internal debate of Classroom 3B on October 1st 2026?",
    answer: "Student Alice won the debate.",
    sources: []
  },
  {
    name: "Case 3: Unindexed local private policy document",
    question: "What is the penalty for late submission under Section 19 of Course X's unreleased syllabus?",
    answer: "The penalty is 10 points per hour.",
    sources: []
  },
  {
    name: "Case 4: Completely fabricated URL and study",
    question: "What did the fictitious 2099 study by Dr. Nemo establish regarding antimatter?",
    answer: "Dr. Nemo proved that antimatter cures gravity.",
    sources: []
  },
  {
    name: "Case 5: Ambiguous question with zero relevant citations",
    question: "What is the exact color of the secret manuscript?",
    answer: "The color is blue.",
    sources: []
  }
];

test("Verification Suite: 5 Insufficient-Evidence Test Cases", async () => {
  for (const c of insufficientEvidenceCases) {
    const vResult = await runVerificationPass({
      question: c.question,
      directAnswer: c.answer,
      explanation: "",
      sources: c.sources
    });

    assert.equal(vResult.status, "UNVERIFIED", `${c.name} must yield UNVERIFIED status when sources are empty`);

    const conf = computeConfidence({
      verificationStatus: vResult.status,
      sources: c.sources
    });

    assert.equal(conf.confidence, "UNVERIFIED", `${c.name} confidence must be UNVERIFIED`);
    assert.equal(
      conf.confidenceReason,
      "Unable to verify this answer because reliable evidence was not available.",
      `${c.name} must use the exact standardized fallback confidence message`
    );
  }
});
