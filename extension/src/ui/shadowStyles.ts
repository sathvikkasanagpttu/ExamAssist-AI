/**
 * Scoped Tailwind + Component CSS injected inside the Shadow DOM root (#examai-shadow-host).
 * Prevents host page CSS from leaking into ExamAssist UI and vice versa.
 */
export const SHADOW_DOM_STYLES = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #f8fafc;
  }
  *, *::before, *::after {
    box-sizing: border-box;
  }
  .examai-floating-trigger {
    position: absolute;
    z-index: 2147483646;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: 1px solid #38bdf8;
    box-shadow: 0 8px 24px rgba(2, 132, 199, 0.45);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    user-select: none;
  }
  .examai-floating-trigger:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
  }
  .examai-panel {
    position: fixed;
    top: 20px;
    right: 20px;
    width: 410px;
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 40px);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    background: #0f172a;
    color: #f8fafc;
    border: 1px solid #1e293b;
    border-radius: 12px;
    box-shadow: 0 20px 45px rgba(2, 6, 23, 0.75);
    overflow: hidden;
    font-size: 13px;
    line-height: 1.5;
  }
  .examai-panel.light {
    background: #ffffff;
    color: #0f172a;
    border-color: #cbd5e1;
  }
  .examai-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: #1e293b;
    border-bottom: 1px solid #334155;
  }
  .examai-panel.light .examai-head {
    background: #f1f5f9;
    border-bottom-color: #cbd5e1;
  }
  .examai-brand {
    font-weight: 800;
    font-size: 14px;
    color: #38bdf8;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .examai-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .examai-body {
    padding: 12px 14px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .examai-btn {
    padding: 5px 10px;
    border-radius: 6px;
    border: 1px solid #334155;
    background: #1e293b;
    color: #f8fafc;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .examai-btn.primary {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }
  .examai-btn.danger {
    background: #7f1d1d;
    border-color: #ef4444;
    color: #fecaca;
  }
  .examai-select, .examai-textarea {
    width: 100%;
    border-radius: 6px;
    border: 1px solid #334155;
    background: #0b1120;
    color: #f8fafc;
    padding: 6px 8px;
    font-size: 12px;
    font-family: inherit;
  }
  .examai-textarea {
    min-height: 58px;
    resize: vertical;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .examai-card {
    background: #111827;
    border: 1px solid #1e293b;
    border-radius: 8px;
    padding: 10px;
  }
  .examai-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
  }
  .examai-badge.HIGH { background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid #10b981; }
  .examai-badge.MEDIUM { background: rgba(56, 189, 248, 0.18); color: #38bdf8; border: 1px solid #0284c7; }
  .examai-badge.LOW, .examai-badge.UNVERIFIED { background: rgba(245, 158, 11, 0.18); color: #fbbf24; border: 1px solid #f59e0b; }
  .examai-error {
    background: #451a1a;
    border: 1px solid #ef4444;
    color: #fecaca;
    border-radius: 8px;
    padding: 10px;
    font-size: 12px;
  }
  .examai-notice {
    background: rgba(245, 158, 11, 0.14);
    border: 1px solid #f59e0b;
    color: #fde68a;
    border-radius: 8px;
    padding: 9px;
    font-size: 11.5px;
  }
  .examai-hint-row {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  pre.examai-pre {
    background: #050814;
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 8px;
    overflow-x: auto;
    white-space: pre-wrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
    margin-top: 6px;
  }
`;
