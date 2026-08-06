(function (global) {
  "use strict";

  const LEVELS = Object.freeze({ BAD: "bad", WARN: "warn", OK: "ok" });
  const LEVEL_PRIORITY = Object.freeze({ bad: 3, warn: 2, ok: 1 });
  const PREFIX_PATTERN = /^\s*\[([A-Z][A-Z0-9 _/-]{1,30})\]\s*/;
  const EXPLICIT_KEY_PREFIX = "explicit|";

  function level(value, fallback = LEVELS.WARN) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === LEVELS.BAD || normalized === LEVELS.WARN || normalized === LEVELS.OK
      ? normalized
      : fallback;
  }

  function stripPrefix(message) {
    return String(message || "").replace(PREFIX_PATTERN, "").trim();
  }

  function prefixedCategory(message) {
    const match = String(message || "").match(PREFIX_PATTERN);
    return match ? match[1].trim().toLowerCase().replace(/[\s/]+/g, "-") : "";
  }

  function normalizeCategory(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const aliases = {
      commands: "grammar",
      command: "grammar",
      sequence: "motion",
      terminal: "grammar",
      translation: "planner",
      validator: "general"
    };
    return aliases[normalized] || normalized || "general";
  }

  function inferHmi(message) {
    const match = String(message || "").match(/\bHMI\s*(\d+)\b/i);
    return match ? Number(match[1]) : null;
  }

  function inferCategory(message, metadata = {}) {
    const explicit = metadata.category || metadata.pipelineCategory || prefixedCategory(message);
    if (explicit) return normalizeCategory(explicit);
    const text = stripPrefix(message).toLowerCase();
    if (/planner|mechanical event|event id|event mismatch/.test(text)) return "planner";
    if (/speed|ratio|deg bottle\s*\/\s*1 deg table|will fault|table travel/.test(text)) return "speed";
    if (/cmd\s*\d|rest|correction|startup|continuous|changeover|terminal/.test(text)) return "grammar";
    if (/wipe|contact|assembly|pad|roller|brush|inactive area/.test(text)) return "mechanical";
    if (/table angle|plate angle|servo row|motion/.test(text)) return "motion";
    if (/sensor|label view|overlap/.test(text)) return "geometry";
    return "general";
  }

  function normalizeCode(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function normalizeText(message) {
    return stripPrefix(message)
      .toLowerCase()
      .replace(/[°º]/g, " deg ")
      .replace(/[→⇒]/g, " to ")
      .replace(/[^a-z0-9.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeValidationKey(value) {
    let normalized = String(value || "").trim().toLowerCase();
    while (normalized.startsWith(EXPLICIT_KEY_PREFIX)) normalized = normalized.slice(EXPLICIT_KEY_PREFIX.length);
    normalized = normalized.replace(/^(bad|warn|ok)\|/, "");
    return normalized
      .replace(/\s*\|\s*/g, "|")
      .replace(/\|{2,}/g, "|")
      .replace(/^\|+|\|+$/g, "");
  }

  function inferCondition(issue) {
    const text = normalizeText(issue.message);
    const category = normalizeCategory(issue.category);
    const hmi = issue.hmi ?? inferHmi(issue.message);
    const location = hmi !== null && hmi !== undefined ? `hmi:${hmi}` : issue.eventId ? `event:${issue.eventId}` : "global";

    if (/nonpositive table travel|motion commands require positive table distance/.test(text)) return `nonpositive-table-travel|${location}`;
    if (/table angle.*(must be greater|does not increase|strictly increasing|unique)|table angle order/.test(text)) return `table-angle-order|${location}`;
    if (/missing plate angle|no valid bottle plate angle/.test(text)) return `missing-plate-angle|${location}`;
    if (/missing table angle|no valid table angle/.test(text)) return `missing-table-angle|${location}`;
    if (/finish.*cmd 3 rest|terminal rest|required.*end curve.*rest|end curve using cmd 3 rest/.test(text)) return `terminal-rest|${location}`;

    if (category === "speed" || /speed|ratio|deg bottle.*1 deg table|will fault/.test(text)) {
      return `speed-envelope|${location}`;
    }

    if (/missing leading reference|without a preceding cmd 3|without an immediately preceding cmd 3/.test(text)) return `grammar-leading-reference|${location}`;
    if (/missing trailing reference|must be followed by cmd 3/.test(text)) return `grammar-trailing-reference|${location}`;
    if (/rest.*(changes|produces).*bottle|cmd 3 rest but/.test(text)) return `grammar-rest-motion|${location}`;
    if (/correction.*no.*movement|empty correction|cmd 7 but produces no/.test(text)) return `grammar-empty-correction|${location}`;
    if (/planner.*row count|planner contains.*program contains/.test(text)) return "planner-row-count|global";
    if (/planner.*event mismatch|linked to.*planner row/.test(text)) return `planner-event-mismatch|${location}`;
    if (/planner.*angle mismatch|table angle does not match/.test(text)) return `planner-angle-mismatch|${location}`;
    if (/planner.*command mismatch|recommends cmd.*final row/.test(text)) return `planner-command-mismatch|${location}`;
    if (/no mechanical planner steps|planner steps.*missing/.test(text)) return "planner-plan-missing|global";

    return text;
  }

  function create(input = {}) {
    const metadata = input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {};
    const message = stripPrefix(input.message);
    const resolvedLevel = level(input.level);
    const resolvedCategory = normalizeCategory(input.category || inferCategory(input.message, metadata));
    const resolvedHmi = input.hmi ?? metadata.hmi ?? inferHmi(message);
    const resolvedEventId = input.eventId ?? metadata.eventId ?? null;
    const code = normalizeCode(input.code || metadata.issueCode || metadata.pipelineCode || metadata.code);
    return {
      level: resolvedLevel,
      code,
      category: resolvedCategory,
      message,
      hmi: resolvedHmi,
      eventId: resolvedEventId,
      source: String(input.source || metadata.source || "application"),
      metadata
    };
  }

  function fromNote(note, defaults = {}) {
    if (!Array.isArray(note)) {
      if (note && typeof note === "object") return create({ ...defaults, ...note });
      return create({ ...defaults, message: String(note || "") });
    }
    const metadata = note[2] && typeof note[2] === "object" ? note[2] : {};
    return create({
      ...defaults,
      level: note[0],
      message: note[1],
      metadata,
      code: metadata.issueCode || metadata.pipelineCode || metadata.code,
      category: metadata.category || metadata.pipelineCategory,
      hmi: metadata.hmi,
      eventId: metadata.eventId,
      source: metadata.source || defaults.source
    });
  }

  function semanticKey(issue) {
    const condition = inferCondition(issue);
    const normalizedText = normalizeText(issue.message);
    if (condition && condition !== normalizedText) return condition;

    const explicit = issue.metadata?.validationKey || issue.metadata?.diagnosticKey || issue.metadata?.issueKey;
    const explicitKey = normalizeValidationKey(explicit);
    return explicitKey || condition;
  }

  function quality(issue) {
    let score = 0;
    if (issue.code) score += 4;
    if (issue.category && issue.category !== "general") score += 2;
    if (issue.hmi !== null && issue.hmi !== undefined) score += 1;
    if (issue.eventId) score += 1;
    if (issue.metadata && Object.keys(issue.metadata).length) score += 1;
    return score;
  }

  function severity(issue) {
    return LEVEL_PRIORITY[level(issue?.level)] || 0;
  }

  function authoritativeIssue(current, candidate) {
    const strongest = severity(candidate) > severity(current) ? candidate : current;
    const richest = quality(candidate) > quality(current) ? candidate : current;
    const fallback = richest === candidate ? current : candidate;
    return create({
      ...richest,
      level: strongest.level,
      code: richest.code || fallback.code,
      category: richest.category !== "general" ? richest.category : fallback.category,
      message: richest.message || strongest.message || fallback.message,
      hmi: richest.hmi ?? fallback.hmi,
      eventId: richest.eventId ?? fallback.eventId,
      source: richest.source || fallback.source,
      metadata: { ...(current.metadata || {}), ...(candidate.metadata || {}) }
    });
  }

  function dedupe(issues) {
    const slots = new Map();
    (Array.isArray(issues) ? issues : []).forEach((rawIssue) => {
      const issue = rawIssue?.message !== undefined ? create(rawIssue) : fromNote(rawIssue);
      const key = semanticKey(issue);
      const current = slots.get(key);
      slots.set(key, current ? authoritativeIssue(current, issue) : issue);
    });
    return [...slots.values()];
  }

  function toNote(issue) {
    const metadata = {
      ...(issue.metadata || {}),
      issueCode: issue.code || undefined,
      category: issue.category,
      hmi: issue.hmi ?? undefined,
      eventId: issue.eventId ?? undefined,
      source: issue.source,
      validationKey: semanticKey(issue)
    };
    Object.keys(metadata).forEach((key) => metadata[key] === undefined && delete metadata[key]);
    return [issue.level, issue.message, metadata];
  }

  const api = Object.freeze({
    LEVELS,
    create,
    fromNote,
    toNote,
    dedupe,
    semanticKey,
    inferCategory,
    inferCondition,
    inferHmi,
    normalizeCategory,
    normalizeText,
    normalizeValidationKey,
    stripPrefix
  });

  global.LabelerValidationIssueDriver = api;
  global.LabelerDriverRegistry?.register?.("validation.issue", api, {
    version: 2,
    responsibilities: ["issue-creation", "normalization", "semantic-deduplication"]
  });
})(window);
