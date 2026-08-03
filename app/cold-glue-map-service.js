"use strict";

function normalizeColdGlueMap(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => ["brush", "brush-channel", "wipe", "roller", "gripper"].includes(item?.kind))
    .map((item) => ({ ...item, kind: item.kind === "wipe" ? "brush" : item.kind }));
}

function coldGlueMapObjects() {
  state.coldGlueMap = normalizeColdGlueMap(state.coldGlueMap);
  return state.coldGlueMap;
}

function resetColdGlueMap() {
  state.coldGlueMap = [];
}

function coldGlueMapRows() {
  return coldGlueMapObjects().flatMap((item) => {
    if (item.kind === "brush-channel") return [
      { name: `${item.name} Outside Start`, angle: Number(item.outerStart), station: null, fixedName: true, update: (value) => { item.outerStart = value; } },
      { name: `${item.name} Outside Stop`, angle: Number(item.outerEnd), station: null, fixedName: true, update: (value) => { item.outerEnd = value; } },
      { name: `${item.name} Inside Start`, angle: Number(item.innerStart), station: null, fixedName: true, update: (value) => { item.innerStart = value; } },
      { name: `${item.name} Inside Stop`, angle: Number(item.innerEnd), station: null, fixedName: true, update: (value) => { item.innerEnd = value; } }
    ];
    if (Number.isFinite(Number(item.angle))) {
      return [{
        name: item.name, angle: Number(item.angle), station: null, fixedName: true,
        update: (value) => { item.angle = value; }
      }];
    }
    return [
      { name: `${item.name} Start`, angle: Number(item.start), station: null, fixedName: true, update: (value) => { item.start = value; } },
      { name: `${item.name} Stop`, angle: Number(item.end), station: null, fixedName: true, update: (value) => { item.end = value; } }
    ];
  });
}

function coldGlueMapValue(id, field, fallback) {
  const item = coldGlueMapObjects().find((entry) => entry.id === id);
  return num(item?.[field], fallback);
}

function mapPointAngle(pattern, fallback = 0) {
  const dynamicPoint = applicationMapPointRows().find((point) => pattern.test(point.name));
  if (dynamicPoint && Number.isFinite(Number(dynamicPoint.angle))) return Number(dynamicPoint.angle);
  return state.mapPoints.find((point) => pattern.test(point.name))?.angle ?? fallback;
}

function finishAngle(value) {
  return Number.isFinite(value) ? Math.round(value * 2) / 2 : null;
}
