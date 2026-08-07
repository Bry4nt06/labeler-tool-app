"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,".."),read=r=>fs.readFileSync(path.join(root,r),"utf8");
const a=read("app/assembly-map-renderer.js"),m=read("app/mechanical-map-scene-renderer.js"),s=read("app/simulation-map-scene-renderer.js");
assert.doesNotThrow(()=>new vm.Script(a)); assert.match(a,/WIPE_DOWN_PAD_WIDTH_MM = 22/); assert.match(a,/servoforge-wipe-sponge-pattern/); assert.match(a,/function machineTrailingPadPath/); assert.match(a,/innerTrailingStart = start \+ bevelDeg/); assert.match(a,/const d = machineTrailingPadPath/); assert.match(a,/against-machine-direction/); assert.doesNotMatch(a,/function machineForwardPadPath/); assert.doesNotMatch(a,/"data-bevel-facing": "machine-forward"/); assert.match(a,/servoforge-roller-sponge-pattern/); assert.match(a,/data-roller-hub/); assert.match(m,/drawSpongeRoller\(add, equipmentLayer/); assert.match(s,/drawConfiguredAssemblies\(add, configuredAssemblyLayer\)/);
console.log("Authoritative reverse-bevel sponge wipe and roller visual regression passed.");
