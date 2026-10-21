import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import OpenAI from "openai";
import { initLangfuseTracing, traceChain, flushLangfuse } from "../tracing.js";
import { processAssessmentQuestion } from "../pipeline/assessmentOrchestrator.js";
import { defaultAIClient } from "../aiClient.js";

console.log("=== EXAMASSIST LIVE API KEYS & END-TO-END VERIFICATION ===\n");

const results = {};

// 1. Check OpenAI API Key
console.log("1. Testing OpenAI API Key...");
try {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    results.openai = { status: "FAILED", error: "OPENAI_API_KEY is not set" };
    console.log("   ✖ OPENAI_API_KEY is not set");
  } else {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages: [{ role: "user", content: "Reply with strictly the word: OK" }],
      max_tokens: 5,
      temperature: 0
    });
    const reply = response.choices?.[0]?.message?.content?.trim();
    results.openai = {
      status: "SUCCESS",
      model: response.model,
      reply,
      usage: response.usage
    };
    console.log(`   ✔ OpenAI API is WORKING! (Model: ${response.model}, Reply: "${reply}")`);
  }
} catch (err) {
  results.openai = { status: "FAILED", error: err.message, status_code: err.status };
  console.log(`   ✖ OpenAI API Error: ${err.message} (HTTP ${err.status || "N/A"})`);
}

// 2. Check Tavily Web Search API Key
console.log("\n2. Testing Tavily Web Search API Key...");
try {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    results.tavily = { status: "SKIPPED", error: "TAVILY_API_KEY is not set" };
    console.log("   - Tavily key not configured");
  } else {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: "time complexity of binary search",
        max_results: 2
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (res.ok) {
      const data = await res.json();
      results.tavily = {
        status: "SUCCESS",
        resultsCount: data.results?.length || 0,
        topTitle: data.results?.[0]?.title || "N/A",
        topUrl: data.results?.[0]?.url || "N/A"
      };
      console.log(`   ✔ Tavily API is WORKING! (${data.results?.length} results, Top: "${data.results?.[0]?.title}")`);
    } else {
      const errText = await res.text();
      results.tavily = { status: "FAILED", statusCode: res.status, error: errText };
      console.log(`   ✖ Tavily API Error: HTTP ${res.status} - ${errText}`);
    }
  }
} catch (err) {
  results.tavily = { status: "FAILED", error: err.message };
  console.log(`   ✖ Tavily Fetch Error: ${err.message}`);
}

// 3. Check Langfuse API Keys & Ingestion
console.log("\n3. Testing Langfuse API Keys & Ingestion...");
try {
  const publicKey = (process.env.LANGFUSE_PUBLIC_KEY || "").replace(/^["']|["']$/g, "");
  const secretKey = (process.env.LANGFUSE_SECRET_KEY || "").replace(/^["']|["']$/g, "");
  const baseUrl = (process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_HOST || "https://cloud.langfuse.com").replace(/^["']|["']$/g, "");

  if (!publicKey || !secretKey) {
    results.langfuse = { status: "SKIPPED", error: "Langfuse credentials not set" };
    console.log("   - Langfuse keys not configured");
  } else {
    const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
    const authRes = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/public/health`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(10000)
    });
    const authStatus = authRes.status;
    const authBody = await authRes.json().catch(() => ({}));

    // Test trace dispatch
    initLangfuseTracing();

    let traceExported = false;
    await traceChain("verification.smoke-test", async (span) => {
      span.update({
        input: { check: "Live API key verification" },
        metadata: { timestamp: new Date().toISOString() },
        tags: ["verification", "live-test"]
      });
      span.update({
        output: { status: "HEALTHY" }
      });
      traceExported = true;
    });

    await flushLangfuse();

    results.langfuse = {
      status: "SUCCESS",
      cloudHealth: authBody,
      authHttpStatus: authStatus,
      traceSent: traceExported,
      baseUrl
    };
    console.log(`   ✔ Langfuse API is WORKING! (Connected to ${baseUrl}, Health: HTTP ${authStatus}, Trace dispatched)`);
  }
} catch (err) {
  results.langfuse = { status: "FAILED", error: err.message };
  console.log(`   ✖ Langfuse Error: ${err.message}`);
}

// 4. Test Application Pipeline End-to-End
console.log("\n4. Running Full Application Pipeline with Live Services...");
try {
  const testQuestion = {
    question: "What is the time complexity of searching in a balanced binary search tree with N elements?",
    options: [
      "A. O(1)",
      "B. O(log N)",
      "C. O(N)",
      "D. O(N log N)"
    ],
    type: "MCQ",
    subject: "Computer Science",
    mode: "Practice Mode",
    aiClient: defaultAIClient
  };

  const startTime = Date.now();
  const assessment = await processAssessmentQuestion(testQuestion);
  const elapsedMs = Date.now() - startTime;

  results.pipeline = {
    status: "SUCCESS",
    elapsedMs,
    answer: assessment.directAnswer,
    confidence: assessment.confidence,
    confidenceReason: assessment.confidenceReason,
    sourcesCount: assessment.sources?.length || 0,
    verificationStatus: assessment.verification?.status
  };

  console.log(`   ✔ End-to-End Assessment Pipeline SUCCEEDED in ${elapsedMs}ms!`);
  console.log(`     - Direct Answer: ${assessment.directAnswer}`);
  console.log(`     - Confidence: ${assessment.confidence}`);
  console.log(`     - Sources Retrieved: ${assessment.sources?.length || 0}`);
  console.log(`     - Verification: ${assessment.verification?.status}`);
} catch (err) {
  results.pipeline = { status: "FAILED", error: err.message };
  console.log(`   ✖ Pipeline Execution Error: ${err.message}`);
}

console.log("\n=== VERIFICATION SUMMARY ===");
console.log(JSON.stringify(results, null, 2));
