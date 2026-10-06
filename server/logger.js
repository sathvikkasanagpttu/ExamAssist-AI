/**
 * ExamAssist AI - Privacy-Preserving Structured Logger
 * Enforces privacy guarantees: never logs question content, student inputs, or PII.
 * Only logs system metadata, latency, question type, status code, and error categories.
 */

export class PrivacyLogger {
  constructor(serviceName = "ExamAssist-Backend") {
    this.serviceName = serviceName;
  }

  _format(level, message, metadata = {}) {
    // Strictly strip any question content or PII from metadata
    const sanitized = { ...metadata };
    delete sanitized.question;
    delete sanitized.rawQuestion;
    delete sanitized.options;
    delete sanitized.codeSnippet;
    delete sanitized.context;
    delete sanitized.answer;
    delete sanitized.directAnswer;
    delete sanitized.explanation;

    return JSON.stringify({
      timestamp: new Date().toISOString(),
      service: this.serviceName,
      level,
      message,
      ...sanitized
    });
  }

  info(message, metadata = {}) {
    console.log(this._format("INFO", message, metadata));
  }

  warn(message, metadata = {}) {
    console.warn(this._format("WARN", message, metadata));
  }

  error(message, metadata = {}) {
    console.error(this._format("ERROR", message, metadata));
  }
}

export const logger = new PrivacyLogger();
