(function (global) {
  "use strict";

  const STATION_WINDOWS = Object.freeze({
    1: { waypointStart: 1, waypointEnd: 4, moveStart: 1, moveEnd: 4 },
    2: { waypointStart: 5, waypointEnd: 9, moveStart: 5, moveEnd: 8 },
    3: { waypointStart: 11, waypointEnd: 15, moveStart: 11, moveEnd: 14 },
    4: { waypointStart: 16, waypointEnd: 20, moveStart: 16, moveEnd: 19 },
    5: { waypointStart: 21, waypointEnd: 25, moveStart: 21, moveEnd: 24 },
    6: { waypointStart: 26, waypointEnd: 30, moveStart: 26, moveEnd: 29 }
  });

  const COMMANDS = Object.freeze([
    [3, "Zero Line"],
    [3, "Hold for Neck Application - Agg 1"],
    [7, "Wipe Turn 1 Neck - Agg 1"],
    [3, "Wipe Hold Neck - Agg 1"],
    [7, "Wipe Turn 2 Neck - Agg 1"],
    [3, "Hold for Neck Application - Agg 2"],
    [7, "Wipe Turn 1 Neck - Agg 2"],
    [3, "Wipe Hold Neck - Agg 2"],
    [7, "Wipe Turn 2 Neck - Agg 2"],
    [3, "Wipe Complete Reference - Neck Pair"],
    [7, "Transition Neck Pair to Body Application"],
    [3, "Hold for Body Application - Agg 3"],
    [7, "Wipe Turn 1 Body - Agg 3"],
    [7, "Wipe Turn 2 Body - Agg 3"],
    [3, "Wipe Hold Body - Agg 3"],
    [7, "Turn For Body Application - Agg 4"],
    [3, "Hold for Body Application - Agg 4"],
    [7, "Wipe Turn 1 Body - Agg 4"],
    [7, "Wipe Turn 2 Body - Agg 4"],
    [3, "Wipe Hold Body - Agg 4"],
    [7, "Turn For Back Application - Agg 5"],
    [3, "Hold For Back Application - Agg 5"],
    [7, "Wipe Turn 1 Back - Agg 5"],
    [7, "Wipe Turn 2 Back - Agg 5"],
    [3, "Wipe Hold Back - Agg 5"],
    [7, "Turn For Back Application - Agg 6"],
    [3, "Hold For Back Application - Agg 6"],
    [7, "Wipe Turn 1 Back - Agg 6"],
    [7, "Wipe Turn 2 Back - Agg 6"],
    [3, "Wipe Hold Back - Agg 6"],
    [7, "Turn for Back Label Inspection & Coding"],
    [3, "Hold for Back Label Inspection & Coding"]
  ]);

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }


  function requiredPairExitPadding(options = {}) {
    const moveRotation = Math.abs(finite(options.moveRotation, 0));
    const maxRatio = Math.max(1, finite(options.maxRatio, 21));
    const margin = Math.min(0.99, Math.max(0.5, finite(options.margin, 0.95)));
    const roller4Offset = finite(options.roller4Offset, -4.5);
    const configuredPadding = Math.max(0, finite(options.configuredPadding, 2));
    const required = Math.max(0, moveRotation / (maxRatio * margin) + roller4Offset);
    const increment = Math.max(0.1, finite(options.roundingIncrement, 0.5));
    return Math.ceil(Math.max(configuredPadding, required) / increment) * increment;
  }

  function createTableAngles(options = {}) {
    const point = options.mapPointAngle;
    const pad = options.padProfileTableAngles;
    const timing = options.timing || {};
    const scale = typeof options.scaleAngle === "function" ? options.scaleAngle : (value) => value;
    if (typeof point !== "function" || typeof pad !== "function") throw new TypeError("APL profile driver requires mapPointAngle and padProfileTableAngles callbacks.");

    const raw = [
      0,
      point(/Agg 1 (?:Spender|Pallet)/i) - finite(timing.spenderArriveEarly, 1),
      point(/Agg 1 Roller 2/i) + finite(timing.neckRoller2Offset, -4.5),
      point(/Agg 1 Roller 3/i) + finite(timing.neckRoller3Offset, -5.5),
      point(/Agg 1 Roller 4/i) + finite(timing.neckRoller4Offset, -4.5),
      point(/Agg 2 (?:Spender|Pallet)/i) - finite(timing.spenderArriveEarly, 1),
      point(/Agg 2 Roller 2/i) + finite(timing.neckRoller2Offset, -4.5),
      point(/Agg 2 Roller 3/i) + finite(timing.neckRoller3Offset, -5.5),
      point(/Agg 2 Roller 4/i) + finite(timing.neckRoller4Offset, -4.5),
      point(/Agg 2 Roller 4/i) + finite(timing.pairExitReferencePadding, 2),
      point(/Agg 2 Roller 4/i) + finite(timing.pairExitReferencePadding, 2) + 0.5,
      point(/Agg 3 (?:Spender|Pallet)/i) - finite(timing.spenderArriveEarly, 1),
      ...pad(3),
      point(/Agg 4 (?:Spender|Pallet)/i) - finite(timing.spenderArriveEarly, 1),
      ...pad(4),
      point(/Agg 5 (?:Spender|Pallet)/i) - finite(timing.spenderArriveEarly, 1),
      ...pad(5),
      point(/Agg 6 (?:Spender|Pallet)/i) - finite(timing.spenderArriveEarly, 1),
      ...pad(6),
      point(/Back Label.*Start/i) - finite(timing.backInspectArriveEarly, 1)
    ];
    return raw.map(scale);
  }

  function createTemplate(options = {}) {
    const tableAngles = createTableAngles(options);
    return COMMANDS.map(([cmd, action], index) => ({
      hmi: index + 1,
      plc: index,
      cmd,
      tableAngle: tableAngles[index],
      plateAngle: null,
      action,
      profileSource: "apl-profile-driver"
    }));
  }

  global.LabelerAplProfileDriver = Object.freeze({
    stationWindows: STATION_WINDOWS,
    createTableAngles,
    createTemplate,
    requiredPairExitPadding
  });
})(window);
