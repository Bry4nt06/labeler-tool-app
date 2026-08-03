"use strict";

(function installHealthStatusUiController(global) {
  if (global.LabelerHealthStatusUiController?.installed) return;

  const STYLE_ID = "servoforgeHealthStatusStyles";
  const GOOD_WORDS = new Set(["pass", "passed", "ok", "good", "ready", "healthy", "success", "valid"]);
  const WARN_WORDS = new Set(["review", "warn", "warning", "warnings", "caution", "attention", "advisory"]);
  const BAD_WORDS = new Set(["fail", "failed", "failure", "failures", "bad", "error", "errors", "fault", "faults", "critical", "action", "invalid"]);
  const INFO_WORDS = new Set(["running", "info", "informational", "pending", "checking"]);
  const KEYWORD_STATUS_SELECTOR = [
    ".program-optimizer-badge",
    ".pipeline-validation-summary > strong",
    ".servo-program-health-strip strong",
    ".diagnostics-workspace-status",
    ".release-readiness-status strong",
    ".release-readiness-result-head span",
    ".optimizer-finding-head span",
    "[data-health-keyword]"
  ].join(",");
  let refreshQueued = false;

  function normalizedWord(value) {
    return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
  }

  function healthFromValue(value) {
    const word = normalizedWord(value);
    if (!word) return "";
    if (GOOD_WORDS.has(word)) return "good";
    if (WARN_WORDS.has(word)) return "warn";
    if (BAD_WORDS.has(word)) return "bad";
    if (INFO_WORDS.has(word)) return "info";
    return "";
  }

  function healthFromText(value) {
    const words = normalizedWord(value)
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (words.some((word) => BAD_WORDS.has(word))) return "bad";
    if (words.some((word) => WARN_WORDS.has(word))) return "warn";
    if (words.some((word) => GOOD_WORDS.has(word))) return "good";
    if (words.some((word) => INFO_WORDS.has(word))) return "info";
    return "";
  }

  function setHealth(element, health) {
    if (!(element instanceof Element) || !health) return false;
    if (element.dataset.health === health) return false;
    element.dataset.health = health;
    return true;
  }

  function numericValue(text) {
    const match = String(text ?? "").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  function healthForCount(text, kind) {
    const count = numericValue(text);
    if (!Number.isFinite(count)) return kind === "info" ? "info" : "";
    if (kind === "bad") return count > 0 ? "bad" : "good";
    if (kind === "warn") return count > 0 ? "warn" : "good";
    if (kind === "good") return count > 0 ? "good" : "info";
    return "info";
  }

  function annotateStatusAttributes(root) {
    root.querySelectorAll?.("[data-status],[data-level]").forEach((element) => {
      const health = healthFromValue(element.dataset.status) || healthFromValue(element.dataset.level);
      if (health) setHealth(element, health);
    });
  }

  function annotateKeywordStatuses(root) {
    root.querySelectorAll?.(KEYWORD_STATUS_SELECTOR).forEach((element) => {
      const health = healthFromValue(element.dataset.status)
        || healthFromValue(element.dataset.level)
        || healthFromText(element.textContent);
      if (!health) return;
      setHealth(element, health);
      const parent = element.closest?.(".program-optimizer-panel,.servo-program-health-strip,.release-readiness-status,.pipeline-validation-summary");
      if (parent) setHealth(parent, health);
    });
  }

  function annotateNotices(root) {
    root.querySelectorAll?.(".notice").forEach((notice) => {
      setHealth(notice, notice.classList.contains("bad") ? "bad" : notice.classList.contains("warn") ? "warn" : "good");
    });
    root.querySelectorAll?.(".sensor-status-pass").forEach((element) => setHealth(element, "good"));
    root.querySelectorAll?.(".sensor-status-fail").forEach((element) => setHealth(element, "bad"));
    root.querySelectorAll?.(".map-fault-notice,.startup-error").forEach((element) => setHealth(element, "bad"));
  }

  function annotatePipelineCounts(root) {
    root.querySelectorAll?.(".pipeline-validation-summary span").forEach((chip) => {
      const text = chip.textContent || "";
      if (/fault/i.test(text)) setHealth(chip, healthForCount(text, "bad"));
      else if (/warn/i.test(text)) setHealth(chip, healthForCount(text, "warn"));
      else setHealth(chip, "info");
    });
  }

  function annotateReleaseCounts(root) {
    root.querySelectorAll?.(".release-readiness-status span").forEach((chip) => {
      const text = chip.textContent || "";
      if (/fail/i.test(text)) setHealth(chip, healthForCount(text, "bad"));
      else if (/review|warn/i.test(text)) setHealth(chip, healthForCount(text, "warn"));
      else if (/pass/i.test(text)) setHealth(chip, healthForCount(text, "good"));
      else setHealth(chip, "info");
    });
  }

  function annotateDiagnosticsOverview(root) {
    root.querySelectorAll?.(".diagnostics-overview > div").forEach((card) => {
      const label = card.querySelector("span")?.textContent || "";
      const value = card.querySelector("strong")?.textContent || "";
      const direct = healthFromValue(value) || healthFromText(value);
      if (direct) {
        setHealth(card, direct);
        return;
      }
      if (/faults?\s*\/\s*warnings?/i.test(label)) {
        const numbers = value.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
        setHealth(card, numbers[0] > 0 ? "bad" : numbers[1] > 0 ? "warn" : "good");
      }
    });

    const workspaceStatus = document.querySelector(".diagnostics-workspace-status")?.dataset.health || "";
    document.querySelectorAll(".diagnostics-tab-count").forEach((count) => {
      if (!count.hidden) setHealth(count, workspaceStatus === "bad" ? "bad" : workspaceStatus === "warn" ? "warn" : "info");
    });
  }

  function annotateOptimizerMetrics(root) {
    root.querySelectorAll?.(".program-optimizer-metrics > div").forEach((card) => {
      const label = card.querySelector("span")?.textContent || "";
      const value = card.querySelector("strong")?.textContent || "";
      if (/speed faults?/i.test(label)) setHealth(card, healthForCount(value, "bad"));
      else if (/findings?/i.test(label)) {
        const numbers = value.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
        setHealth(card, numbers[0] > 0 ? "bad" : numbers[1] > 0 ? "warn" : "good");
      }
    });
  }

  function annotate(root = document) {
    annotateStatusAttributes(root);
    annotateKeywordStatuses(root);
    annotateNotices(root);
    annotatePipelineCounts(root);
    annotateReleaseCounts(root);
    annotateDiagnosticsOverview(root);
    annotateOptimizerMetrics(root);
  }

  function scheduleAnnotate() {
    if (refreshQueued) return;
    refreshQueued = true;
    global.requestAnimationFrame(() => {
      refreshQueued = false;
      annotate(document);
    });
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return false;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --health-good: #39d77d;
        --health-good-text: #6df0a5;
        --health-good-bg: rgba(34, 184, 99, 0.13);
        --health-good-glow: rgba(57, 215, 125, 0.08);
        --health-warn: #e7b93f;
        --health-warn-text: #ffd86d;
        --health-warn-bg: rgba(218, 165, 35, 0.14);
        --health-warn-glow: rgba(231, 185, 63, 0.08);
        --health-bad: #ed5965;
        --health-bad-text: #ff8991;
        --health-bad-bg: rgba(215, 53, 67, 0.15);
        --health-bad-glow: rgba(237, 89, 101, 0.09);
        --health-info: #59aee9;
        --health-info-text: #88caff;
        --health-info-bg: rgba(58, 139, 201, 0.13);
        --health-info-glow: rgba(89, 174, 233, 0.07);
      }

      body[data-theme="light"] {
        --health-good: #16834d;
        --health-good-text: #11683d;
        --health-good-bg: rgba(22, 131, 77, 0.11);
        --health-good-glow: rgba(22, 131, 77, 0.06);
        --health-warn: #a76c00;
        --health-warn-text: #845600;
        --health-warn-bg: rgba(190, 126, 0, 0.12);
        --health-warn-glow: rgba(167, 108, 0, 0.06);
        --health-bad: #c53742;
        --health-bad-text: #a8202c;
        --health-bad-bg: rgba(197, 55, 66, 0.11);
        --health-bad-glow: rgba(197, 55, 66, 0.07);
        --health-info: #2178b3;
        --health-info-text: #165f91;
        --health-info-bg: rgba(33, 120, 179, 0.1);
        --health-info-glow: rgba(33, 120, 179, 0.06);
      }

      [data-health="good"] {
        --health-current: var(--health-good);
        --health-current-text: var(--health-good-text);
        --health-current-bg: var(--health-good-bg);
        --health-current-glow: var(--health-good-glow);
      }
      [data-health="warn"] {
        --health-current: var(--health-warn);
        --health-current-text: var(--health-warn-text);
        --health-current-bg: var(--health-warn-bg);
        --health-current-glow: var(--health-warn-glow);
      }
      [data-health="bad"] {
        --health-current: var(--health-bad);
        --health-current-text: var(--health-bad-text);
        --health-current-bg: var(--health-bad-bg);
        --health-current-glow: var(--health-bad-glow);
      }
      [data-health="info"] {
        --health-current: var(--health-info);
        --health-current-text: var(--health-info-text);
        --health-current-bg: var(--health-info-bg);
        --health-current-glow: var(--health-info-glow);
      }

      .notice[data-health] {
        border-left-color: var(--health-current) !important;
        background: var(--health-current-bg) !important;
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--health-current) 18%, transparent), 0 0 6px var(--health-current-glow) !important;
      }
      .notice[data-health] strong,
      .notice[data-health] a { color: var(--health-current-text) !important; }

      :is(.pipeline-validation-summary,.diagnostics-workspace-status,.servo-program-health-strip,.release-readiness-status,.program-optimizer-panel)[data-health] {
        border-color: var(--health-current) !important;
        background: linear-gradient(180deg, var(--health-current-bg), color-mix(in srgb, var(--panel) 96%, transparent)) !important;
        box-shadow: inset 3px 0 0 var(--health-current), 0 0 7px var(--health-current-glow) !important;
      }

      :is(.program-optimizer-badge,.pipeline-validation-summary > strong,.servo-program-health-strip strong,.diagnostics-workspace-status,.release-readiness-status strong,.release-readiness-result-head span,.optimizer-finding-head span,[data-health-keyword])[data-health] {
        color: var(--health-current-text) !important;
        text-shadow: none !important;
      }

      :is(.pipeline-validation-summary,.diagnostics-workspace-status,.servo-program-health-strip,.release-readiness-status,.program-optimizer-panel)[data-health] > strong,
      :is(.pipeline-validation-summary,.release-readiness-status)[data-health] strong,
      .servo-program-health-strip[data-health] strong,
      .program-optimizer-panel[data-health] .program-optimizer-badge {
        color: var(--health-current-text) !important;
      }

      .diagnostics-workspace-status[data-health],
      .program-optimizer-badge[data-health],
      .program-optimizer-panel[data-health] .program-optimizer-badge {
        border-color: var(--health-current) !important;
        background: var(--health-current-bg) !important;
        box-shadow: 0 0 5px var(--health-current-glow) !important;
      }

      :is(.release-readiness-result,.optimizer-finding,.sensor-inline-status)[data-health] {
        border-left-color: var(--health-current) !important;
        background: linear-gradient(90deg, var(--health-current-bg), var(--input) 42%) !important;
        box-shadow: inset 3px 0 0 var(--health-current) !important;
      }
      :is(.release-readiness-result,.optimizer-finding,.sensor-inline-status)[data-health] strong,
      :is(.release-readiness-result,.optimizer-finding)[data-health] .optimizer-finding-head span,
      .release-readiness-result[data-health] .release-readiness-result-head span {
        color: var(--health-current-text) !important;
      }

      :is(.pipeline-validation-summary,.release-readiness-status) span[data-health],
      .diagnostics-overview > div[data-health],
      .program-optimizer-metrics > div[data-health] {
        border: 1px solid var(--health-current) !important;
        background: var(--health-current-bg) !important;
        box-shadow: 0 0 5px var(--health-current-glow) !important;
      }
      :is(.pipeline-validation-summary,.release-readiness-status) span[data-health],
      .diagnostics-overview > div[data-health] strong,
      .program-optimizer-metrics > div[data-health] strong {
        color: var(--health-current-text) !important;
      }

      .diagnostics-tab-count[data-health] {
        border: 1px solid var(--health-current) !important;
        background: var(--health-current) !important;
        color: #08100c !important;
        box-shadow: 0 0 5px var(--health-current-glow) !important;
      }

      .map-fault-notice[data-health],
      .startup-error[data-health] {
        border: 1px solid var(--health-current) !important;
        border-left: 5px solid var(--health-current) !important;
        background: color-mix(in srgb, var(--health-current-bg) 82%, var(--panel)) !important;
        color: var(--ink) !important;
        box-shadow: 0 8px 24px rgba(0,0,0,.35), 0 0 8px var(--health-current-glow) !important;
      }
      .map-fault-notice[data-health] strong,
      .startup-error[data-health] strong { color: var(--health-current-text) !important; }

      .sensor-status-pass { border-left-color: var(--health-good) !important; }
      .sensor-status-fail { border-left-color: var(--health-bad) !important; }
    `;
    document.head.appendChild(style);
    return true;
  }

  function installObserver() {
    if (!document.documentElement || document.documentElement.dataset.healthStatusObserver === "true") return false;
    document.documentElement.dataset.healthStatusObserver = "true";
    const observer = new MutationObserver(scheduleAnnotate);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "data-status", "data-level", "hidden"]
    });
    return true;
  }

  installStyles();
  annotate(document);
  installObserver();

  global.LabelerHealthStatusUiController = Object.freeze({
    installed: true,
    annotate,
    refresh: scheduleAnnotate,
    healthFromValue,
    healthFromText,
    healthForCount,
    installStyles
  });
})(window);
