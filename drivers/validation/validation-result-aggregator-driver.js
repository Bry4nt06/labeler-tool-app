(function (global) {
  "use strict";

  function issueDriver() {
    return global.LabelerValidationIssueDriver;
  }

  function summarize(issues) {
    const summary = { bad: 0, warn: 0, ok: 0, total: 0 };
    const categories = {};
    issues.forEach((issue) => {
      const level = issue.level || "warn";
      const category = issue.category || "general";
      summary[level] = (summary[level] || 0) + 1;
      summary.total += 1;
      categories[category] ||= { bad: 0, warn: 0, ok: 0, total: 0 };
      categories[category][level] = (categories[category][level] || 0) + 1;
      categories[category].total += 1;
    });
    return { summary, categories };
  }

  function aggregateIssues(rawIssues, options = {}) {
    const factory = issueDriver();
    if (!factory) throw new Error("LabelerValidationIssueDriver is required before validation aggregation.");
    const normalized = (Array.isArray(rawIssues) ? rawIssues : []).map((issue) => {
      if (Array.isArray(issue)) return factory.fromNote(issue, options);
      return factory.create({ ...options, ...issue });
    });
    const issues = factory.dedupe(normalized);
    const { summary, categories } = summarize(issues);
    return {
      createdAt: new Date().toISOString(),
      valid: summary.bad === 0,
      status: summary.bad ? "FAIL" : summary.warn ? "REVIEW" : "PASS",
      summary,
      categories,
      issues,
      sourceCount: normalized.length,
      duplicateCount: Math.max(0, normalized.length - issues.length)
    };
  }

  function aggregateNotes(notes, options = {}) {
    return aggregateIssues(notes, options);
  }

  function merge(results, options = {}) {
    const issues = (Array.isArray(results) ? results : [])
      .flatMap((result) => Array.isArray(result?.issues) ? result.issues : []);
    return aggregateIssues(issues, options);
  }

  function toNotes(result) {
    const factory = issueDriver();
    return (Array.isArray(result?.issues) ? result.issues : []).map((issue) => factory.toNote(issue));
  }

  const api = Object.freeze({ aggregateIssues, aggregateNotes, merge, summarize, toNotes });
  global.LabelerValidationResultAggregator = api;
  global.LabelerDriverRegistry?.register?.("validation.result", api, {
    version: 1,
    dependencies: ["validation.issue"],
    responsibilities: ["result-aggregation", "summary", "category-counts", "status"]
  });
})(window);
