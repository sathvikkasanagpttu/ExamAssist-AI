# Privacy

ExamAssist stores questions and panel history only in the active browser session. Course Notes are the exception: uploaded documents, extracted text, metadata, and vector embeddings are stored in the configured Postgres database and associated with a random local profile ID saved in `chrome.storage.local`.

The backend uses note text only to create embeddings and retrieve passages for questions sent by that same extension profile. Relevant passages may be sent to the AI provider configured on the backend as part of answer generation or reranking. The extension does not include API credentials. Operational logs record retrieval status codes and counts, not uploaded filenames, document text, or note passages.

Open the extension's **Options → Course Notes** section to view storage use and delete individual documents. Deleting a document cascades to its text chunks and embeddings. Removing the extension's local profile ID separates the next profile from old server-side data; delete each stored document before removing the extension if you also want the database copies removed.

The profile ID provides local separation for a single-user/self-hosted setup. It is not authentication for a public multi-user deployment. Keep the backend on a trusted host unless authenticated user accounts and transport security are added.
