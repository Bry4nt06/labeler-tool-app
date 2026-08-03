"use strict";

(function alignReleaseReadinessToStaging() {
  const RELEASE_VERSION = "0.9.2";
  const ENVIRONMENT = "staging";
  const RETRY_MS = 50;
  let installed = false;
  let observer = null;
  let alignmentPending = false;

  function alignInterface() {
    alignmentPending = false;
    const meta = document.querySelector('meta[name="application-version"]');
    if (meta && meta.content !== RELEASE_VERSION) meta.content = RELEASE_VERSION;

    const runButton = document.querySelector("#runReleaseReadiness");
    if (runButton && !runButton.disabled && runButton.textContent !== "Run Staging Check") {
      runButton.textContent = "Run Staging Check";
    }

    const controls = document.querySelector(".release-readiness-controls");
    const help = controls?.querySelector(".release-readiness-offline");
    if (help) {
      const current = help.textContent || "";
      const aligned = current
        .replace(/production application shell/gi, "staging application shell")
        .replace(/production release check/gi, "staging release check");
      if (aligned !== current) help.textContent = aligned;
    }
  }

  function scheduleAlignment() {
    if (alignmentPending) return;
    alignmentPending = true;
    window.requestAnimationFrame(alignInterface);
  }

  function install() {
    if (installed) return true;
    const driver = window.LabelerReleaseReadinessDriver;
    if (!driver?.run || driver.stagingAlignmentV2) return false;
    const baseRun = driver.run.bind(driver);
    const basePrepareOffline = typeof driver.prepareOffline === "function"
      ? driver.prepareOffline.bind(driver)
      : null;

    window.LabelerReleaseReadinessDriver = Object.freeze({
      ...driver,
      stagingAlignmentV2: true,
      async run(options = {}) {
        const report = await baseRun({
          ...options,
          expectedVersion: RELEASE_VERSION,
          environment: ENVIRONMENT
        });
        if (report) {
          report.version = RELEASE_VERSION;
          report.environment = ENVIRONMENT;
        }
        scheduleAlignment();
        return report;
      },
      ...(basePrepareOffline ? {
        async prepareOffline(options = {}) {
          const response = await basePrepareOffline({
            ...options,
            expectedVersion: RELEASE_VERSION,
            environment: ENVIRONMENT
          });
          scheduleAlignment();
          return response;
        }
      } : {})
    });

    installed = true;
    scheduleAlignment();
    observer = new MutationObserver(scheduleAlignment);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return true;
  }

  function wait() {
    if (install()) return;
    window.setTimeout(wait, RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
  else wait();
})();
