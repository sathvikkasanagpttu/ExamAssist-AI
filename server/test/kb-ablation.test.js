import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("RAG ablation changes only the Course Notes evidence source between configs c and d", async () => {
  const [withoutRag, withRag] = await Promise.all([
    readFile(new URL("../eval/configs/c_solve_tiebreak.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../eval/configs/d_rag.json", import.meta.url), "utf8").then(JSON.parse)
  ]);
  assert.equal(withoutRag.skipSearch, withRag.skipSearch);
  assert.equal(withoutRag.skipTieBreak, withRag.skipTieBreak);
  assert.equal(withoutRag.ragEnabled, false);
  assert.equal(withRag.ragEnabled, true);
});
