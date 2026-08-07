"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const bottleSource = fs.readFileSync(path.join(root, "app", "bottle-visual-renderer.js"), "utf8");
const mapSource = fs.readFileSync(path.join(root, "app", "mechanical-map-scene-renderer.js"), "utf8");
const simulationSource = fs.readFileSync(path.join(root, "app", "simulation-map-scene-renderer.js"), "utf8");
const animationSource = fs.readFileSync(path.join(root, "app", "map-animation-renderer.js"), "utf8");
const bootstrapSource = fs.readFileSync(path.join(root, "app", "bootstrap.js"), "utf8");

assert.doesNotThrow(() => new vm.Script(bottleSource, { filename: "bottle-visual-renderer.js" }));
assert.doesNotThrow(() => new vm.Script(mapSource, { filename: "mechanical-map-scene-renderer.js" }));
assert.doesNotThrow(() => new vm.Script(simulationSource, { filename: "simulation-map-scene-renderer.js" }));
assert.doesNotThrow(() => new vm.Script(animationSource, { filename: "map-animation-renderer.js" }));

assert.match(bottleSource, /drawTopViewBottleStructure/);
assert.match(bottleSource, /data-bottle-view/);
assert.match(bottleSource, /data-bottle-top-view-shoulder/);
assert.match(bottleSource, /data-bottle-top-view-neck/);
assert.match(bottleSource, /topViewBottleV1:\s*true/);
assert.match(bottleSource, /neck:\s*Object\.freeze\(\{\s*center:\s*0/);
assert.match(bottleSource, /body:\s*Object\.freeze\(\{\s*center:\s*0/);
assert.match(bottleSource, /back:\s*Object\.freeze\(\{\s*center:\s*180/);

assert.match(bottleSource, /function drawBottleTableVisual\(/);
assert.match(bottleSource, /data-bottle-table-visual/);
assert.match(bottleSource, /data-bottle-table-guide-track/);
assert.match(bottleSource, /data-bottle-table-face/);
assert.match(bottleSource, /data-bottle-table-pocket/);
assert.match(bottleSource, /data-animation-pocket/);
assert.match(bottleSource, /premiumBottleTableV1:\s*true/);
assert.match(bottleSource, /recipeSizedLabelBandsV1:\s*true/);
assert.match(bottleSource, /synchronizedBottlePocketsV1:\s*true/);
assert.match(bottleSource, /amberBottleBlueCapV1:\s*true/);
assert.match(bottleSource, /sectionWipePlan\(section\)\?\.labelDeg/);
assert.match(bottleSource, /stroke-linecap":\s*"round"/);
assert.match(bottleSource, /body:\s*"#6f3b20"/);
assert.match(bottleSource, /cap:\s*"#2d9cff"/);

assert.match(
  mapSource,
  /drawBottleTableVisual\(add, svg, state\.radius, bottleHeads\)/,
  "Mechanical Map must render the shared premium bottle table."
);
assert.match(
  simulationSource,
  /drawBottleTableVisual\(add, svg, state\.radius, bottleHeads\)/,
  "Servo Simulation must render the same premium bottle table."
);
assert.match(
  mapSource,
  /drawTopViewBottle\(add, bottle, head\.tableAngle\)/,
  "Mechanical Map must use the complete shared top-view bottle renderer."
);
assert.match(
  simulationSource,
  /drawTopViewBottle\(add, bottle, head\.tableAngle\)/,
  "Servo Simulation must use the same complete shared top-view bottle renderer."
);
assert.match(animationSource, /querySelectorAll\("\[data-animation-pocket\]"\)/);
assert.match(animationSource, /headsByNumber/);
assert.match(animationSource, /node\.setAttribute\("transform", `translate\(\$\{head\.x\} \$\{head\.y\}\)`\)/);
assert.match(animationSource, /synchronizedBottlePocketsV1:\s*true/);
assert.match(bootstrapSource, /bottle-pocket-sync-20260807-1223/);

const elements = [];
const group = {
  attributes: {},
  setAttribute(name, value) { this.attributes[name] = String(value); }
};
const context = {
  window: null,
  state: { previewBottleAngle: null },
  selectedLabelApplicationState() { return { neck: true, body: true, back: true }; },
  activeAggregateDefinitions() {
    return [
      { number: 1, angle: 10 },
      { number: 3, angle: 20 },
      { number: 5, angle: 30 }
    ];
  },
  labelSectionForStation(station) { return ({ 1: "neck", 3: "body", 5: "back" })[station]; },
  sectionWipePlan(section) {
    return { labelDeg: ({ neck: 62, body: 127, back: 96 })[section] };
  },
  norm(value) { return ((Number(value) % 360) + 360) % 360; },
  currentProgram() { return []; },
  plateAngleAt() { return 0; },
  console
};
context.window = context;
vm.createContext(context);
vm.runInContext(bottleSource, context, { filename: "bottle-visual-renderer.js" });

const add = (name, attrs, parent) => {
  const element = { name, attrs, parent };
  elements.push(element);
  return element;
};

context.drawTopViewBottle(add, group, 40);

assert.equal(group.attributes["data-bottle-view"], "top");
assert.ok(elements.some((element) => element.attrs?.["data-bottle-top-view-body"] === "true" && element.attrs.fill === "#6f3b20"));
assert.ok(elements.some((element) => element.attrs?.["data-bottle-top-view-shoulder"] === "true"));
assert.ok(elements.some((element) => element.attrs?.["data-bottle-top-view-neck"] === "true"));
assert.ok(elements.some((element) => element.attrs?.["data-bottle-top-view-cap"] === "true" && element.attrs.fill === "#2d9cff"));
const labelBands = elements.filter((element) => element.attrs?.["data-bottle-label-indicator"]);
assert.equal(labelBands.length, 3);
assert.equal(labelBands.find((element) => element.attrs["data-bottle-label-indicator"] === "body").attrs["data-bottle-label-arc-deg"], 127);
assert.equal(labelBands.find((element) => element.attrs["data-bottle-label-indicator"] === "neck").attrs.stroke, "#ff8a32");
assert.equal(labelBands.find((element) => element.attrs["data-bottle-label-indicator"] === "body").attrs.stroke, "#4ca8ff");
assert.equal(labelBands.find((element) => element.attrs["data-bottle-label-indicator"] === "back").attrs.stroke, "#71d34f");

const tableElementsStart = elements.length;
context.drawBottleTableVisual(add, { kind: "svg" }, 150, [
  { head: 1, x: 0, y: -150 },
  { head: 2, x: 150, y: 0 }
]);
const tableElements = elements.slice(tableElementsStart);
assert.ok(tableElements.some((element) => element.attrs?.["data-bottle-table-visual"] === "premium-v1"));
assert.ok(tableElements.some((element) => element.attrs?.["data-bottle-table-face"] === "true"));
assert.ok(tableElements.some((element) => element.attrs?.["data-bottle-table-guide-track"] === "true"));
const pockets = tableElements.filter((element) => element.attrs?.["data-bottle-table-pocket"]);
assert.equal(pockets.length, 2);
assert.deepEqual(pockets.map((element) => element.attrs["data-animation-pocket"]), ["1", "2"]);

console.log("ServoForge synchronized bottle pockets, amber bottles, blue caps, and premium table regression passed.");