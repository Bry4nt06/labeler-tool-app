"use strict";

(function installMapDefaultsService(global) {
  function defaultAplMapObjects() {
    const objects = [];
    defaultAssemblies.map(normalizeAssembly).forEach((assembly) => {
      if (!assembly.enabled || assembly.type === "none") return;
      assembly.sides.forEach((side) => {
        const angles = assembly.type === "rollers"
          ? (side === "inner" ? assembly.innerRollerAngles : assembly.outerRollerAngles)
          : padAnglesForSide(assembly, side);
        if (assembly.type === "rollers") {
          angles.forEach((angle, index) => {
            objects.push({
              id: `apl-station-${assembly.station}-${side}-roller-${index + 1}`,
              name: `Station ${assembly.station} ${side === "inner" ? "Inside" : "Outside"} Roller ${index + 1}`,
              station: assembly.station,
              kind: "roller",
              side,
              start: Number(angle),
              wipeSpanDeg: 10,
              extension: 20
            });
          });
          return;
        }
        objects.push({
          id: `apl-station-${assembly.station}-${side}`,
          name: `Station ${assembly.station} ${side === "inner" ? "Inside" : "Outside"} ${assembly.type === "rollers" ? "Rollers" : "Wipe-Down Pad"}`,
          station: assembly.station,
          kind: assembly.type === "rollers" ? "roller" : "pad",
          side,
          start: Number(angles[0]),
          end: Number(angles[1]),
          extension: 20
        });
      });
    });
    return objects;
  }

  function defaultAplStationAngles() {
    return Object.fromEntries(
      defaultAssemblies.map((assembly) => [String(assembly.station), Number(assembly.spenderAngle)])
    );
  }

  function defaultAplAggregateAngles() {
    return Object.fromEntries(
      defaultAssemblies.map((assembly) => [String(assembly.station), Number(assembly.spenderAngle)])
    );
  }

  global.defaultAplMapObjects = defaultAplMapObjects;
  global.defaultAplStationAngles = defaultAplStationAngles;
  global.defaultAplAggregateAngles = defaultAplAggregateAngles;
  global.LabelerMapDefaultsService = Object.freeze({
    defaultAplMapObjects,
    defaultAplStationAngles,
    defaultAplAggregateAngles
  });
})(typeof window !== "undefined" ? window : globalThis);
