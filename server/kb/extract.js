import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseHeadedText } from "./chunking.js";

const EXTENSION_TYPES = new Map([
  [".pdf", "application/pdf"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".md", "text/markdown"],
  [".txt", "text/plain"]
]);

export async function extractDocumentText(fileName, buffer) {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  const mimeType = EXTENSION_TYPES.get(ext);
  if (!mimeType) throw new Error("UNSUPPORTED_DOCUMENT_TYPE");
  if (ext === ".pdf") {
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("INVALID_PDF_FILE");
    const loadingTask = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
    const pdf = await loadingTask.promise;
    const sections = [];
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items.map((item) => item.str || "").join(" ").replace(/\s+/g, " ").trim();
        if (text) sections.push({ text, page: pageNumber, section: null });
      }
    } finally {
      await loadingTask.destroy();
    }
    return { mimeType, sections };
  }
  if (ext === ".docx") {
    const result = await mammoth.convertToMarkdown({ buffer });
    return { mimeType, sections: parseHeadedText(result.value) };
  }
  return { mimeType, sections: parseHeadedText(buffer.toString("utf8")) };
}
