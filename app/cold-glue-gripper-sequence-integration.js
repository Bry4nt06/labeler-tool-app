"use strict";
(function installColdGlueThreeGripperSequence() {
const RETRY_MS = 50;
const EPSILON = 0.001;
const FULL_CYCLE = 360;
const SECTIONS = ["neck", "body", "back"];
const DEFAULT_APPLICATION_ANGLES = Object.freeze({ neck: 0, body: 0, back: 180 });
const DEFAULT_ENTRY_OFFSET = 90;
const DEFAULT_NECK_PRESS_TABLE_DEG = 4;
const SEQUENCE_VERSION = 1;
let installed = false;
let decoratePending = false;
let mapObserver = null;
function finite(value, fallback = 0) {
const parsed = Number(value);
return Number.isFinite(parsed) ? parsed : fallback;
}
function norm(value) {
const parsed = finite(value, 0) % FULL_CYCLE;
return parsed < 0 ? parsed + FULL_CYCLE : parsed;
}
function finish(value) {
return typeof finishAngle === "function"
? finishAngle(value)
: Math.round(finite(value, 0) * 10) / 10;
}
function nearestEquivalent(target, reference) {
const base = finite(target, 0);
const current = finite(reference, base);
return base + FULL_CYCLE * Math.round((current - base) / FULL_CYCLE);
}
function activeMap() {
try {
return typeof activeMachineMap === "function" ? activeMachineMap() : null;
} catch {
return null;
}
}
function isColdGlueObject(item) {
return item?.application === "cold-glue"
|| ["brush", "brush-channel", "gripper", "pallet"].includes(String(item?.kind || ""));
}
function objectAngle(item) {
if (["gripper", "pallet", "roller", "sensor"].includes(String(item?.kind || ""))) {
return norm(finite(item?.angle, finite(item?.start, 0)));
}
if (item?.kind === "brush-channel") {
return norm(Math.min(
finite(item?.outerStart, finite(item?.start, 0)),
finite(item?.innerStart, finite(item?.start, 0))
));
}
return norm(finite(item?.start, finite(item?.angle, 0)));
}
function sortedGrippers(map) {
return (Array.isArray(map?.objects) ? map.objects : [])
.filter((item) => isColdGlueObject(item) && ["gripper", "pallet"].includes(String(item?.kind || "")))
.sort((left, right) => objectAngle(left) - objectAngle(right));
}
function precedingGripper(grippers, angle) {
if (!grippers.length) return null;
const position = norm(angle);
let owner = grippers[grippers.length - 1];
for (const gripper of grippers) {
if (objectAngle(gripper) <= position + EPSILON) owner = gripper;
else break;
}
return owner;
}
function setValue(target, key, value) {
if (target[key] === value) return false;
target[key] = value;
return true;
}
function normalizeGripperSequence(map) {
if (!map || map.applicationMode !== "cold-glue" || !Array.isArray(map.objects)) return false;
const grippers = sortedGrippers(map).slice(0, 3);
if (!grippers.length) return false;
let changed = false;
const gripperBySection = new Map();
map.aggregateAngles = map.aggregateAngles && typeof map.aggregateAngles === "object" ? map.aggregateAngles : {};
map.stationAngles = map.stationAngles && typeof map.stationAngles === "object" ? map.stationAngles : {};
grippers.forEach((gripper, index) => {
const section = SECTIONS[index];
if (!section) return;
const station = index + 1;
const applicationAngle = DEFAULT_APPLICATION_ANGLES[section];
const entryAngle = applicationAngle + DEFAULT_ENTRY_OFFSET;
changed = setValue(gripper, "application", "cold-glue") || changed;
changed = setValue(gripper, "station", station) || changed;
changed = setValue(gripper, "labelSection", section) || changed;
changed = setValue(gripper, "applicationPlateAngleDeg", applicationAngle) || changed;
if (!Number.isFinite(Number(gripper.brushEntryPlateAngleDeg)) || Number(map.coldGlueGripperSequenceVersion) < SEQUENCE_VERSION) {
changed = setValue(gripper, "brushEntryPlateAngleDeg", entryAngle) || changed;
}
if (!Number.isFinite(Number(gripper.alignmentLeadTableDeg))) {
changed = setValue(gripper, "alignmentLeadTableDeg", Math.max(0.5, 360 / Math.max(1, finite(map.headCount, 60)))) || changed;
}
if (section === "neck") {
if (!Number.isFinite(Number(gripper.neckOverWipeMm))) changed = setValue(gripper, "neckOverWipeMm", 5) || changed;
if (!Number.isFinite(Number(gripper.neckPressTableDeg)) || Number(map.coldGlueGripperSequenceVersion) < SEQUENCE_VERSION) {
changed = setValue(gripper, "neckPressTableDeg", DEFAULT_NECK_PRESS_TABLE_DEG) || changed;
}
if (!gripper.neckWipeOrder) changed = setValue(gripper, "neckWipeOrder", "left-right") || changed;
}
const angle = objectAngle(gripper);
if (finite(map.aggregateAngles[String(station)], NaN) !== angle) {
map.aggregateAngles[String(station)] = angle;
changed = true;
}
if (finite(map.stationAngles[String(station)], NaN) !== angle) {
map.stationAngles[String(station)] = angle;
changed = true;
}
gripperBySection.set(section, gripper);
});
const orderedGrippers = grippers.slice();
map.objects.forEach((item) => {
if (!isColdGlueObject(item) || orderedGrippers.includes(item) || item.kind === "coding") return;
const explicitSection = SECTIONS.includes(String(item.labelSection)) ? String(item.labelSection) : null;
const owner = explicitSection ? gripperBySection.get(explicitSection) : precedingGripper(orderedGrippers, objectAngle(item));
if (!owner) return;
const section = String(owner.labelSection);
changed = setValue(item, "application", "cold-glue") || changed;
changed = setValue(item, "station", Number(owner.station)) || changed;
if (!explicitSection || item.labelSection === "auto") changed = setValue(item, "labelSection", section) || changed;
if (section === "neck" && item.kind === "brush") {
if (!item.neckWipeSide || item.neckWipeSide === "none") {
changed = setValue(item, "neckWipeSide", item.side === "inner" ? "right" : "left") || changed;
}
if (typeof item.pressLooseSide !== "boolean") changed = setValue(item, "pressLooseSide", true) || changed;
}
if (section === "neck" && item.kind === "brush-channel") {
if (!item.outerNeckWipeSide || item.outerNeckWipeSide === "none") changed = setValue(item, "outerNeckWipeSide", "left") || changed;
if (!item.innerNeckWipeSide || item.innerNeckWipeSide === "none") changed = setValue(item, "innerNeckWipeSide", "right") || changed;
if (typeof item.pressLooseSides !== "boolean") changed = setValue(item, "pressLooseSides", true) || changed;
}
});
const count = Math.min(3, grippers.length);
const enabled = Array.from({ length: 6 }, (_, index) => index < count);
if (JSON.stringify(map.enabledAggregates) !== JSON.stringify(enabled)) {
map.enabledAggregates = enabled;
changed = true;
}
if (JSON.stringify(map.enabledStations) !== JSON.stringify(enabled)) {
map.enabledStations = enabled;
changed = true;
}
changed = setValue(map, "aggregateCount", count) || changed;
changed = setValue(map, "stationCount", count) || changed;
changed = setValue(map, "coldGlueGripperSequenceVersion", SEQUENCE_VERSION) || changed;
if (changed) {
try { if (typeof syncApplicationMapToLegacyState === "function") syncApplicationMapToLegacyState(); } catch { }
try { if (typeof saveCurrentSettings === "function") saveCurrentSettings(); } catch { }
}
return changed;
}
function gripperForSection(map, section) {
return sortedGrippers(map).find((item) => String(item.labelSection) === section) || null;
}
function applicationReferenceRow(row) {
return Number(row?.cmd) === 3 && /Application.*Reference/i.test(String(row?.action || ""));
}
function applyExplicitApplicationTargets(rows, map) {
const output = rows.map((row) => ({ ...row }));
output.forEach((row) => {
const section = String(row?.section || "");
const gripper = gripperForSection(map, section);
if (!gripper) return;
if (applicationReferenceRow(row)) {
row.plateAngle = finish(nearestEquivalent(gripper.applicationPlateAngleDeg, row.plateAngle));
row.gripperSectionReference = true;
}
if (row?.brushEntryAlignment && Number(row?.cmd) === 3) {
row.plateAngle = finish(nearestEquivalent(gripper.brushEntryPlateAngleDeg, row.plateAngle));
row.gripperBrushEntryReference = true;
}
});
return output;
}
function applyNeckBrushEntry(rows, map) {
const output = rows.map((row) => ({ ...row }));
const gripper = gripperForSection(map, "neck");
if (!gripper) return output;
const neckIndexes = output
.map((row, index) => row?.coldGlueNeckTwoSideWipe ? index : -1)
.filter((index) => index >= 0);
if (!neckIndexes.length) return output;
const first = neckIndexes[0];
const last = neckIndexes[neckIndexes.length - 1];
const applicationIndex = neckIndexes.find((index) => output[index]?.brushStage === "gripper-application");
const pressIndex = neckIndexes.find((index) => output[index]?.brushStage === "press-both-sides");
if (applicationIndex === undefined || pressIndex === undefined) return output;
const center = nearestEquivalent(finite(gripper.applicationPlateAngleDeg, 0), finite(output[applicationIndex]?.plateAngle, 0));
const entry = nearestEquivalent(finite(gripper.brushEntryPlateAngleDeg, center + DEFAULT_ENTRY_OFFSET), center);
output[applicationIndex] = {
...output[applicationIndex],
cmd: 7,
plateAngle: finish(center),
action: `Turn Neck Label from Gripper Centerline to ${finish(norm(entry))}° Brush Entry - Agg ${gripper.station}`,
brushStage: "gripper-to-brush-entry",
plannedRotation: entry - center,
gripperTableAngle: finish(objectAngle(gripper))
};
output[pressIndex] = {
...output[pressIndex],
cmd: 3,
plateAngle: finish(entry),
holdAngle: finish(entry),
action: `Press Both Loose Neck Label Sides Down at ${finish(norm(entry))}° - Agg ${gripper.station}`
};
let current = entry;
for (let index = pressIndex + 1; index <= last; index += 1) {
const row = output[index];
if (Number(row?.cmd) === 7 && Number.isFinite(Number(row?.plannedRotation))) {
row.plateAngle = finish(current);
} else if (Number(row?.cmd) === 3 && /-complete$/.test(String(row?.brushStage || "")) && Number.isFinite(Number(row?.plannedRotation))) {
current += Number(row.plannedRotation);
row.plateAngle = finish(current);
} else if (Number(row?.cmd) === 3) {
row.plateAngle = finish(current);
}
}
output[first] = { ...output[first], gripperSequenceSection: "neck" };
return output;
}
function normalizeCommandContinuity(rows) {
const output = rows.map((row) => ({ ...row }));
if (!output.length) return output;
let current = finite(output[0]?.plateAngle, 0);
output[0].plateAngle = finish(current);
for (let index = 1; index < output.length; index += 1) {
const row = output[index];
const previous = output[index - 1];
if (Number(row.cmd) === 7) {
row.plateAngle = finish(current);
const next = output[index + 1];
if (next && Number(next.cmd) === 3 && Math.abs(finite(next.plateAngle, current) - current) <= EPSILON) {
row.cmd = 3;
row.action = String(row.action || "Hold").replace(/\s*-\s*Turn$/i, " - Hold");
row.zeroMoveConvertedToHold = true;
}
} else if (Number(row.cmd) === 3) {
if (Number(previous?.cmd) === 7) {
current = finite(row.plateAngle, current);
} else if (Math.abs(finite(row.plateAngle, current) - current) > EPSILON) {
row.plateAngle = finish(current);
row.silentRestMoveRemoved = true;
} else {
row.plateAngle = finish(current);
}
}
}
return output.map((row, index) => ({ ...row, hmi: index + 1, plc: index }));
}
function postProcess(rows, map) {
let output = applyExplicitApplicationTargets(rows, map);
output = applyNeckBrushEntry(output, map);
output = normalizeCommandContinuity(output);
if (state?.motionPlan?.mapDriven) {
state.motionPlan.rows = output;
state.motionPlan.gripperSequence = sortedGrippers(map).slice(0, 3).map((gripper, index) => ({
order: index + 1,
section: gripper.labelSection,
station: gripper.station,
tableAngle: objectAngle(gripper),
applicationPlateAngleDeg: finite(gripper.applicationPlateAngleDeg, DEFAULT_APPLICATION_ANGLES[gripper.labelSection] || 0),
brushEntryPlateAngleDeg: finite(gripper.brushEntryPlateAngleDeg, 90)
}));
}
return output;
}
function refreshMotion() {
try { if (typeof syncApplicationMapToLegacyState === "function") syncApplicationMapToLegacyState(); } catch { }
try { if (typeof applyGeneratedServoProfile === "function") applyGeneratedServoProfile(); } catch { }
try { if (typeof saveCurrentSettings === "function") saveCurrentSettings(); } catch { }
try { if (typeof render === "function") render(); } catch { }
}
function decorateGrippers() {
decoratePending = false;
const map = activeMap();
const list = document.querySelector("#wipeBuilderList");
if (!map || map.applicationMode !== "cold-glue" || !list) return;
normalizeGripperSequence(map);
const grippers = sortedGrippers(map).slice(0, 3);
grippers.forEach((gripper, index) => {
const row = list.querySelector(`.wipe-builder-row[data-builder-object-id="${CSS.escape(String(gripper.id))}"]`);
const grid = row?.querySelector(".cold-glue-process-parameters .cold-glue-parameter-grid");
if (!grid) return;
let badge = row.querySelector(".cold-glue-gripper-order-badge");
if (!badge) {
badge = document.createElement("div");
badge.className = "cold-glue-gripper-order-badge";
grid.parentElement?.insertBefore(badge, grid);
}
badge.textContent = `Application Gripper ${index + 1} • ${String(gripper.labelSection || "").toUpperCase()}`;
if (!grid.querySelector('[data-cold-glue-sequence-param="brushEntryPlateAngleDeg"]')) {
const label = document.createElement("label");
label.innerHTML = `Bottle angle entering brushes<input data-cold-glue-sequence-param="brushEntryPlateAngleDeg" type="number" step="0.1" value="${finish(finite(gripper.brushEntryPlateAngleDeg, 90))}"><small>Reached after the label leaves this gripper and before physical brush contact begins.</small>`;
grid.appendChild(label);
}
});
}
function scheduleDecorate() {
if (decoratePending) return;
decoratePending = true;
window.requestAnimationFrame(decorateGrippers);
}
function bindSequenceControls() {
if (document.documentElement.dataset.coldGlueGripperSequenceBound === "true") return;
document.documentElement.dataset.coldGlueGripperSequenceBound = "true";
const apply = (event) => {
const control = event.target.closest?.("[data-cold-glue-sequence-param]");
if (!control) return;
const row = control.closest(".wipe-builder-row[data-builder-object-id]");
const map = activeMap();
const item = map?.objects?.find((entry) => String(entry.id) === String(row?.dataset.builderObjectId));
if (!item) return;
item[control.dataset.coldGlueSequenceParam] = finite(control.value, item[control.dataset.coldGlueSequenceParam]);
refreshMotion();
scheduleDecorate();
};
document.addEventListener("input", apply);
document.addEventListener("change", apply);
}
function installStyles() {
if (document.querySelector("#coldGlueGripperSequenceStyles")) return;
const style = document.createElement("style");
style.id = "coldGlueGripperSequenceStyles";
style.textContent = `.cold-glue-gripper-order-badge{margin:0 0 7px;padding:6px 8px;border:1px solid var(--green);border-radius:6px;background:color-mix(in srgb,var(--panel) 82%,var(--green) 18%);color:var(--green);font-size:9px;font-weight:900;letter-spacing:.04em}`;
document.head.appendChild(style);
}
function wrapGenerator() {
const original = window.generatedColdGlueFixedProfile;
if (typeof original !== "function" || original.coldGlueThreeGripperWrapped) return false;
const wrapped = function generatedColdGlueThreeGripperProfile(...args) {
const map = activeMap();
if (map?.applicationMode === "cold-glue") normalizeGripperSequence(map);
const rows = original.apply(this, args);
return map?.applicationMode === "cold-glue" ? postProcess(rows, map) : rows;
};
wrapped.coldGlueThreeGripperWrapped = true;
wrapped.originalGenerator = original;
window.generatedColdGlueFixedProfile = wrapped;
try { generatedColdGlueFixedProfile = wrapped; } catch { }
return true;
}
function install() {
if (installed) return true;
if (typeof state === "undefined" || typeof window.generatedColdGlueFixedProfile !== "function") return false;
if (!wrapGenerator()) return false;
installStyles();
bindSequenceControls();
normalizeGripperSequence(activeMap());
const list = document.querySelector("#wipeBuilderList");
if (list && !mapObserver) {
mapObserver = new MutationObserver(scheduleDecorate);
mapObserver.observe(list, { childList: true, subtree: true });
}
scheduleDecorate();
installed = true;
return true;
}
function wait() {
if (install()) return;
window.setTimeout(wait, RETRY_MS);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wait, { once: true });
else wait();
})();
