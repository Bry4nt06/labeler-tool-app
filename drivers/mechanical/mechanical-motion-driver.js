(function (global) {
  "use strict";

  const EPSILON = 0.001;
  const PAIRS = [
    { id: "neck", label: "Neck", stations: [1, 2] },
    { id: "body", label: "Body", stations: [3, 4] },
    { id: "back", label: "Back", stations: [5, 6] }
  ];

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function orderedWindow(window) {
    if (!window) return null;
    const start = finite(window.start, NaN);
    const end = finite(window.end, NaN);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return start <= end ? { start, end } : { start: end, end: start };
  }

  function pairForStation(station) {
    return PAIRS.find((pair) => pair.stations.includes(Number(station))) || null;
  }

  function rangeFor(group, rowsLength) {
    if (!group) return null;
    const start = Math.max(0, Number(group.waypointStart));
    const end = Math.min(rowsLength - 1, Number(group.waypointEnd));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return { start, end, transitionEnd: Math.min(rowsLength - 1, end + 1) };
  }

  function profileFromSource(sourceRows, group) {
    const range = rangeFor(group, sourceRows.length);
    if (!range) return null;
    const startAngle = finite(sourceRows[range.start]?.plateAngle, NaN);
    if (!Number.isFinite(startAngle)) return null;
    const relative = [];
    const commands = [];
    for (let index = range.start; index <= range.transitionEnd; index += 1) {
      const angle = finite(sourceRows[index]?.plateAngle, NaN);
      if (!Number.isFinite(angle)) return null;
      relative.push(angle - startAngle);
      if (index <= range.end) commands.push(Number(sourceRows[index]?.cmd) === 7 ? 7 : 3);
    }
    return { ...range, startAngle, relative, commands };
  }

  function setHold(rows, group, holdAngle, reason) {
    const range = rangeFor(group, rows.length);
    if (!range) return;
    for (let index = range.start; index <= range.end; index += 1) {
      rows[index].plateAngle = holdAngle;
      // Preserve the valid profile grammar even when the target angle is held.
      // CMD 7 rows become zero-distance moves, so the servo does not physically
      // rotate but later CMD 3 references are still followed by CMD 7.
      rows[index].cmd = Number(rows[index].cmd) === 7 ? 7 : 3;
      rows[index].motionSource = reason;
      rows[index].relativePlateAngle = 0;
    }
  }

  function movementSummary(profile) {
    const moves = [];
    for (let i = 0; i < profile.commands.length; i += 1) {
      if (profile.commands[i] !== 7) continue;
      moves.push(profile.relative[i + 1] - profile.relative[i]);
    }
    return moves;
  }

  function sameArray(a, b, tolerance = 0.001) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every((value, index) => Math.abs(value - b[index]) <= tolerance);
  }

  function createContinuousProfile(options) {
    const sourceRows = (options.sourceProgram || options.program).map((row) => ({ ...row }));
    const rows = sourceRows.map((row) => ({ ...row }));
    const stationPlans = [];
    const pairPlans = [];
    const issues = [];

    const assemblyByStation = new Map(
      [...options.assemblies]
        .map((assembly) => ({ ...assembly, station: Number(assembly.station) }))
        .map((assembly) => [assembly.station, assembly])
    );

    PAIRS.forEach((pair) => {
      const members = pair.stations.map((station) => {
        const assembly = assemblyByStation.get(station) || { station, enabled: false, type: "none", sides: [] };
        const group = options.stationWindows[station];
        return {
          station,
          assembly,
          group,
          active: Boolean(options.isOperational(assembly)),
          window: orderedWindow(options.contactWindow(assembly)),
          sourceProfile: profileFromSource(sourceRows, group)
        };
      });

      const activeMembers = members.filter((member) => member.active);
      if (!activeMembers.length) {
        members.forEach((member) => {
          const range = rangeFor(member.group, rows.length);
          const hold = range ? finite(rows[Math.max(0, range.start - 1)]?.plateAngle, finite(options.initialPlateAngle, 0)) : finite(options.initialPlateAngle, 0);
          setHold(rows, member.group, hold, "inactive-station-hold");
          stationPlans.push({ station: member.station, section: pair.id, pair: pair.id, active: false, valid: true, requiredRotation: 0 });
        });
        pairPlans.push({ pair: pair.id, label: pair.label, active: false, valid: true, stations: pair.stations });
        return;
      }

      const templateMember = activeMembers.find((member) => member.sourceProfile) || activeMembers[0];
      const canonical = templateMember.sourceProfile;
      if (!canonical) {
        issues.push({ level: "bad", code: "missing-pair-profile", pair: pair.id, message: `${pair.label} pair has no usable Build Inputs servo profile.` });
        pairPlans.push({ pair: pair.id, label: pair.label, active: true, valid: false, stations: pair.stations });
        return;
      }

      const canonicalMoves = movementSummary(canonical);
      const directionChanges = canonicalMoves.slice(1).filter((move, index) => Math.sign(move) !== Math.sign(canonicalMoves[index]) && Math.abs(move) > EPSILON && Math.abs(canonicalMoves[index]) > EPSILON).length;
      const contactRequirement = finite(options.requirement(pair.id), 0);

      members.forEach((member) => {
        const range = rangeFor(member.group, rows.length);
        if (!range) {
          issues.push({ level: "bad", code: "station-layout", station: member.station, pair: pair.id, message: `Aggregate ${member.station} has no usable servo row layout.` });
          return;
        }

        if (!member.active) {
          const hold = finite(rows[Math.max(0, range.start - 1)]?.plateAngle, canonical.startAngle);
          setHold(rows, member.group, hold, "inactive-station-hold");
          stationPlans.push({ station: member.station, section: pair.id, pair: pair.id, active: false, valid: true, requiredRotation: 0 });
          return;
        }

        if (!member.window || member.window.end - member.window.start <= EPSILON) {
          issues.push({ level: "bad", code: "missing-contact-window", station: member.station, pair: pair.id, message: `Aggregate ${member.station} is installed but has no valid mechanical contact window.` });
        }

        // Every aggregate begins at its own application registration angle, but
        // follows the exact same relative path as its paired aggregate. This
        // intentionally permits direction changes and the return/reposition move.
        const stationSource = member.sourceProfile || canonical;
        const stationStart = finite(stationSource.startAngle, canonical.startAngle);
        for (let offset = 0; offset < canonical.relative.length; offset += 1) {
          const index = range.start + offset;
          if (index >= rows.length || index > range.transitionEnd) break;
          rows[index].plateAngle = stationStart + canonical.relative[offset];
          rows[index].pairProfile = pair.id;
          rows[index].pairStation = member.station;
          rows[index].relativePlateAngle = canonical.relative[offset];
          if (offset < canonical.commands.length) rows[index].cmd = canonical.commands[offset];
        }

        for (let index = range.start; index <= range.end; index += 1) {
          rows[index].motionSource = Number(rows[index].cmd) === 7 ? "paired-mechanical-profile" : "paired-reference";
        }

        const tableStart = member.window?.start ?? finite(rows[range.start]?.tableAngle, 0);
        const tableEnd = member.window?.end ?? finite(rows[range.end]?.tableAngle, tableStart);
        const contactDistance = Math.max(EPSILON, tableEnd - tableStart);
        const totalMove = canonicalMoves.reduce((sum, move) => sum + Math.abs(move), 0);
        const maxMove = canonicalMoves.reduce((max, move) => Math.max(max, Math.abs(move)), 0);
        const ratio = maxMove / contactDistance;

        if (ratio >= finite(options.maxRatio, 21)) {
          issues.push({
            level: "bad",
            code: "ratio-fault",
            pair: pair.id,
            station: member.station,
            message: `${pair.label} profile at Aggregate ${member.station} requires a ${maxMove.toFixed(1)} deg move within ${contactDistance.toFixed(1)} deg of table contact (${ratio.toFixed(2)}:1), at or above the ${finite(options.maxRatio, 21).toFixed(1)}:1 fault limit.`
          });
        }

        stationPlans.push({
          station: member.station,
          section: pair.id,
          pair: pair.id,
          active: true,
          valid: Boolean(member.window),
          startPlate: stationStart,
          endPlate: stationStart + canonical.relative[canonical.relative.length - 1],
          requiredRotation: contactRequirement,
          contactDistance,
          ratio,
          relativePath: [...canonical.relative],
          commandPath: [...canonical.commands],
          movePath: [...canonicalMoves],
          totalMove,
          directionChanges
        });
      });

      const activePlans = stationPlans.filter((plan) => plan.pair === pair.id && plan.active);
      const pairMatch = activePlans.length < 2 || activePlans.every((plan) =>
        sameArray(plan.relativePath, activePlans[0].relativePath) &&
        sameArray(plan.commandPath, activePlans[0].commandPath, 0)
      );
      if (!pairMatch) {
        issues.push({ level: "bad", code: "pair-profile-mismatch", pair: pair.id, message: `${pair.label} aggregate pair does not use an identical relative servo path.` });
      }

      pairPlans.push({
        pair: pair.id,
        label: pair.label,
        active: true,
        valid: pairMatch,
        stations: pair.stations,
        activeStations: activePlans.map((plan) => plan.station),
        relativePath: [...canonical.relative],
        commandPath: [...canonical.commands],
        movePath: [...canonicalMoves],
        directionChanges
      });
    });

    // Preserve strict table ordering for animation only; do not alter plate paths.
    for (let index = 1; index < rows.length; index += 1) {
      if (!Number.isFinite(Number(rows[index].tableAngle))) rows[index].tableAngle = finite(rows[index - 1].tableAngle, 0) + EPSILON;
      if (Number(rows[index].tableAngle) <= Number(rows[index - 1].tableAngle)) rows[index].tableAngle = Number(rows[index - 1].tableAngle) + EPSILON;
    }

    return {
      rows,
      stationPlans,
      pairPlans,
      issues,
      finalPlateAngle: finite(rows[rows.length - 1]?.plateAngle, finite(options.initialPlateAngle, 0))
    };
  }

  global.LabelerMechanicalMotionDriver = { createContinuousProfile, orderedWindow, pairForStation, PAIRS };
})(window);
