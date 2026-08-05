"use strict";

(function installSensorEditorFocusGuard(global) {
  if (global.LabelerSensorEditorFocusGuard?.installed) return;

  const NativeMutationObserver = global.MutationObserver;
  const BUILDER_ROOT_SELECTOR = "#wipeBuilderList";
  const SENSOR_ROW_SELECTOR = ".wipe-builder-row[data-builder-object-id]";
  const AUTO_OPTION_SELECTOR = [
    '#builderOrientationLabel option[value="auto"]',
    '[data-object-orientation-field="orientationLabelSection"] option[value="auto"]',
    '[data-corrected-orientation-field="orientationLabelSection"] option[value="auto"]'
  ].join(",");
  const SCOPED_OBSERVER_TARGET = 2;
  let scopedObserverCount = 0;
  let restored = false;
  const waiters = new Set();

  function nodeContainsSelector(node, selector) {
    if (!node || ![1, 11].includes(Number(node.nodeType))) return false;
    return Boolean(node.matches?.(selector) || node.querySelector?.(selector));
  }

  function builderStructureMutation(mutation) {
    if (mutation?.type !== "childList" || !mutation.addedNodes?.length) return false;
    return [...mutation.addedNodes].some((node) => (
      nodeContainsSelector(node, SENSOR_ROW_SELECTOR)
      || nodeContainsSelector(node, AUTO_OPTION_SELECTOR)
    ));
  }

  function filteredRecords(records) {
    return (Array.isArray(records) ? records : [...(records || [])])
      .filter(builderStructureMutation);
  }

  function settleWaiters() {
    [...waiters].forEach((waiter) => {
      if (scopedObserverCount < waiter.expected) return;
      waiters.delete(waiter);
      global.clearTimeout(waiter.timer);
      waiter.resolve(scopedObserverCount);
    });
  }

  function markScoped(observer) {
    if (observer.sensorEditorFocusGuardScoped) return;
    observer.sensorEditorFocusGuardScoped = true;
    scopedObserverCount += 1;
    settleWaiters();
  }

  function waitForScopedObservers(expected = SCOPED_OBSERVER_TARGET, timeoutMs = 2000) {
    const required = Math.max(0, Math.round(Number(expected) || 0));
    if (scopedObserverCount >= required) return Promise.resolve(scopedObserverCount);
    return new Promise((resolve) => {
      const waiter = { expected: required, resolve, timer: null };
      waiter.timer = global.setTimeout(() => {
        waiters.delete(waiter);
        resolve(scopedObserverCount);
      }, Math.max(0, Number(timeoutMs) || 0));
      waiters.add(waiter);
    });
  }

  function restoreMutationObserver() {
    if (restored) return false;
    restored = true;
    if (global.MutationObserver === ScopedMutationObserver) {
      global.MutationObserver = NativeMutationObserver;
    }
    return true;
  }

  if (typeof NativeMutationObserver !== "function") {
    global.LabelerSensorEditorFocusGuard = Object.freeze({
      installed: true,
      supported: false,
      SCOPED_OBSERVER_TARGET,
      builderStructureMutation,
      filteredRecords,
      waitForScopedObservers,
      restoreMutationObserver
    });
    return;
  }

  class ScopedMutationObserver {
    constructor(callback) {
      if (typeof callback !== "function") throw new TypeError("MutationObserver callback must be a function.");
      this.callback = callback;
      this.sensorEditorFocusGuardScoped = false;
      this.nativeObserver = new NativeMutationObserver((records) => {
        const relevant = filteredRecords(records);
        if (relevant.length) this.callback(relevant, this);
      });
    }

    observe(target, options = {}) {
      const builderRoot = global.document?.querySelector?.(BUILDER_ROOT_SELECTOR);
      const requestsWholeDocument = target === global.document?.documentElement
        && options?.childList === true
        && options?.subtree === true;
      if (requestsWholeDocument && builderRoot) {
        markScoped(this);
        return this.nativeObserver.observe(builderRoot, options);
      }
      return this.nativeObserver.observe(target, options);
    }

    disconnect() {
      return this.nativeObserver.disconnect();
    }

    takeRecords() {
      return filteredRecords(this.nativeObserver.takeRecords());
    }
  }

  global.MutationObserver = ScopedMutationObserver;
  global.LabelerSensorEditorFocusGuard = Object.freeze({
    installed: true,
    supported: true,
    NativeMutationObserver,
    ScopedMutationObserver,
    BUILDER_ROOT_SELECTOR,
    SENSOR_ROW_SELECTOR,
    AUTO_OPTION_SELECTOR,
    SCOPED_OBSERVER_TARGET,
    builderStructureMutation,
    filteredRecords,
    waitForScopedObservers,
    restoreMutationObserver,
    get scopedObserverCount() { return scopedObserverCount; },
    get restored() { return restored; }
  });
})(typeof window !== "undefined" ? window : globalThis);
