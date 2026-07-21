(function (global) {
  "use strict";

  function nearlyEqual(a, b, tolerance) {
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
  }

  function arraysEqual(a, b, tolerance) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every((value, index) => nearlyEqual(value, b[index], tolerance));
  }

  function analyze(options) {
    const issues = [...(options.plan?.issues || [])];
    const tolerance = Number.isFinite(options.tolerance) ? options.tolerance : 0.5;
    const plans = options.plan?.stationPlans || [];
    const pairPlans = options.plan?.pairPlans || [];

    plans.forEach((plan) => {
      if (!plan.active || !plan.valid) return;
      const motion = Array.isArray(plan.movePath) ? plan.movePath : [];
      const totalRotation = motion.reduce((sum, move) => sum + Math.abs(move), 0);
      const hasReverse = motion.some((move, index) => index > 0 && Math.sign(move) !== Math.sign(motion[index - 1]) && Math.abs(move) > tolerance && Math.abs(motion[index - 1]) > tolerance);

      if (plan.section === "neck" && !hasReverse) {
        issues.push({
          level: "bad",
          code: "neck-missing-direction-change",
          station: plan.station,
          pair: plan.pair,
          message: `Aggregate ${plan.station} neck profile does not reverse direction between the outer and inner roller wipe-downs.`
        });
      }

      if ((plan.section === "body" || plan.section === "back") && !hasReverse) {
        issues.push({
          level: "bad",
          code: "leading-edge-missing-backspin",
          station: plan.station,
          pair: plan.pair,
          message: `Aggregate ${plan.station} ${plan.section} profile is missing the leading-edge back-spin followed by the opposite-direction full wipe.`
        });
      }

      if (totalRotation + tolerance < Number(plan.requiredRotation || 0)) {
        issues.push({
          level: "bad",
          code: "incomplete-wipe",
          station: plan.station,
          pair: plan.pair,
          message: `Aggregate ${plan.station} supplies ${totalRotation.toFixed(1)} deg of total wipe motion; ${Number(plan.requiredRotation || 0).toFixed(1)} deg is required by the selected label and Build Inputs.`
        });
      } else {
        issues.push({
          level: "ok",
          code: "complete-wipe",
          station: plan.station,
          pair: plan.pair,
          message: `Aggregate ${plan.station} follows the paired ${plan.section} wipe path with ${totalRotation.toFixed(1)} deg of total bottle-plate motion and ${plan.directionChanges} direction change(s).`
        });
      }
    });

    const rows = Array.isArray(options.rows) ? options.rows : [];
    const pairExitRules = [
      { pair: "neck", label: "Neck", station: 2 },
      { pair: "body", label: "Body", station: 4 },
      { pair: "back", label: "Back", station: 6 }
    ];

    // The 20-row two-label workbook reference deliberately folds the neck-to-
    // body transfer into its established command layout. The generic 32-row
    // mechanical profile has a separate pair-exit transition and remains
    // subject to this structural rule.
    const usesNonGenericProfile = options.plan?.profileKind === "apl-compact-two-label"
      || options.plan?.profileKind === "apl-map-driven";
    if (!usesNonGenericProfile) pairExitRules.forEach((rule) => {
      const wipeIndex = rows.findIndex((row) => String(row.action || "").includes(`Wipe Turn 2 ${rule.label} - Agg ${rule.station}`));
      if (wipeIndex < 0) return;
      const reference = rows[wipeIndex + 1];
      const transition = rows[wipeIndex + 2];
      const referenceIsValid = Number(reference?.cmd) === 3;
      const transitionIsValid = Number(transition?.cmd) === 7 && !/wipe turn/i.test(String(transition?.action || ""));
      if (!referenceIsValid || !transitionIsValid) {
        issues.push({
          level: "bad",
          code: "pair-exit-transition-merged",
          pair: rule.pair,
          message: `${rule.label} pair exit is invalid: Aggregate ${rule.station} must complete Wipe Turn 2, then use CMD 3 as a reference, followed by a separate CMD 7 transition to the next application area.`
        });
      } else {
        issues.push({
          level: "ok",
          code: "pair-exit-transition-separated",
          pair: rule.pair,
          message: `${rule.label} pair exit is separated correctly: final wipe → CMD 3 reference → independent CMD 7 transition.`
        });
      }
    });

    pairPlans.forEach((pairPlan) => {
      if (!pairPlan.active || !pairPlan.valid) return;
      const members = plans.filter((plan) => plan.pair === pairPlan.pair && plan.active && plan.valid);
      if (members.length < 2) {
        issues.push({
          level: "warn",
          code: "pair-single-active",
          pair: pairPlan.pair,
          message: `${pairPlan.label} pair currently has only Aggregate ${members[0]?.station ?? "?"} operational; its paired routine is retained for the available aggregate.`
        });
        return;
      }

      const [first, second] = members;
      const samePath = arraysEqual(first.relativePath, second.relativePath, tolerance);
      const sameCommands = arraysEqual(first.commandPath, second.commandPath, 0);
      const sameMoves = arraysEqual(first.movePath, second.movePath, tolerance);
      if (!samePath || !sameCommands || !sameMoves) {
        issues.push({
          level: "bad",
          code: "pair-profile-mismatch",
          pair: pairPlan.pair,
          message: `${pairPlan.label} pair mismatch: Aggregates ${first.station} and ${second.station} do not follow the same relative plate path and CMD sequence.`
        });
      } else {
        issues.push({
          level: "ok",
          code: "pair-profile-match",
          pair: pairPlan.pair,
          message: `${pairPlan.label} pair synchronized: Aggregates ${first.station} and ${second.station} use the same relative path and ${first.commandPath.join(" → ")} command routine.`
        });
      }
    });

    return issues;
  }

  global.LabelerMotionValidationDriver = { analyze };
})(window);
