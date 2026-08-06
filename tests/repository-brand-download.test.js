"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const bottleSpecs = JSON.parse(read("config/default-programs/bottle-specs.json"));
assert.deepEqual(
  bottleSpecs.map((spec) => spec.id),
  [2, 3, 6, 7, 8, 9, 10],
  "Packaged bottle rows 1, 4, and 5 must not remain in the repository catalog."
);
assert.ok(!bottleSpecs.some((spec) => ["LNNR - 7 Oz", "S1NR - 11.2OZ", "HLNR - 12Oz"].includes(spec.bottleType)));

const retirementSource = read("app/default-bottle-spec-retirement-integration.js");
assert.doesNotThrow(() => new vm.Script(retirementSource));
assert.match(retirementSource, /LNNR - 7 Oz/);
assert.match(retirementSource, /S1NR - 11\.2OZ/);
assert.match(retirementSource, /HLNR - 12Oz/);
assert.match(retirementSource, /defaultBottleSpecRetirementV1/);

const brandSource = read("app/repository-brand-download-integration.js");
assert.doesNotThrow(() => new vm.Script(brandSource));

const document = {
  readyState: "loading",
  addEventListener() {},
  getElementById() { return null; },
  querySelector() { return null; }
};
const window = {
  document,
  location: { href: "https://example.test/labeler-tool-staging/" },
  setTimeout() {},
  dispatchEvent() {},
  fetch: async () => { throw new Error("fetch should not run in this unit test"); }
};
const context = vm.createContext({
  window,
  globalThis: window,
  document,
  URL,
  CustomEvent: function CustomEvent(type, options) {
    this.type = type;
    this.detail = options?.detail;
  },
  console
});
vm.runInContext(brandSource, context);

const api = window.LabelerRepositoryBrandDownload;
assert.equal(api.installed, true);
assert.equal(api.SOURCE, "./config/default-programs/label-specs.json");
assert.equal(api.BUTTON_ID, "downloadRepositoryBrands");

const result = api.mergeBrands(
  [
    { id: 1, applicationMode: "apl", brand: "Local Custom", bodyLengthMm: 1 },
    { id: 4, applicationMode: "apl", brand: "Brand A", bodyLengthMm: 10 }
  ],
  [
    { id: 99, applicationMode: "apl", brand: "Brand A", bodyLengthMm: 20 },
    { id: 4, applicationMode: "apl", brand: "Brand B", bodyLengthMm: 30 }
  ]
);

assert.equal(result.added, 1);
assert.equal(result.updated, 1);
assert.equal(result.downloaded, 2);
assert.equal(result.total, 3);
assert.equal(result.items.find((spec) => spec.brand === "Brand A").id, 4, "Updated brands must preserve their existing local id.");
assert.equal(result.items.find((spec) => spec.brand === "Brand A").bodyLengthMm, 20);
assert.equal(result.items.find((spec) => spec.brand === "Brand B").id, 5, "New brands must avoid an existing id collision.");
assert.ok(result.items.some((spec) => spec.brand === "Local Custom"), "Local custom brands must remain untouched.");

const startup = read("app.js");
assert.match(startup, /coder-window-wipe-hold-v22/);
assert.match(startup, /default-bottle-spec-retirement-integration\.js/);
assert.match(startup, /repository-brand-download-integration\.js/);

const worker = read("service-worker.js");
assert.match(worker, /coder-window-wipe-hold-v22/);
assert.match(worker, /default-bottle-spec-retirement-integration\.js/);
assert.match(worker, /repository-brand-download-integration\.js/);
assert.match(worker, /optimizer-post-wipe-coverage-fix-integration\.js/);

console.log("Repository brand download and bottle retirement regression passed.");
