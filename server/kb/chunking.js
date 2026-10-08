import { createHash } from "node:crypto";

export function hashText(text) {
  return createHash("sha256").update(String(text)).digest("hex");
}

export function chunkSections(sections, { maxWords = 600, overlapWords = 80 } = {}) {
  const chunks = [];
  for (const section of sections) {
    const words = String(section.text || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const seen = new Set();
    let start = 0;
    while (start < words.length) {
      const part = words.slice(start, start + maxWords);
      const text = part.join(" ").trim();
      const contentHash = hashText(text);
      if (!seen.has(contentHash)) {
        chunks.push({ text, contentHash, page: section.page ?? null, section: section.section || null });
        seen.add(contentHash);
      }
      if (start + maxWords >= words.length) break;
      start += Math.max(1, maxWords - overlapWords);
    }
  }
  return chunks;
}

export function parseHeadedText(text) {
  const sections = [];
  let heading = null;
  let content = [];
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match) {
      if (content.join("\n").trim()) sections.push({ text: content.join("\n"), section: heading });
      heading = match[2].trim();
      content = [heading];
    } else content.push(line);
  }
  if (content.join("\n").trim()) sections.push({ text: content.join("\n"), section: heading });
  return sections.length ? sections : [{ text: String(text), section: null }];
}
