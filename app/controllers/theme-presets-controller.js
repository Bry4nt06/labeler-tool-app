"use strict";

(function installThemePresetsController(global) {
  if (global.LabelerThemePresetsController?.installed) return;

  const STYLE_ID = "servoforgeExpandedThemeStyles";
  const presets = Object.freeze([
    { value: "red-black", label: "Carbon Crimson" },
    { value: "dark-gold", label: "Carbon Brass" },
    { value: "burnt-orange", label: "Graphite Copper" },
    { value: "forge-gradient", label: "Midnight Alloy" }
  ]);

  function installOptions() {
    const select = document.querySelector("#themePreset");
    if (!select) return false;
    const lightOption = [...select.options].find((option) => option.value === "light") || null;
    presets.forEach(({ value, label }) => {
      const existing = [...select.options].find((option) => option.value === value);
      if (existing) {
        existing.textContent = label;
        return;
      }
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.insertBefore(option, lightOption);
    });
    return true;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return false;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      body[data-theme="red-black"] {
        --bg: #0b0e12;
        --bg-a: #07090c;
        --bg-b: #11161c;
        --bg-glow: rgba(132, 51, 63, 0.07);
        --panel: #14181d;
        --panel-hi: #1c2228;
        --line: #303842;
        --input: #0a0e12;
        --ink: #e7ebef;
        --muted: #97a1ab;
        --green: #a45a63;
        --green-dark: #623740;
        --blue: #7e919f;
        --amber: #a18862;
        --red: #b25e66;
        --fill: #251a1f;
        --btn-a: #4b2b31;
        --btn-b: #2c1c20;
        --btn-hover-a: #60363e;
        --btn-hover-b: #382329;
        --panel-accent: rgba(164, 90, 99, 0.2);
        --accent: #a45a63;
        --map-shell: #080b0f;
        --map-surface: #11171d;
        --map-ring: #46525d;
        --map-head-fill: #21181d;
        --map-head-stroke: #a45a63;
        --map-label: #c5cdd3;
        --map-text: #edf1f4;
        --map-muted: #929da6;
        --map-readout: #171b20;
      }

      body[data-theme="dark-gold"] {
        --bg: #0c0e10;
        --bg-a: #08090a;
        --bg-b: #141512;
        --bg-glow: rgba(139, 116, 62, 0.065);
        --panel: #161917;
        --panel-hi: #1f2320;
        --line: #343a35;
        --input: #0c0f0d;
        --ink: #e9e9e2;
        --muted: #9c9e93;
        --green: #a38b55;
        --green-dark: #625536;
        --blue: #83908b;
        --amber: #b09862;
        --red: #a76561;
        --fill: #252319;
        --btn-a: #4d442d;
        --btn-b: #2f2a20;
        --btn-hover-a: #605437;
        --btn-hover-b: #3b3426;
        --panel-accent: rgba(163, 139, 85, 0.19);
        --accent: #a38b55;
        --map-shell: #090b0a;
        --map-surface: #131713;
        --map-ring: #4a5047;
        --map-head-fill: #211f17;
        --map-head-stroke: #a38b55;
        --map-label: #cbc9ba;
        --map-text: #efeee7;
        --map-muted: #989b91;
        --map-readout: #181a17;
      }

      body[data-theme="burnt-orange"] {
        --bg: #0c0f12;
        --bg-a: #080a0c;
        --bg-b: #171512;
        --bg-glow: rgba(145, 83, 47, 0.07);
        --panel: #171a1e;
        --panel-hi: #20252a;
        --line: #373e45;
        --input: #0d1013;
        --ink: #e9e8e5;
        --muted: #9e9a95;
        --green: #a96c47;
        --green-dark: #66432e;
        --blue: #81909a;
        --amber: #ad895b;
        --red: #a95f59;
        --fill: #282019;
        --btn-a: #513928;
        --btn-b: #30251e;
        --btn-hover-a: #644631;
        --btn-hover-b: #3d2e24;
        --panel-accent: rgba(169, 108, 71, 0.19);
        --accent: #a96c47;
        --map-shell: #090c0f;
        --map-surface: #14181c;
        --map-ring: #4b535a;
        --map-head-fill: #251d18;
        --map-head-stroke: #a96c47;
        --map-label: #ccc8c3;
        --map-text: #efeeeb;
        --map-muted: #9a9793;
        --map-readout: #1a1b1b;
      }

      body[data-theme="forge-gradient"] {
        --bg: #0a0e13;
        --bg-a: #070a0e;
        --bg-b: #10171b;
        --bg-glow: rgba(84, 116, 109, 0.07);
        --panel: #141a20;
        --panel-hi: #1c242b;
        --line: #303b45;
        --input: #0a0f14;
        --ink: #e5ebee;
        --muted: #93a0a8;
        --green: #6f948c;
        --green-dark: #456058;
        --blue: #6f879c;
        --amber: #a08a62;
        --red: #9d6268;
        --fill: #192724;
        --btn-a: #365149;
        --btn-b: #2d3b48;
        --btn-hover-a: #416159;
        --btn-hover-b: #374858;
        --panel-accent: rgba(111, 135, 156, 0.19);
        --accent: #6f948c;
        --map-shell: #070c11;
        --map-surface: #101820;
        --map-ring: #40515e;
        --map-head-fill: #172523;
        --map-head-stroke: #6f879c;
        --map-label: #c3ccd1;
        --map-text: #ebf0f2;
        --map-muted: #909da5;
        --map-readout: #152027;
        background:
          radial-gradient(circle at 10% 2%, rgba(85, 70, 113, 0.075), transparent 34%),
          radial-gradient(circle at 91% 8%, rgba(73, 108, 123, 0.085), transparent 38%),
          radial-gradient(circle at 54% 98%, rgba(65, 112, 96, 0.07), transparent 44%),
          linear-gradient(135deg, #090b10 0%, #0a1118 45%, #0d1715 72%, #12100e 100%);
        background-attachment: fixed;
      }

      body:is(
        [data-theme="red-black"],
        [data-theme="dark-gold"],
        [data-theme="burnt-orange"],
        [data-theme="forge-gradient"]
      ) .panel,
      body:is(
        [data-theme="red-black"],
        [data-theme="dark-gold"],
        [data-theme="burnt-orange"],
        [data-theme="forge-gradient"]
      ) .map-area,
      body:is(
        [data-theme="red-black"],
        [data-theme="dark-gold"],
        [data-theme="burnt-orange"],
        [data-theme="forge-gradient"]
      ) .table-wrap {
        background:
          linear-gradient(150deg, color-mix(in srgb, var(--accent) 5%, transparent), transparent 36%),
          linear-gradient(180deg, var(--panel-hi), var(--panel));
        border-color: var(--line);
        border-top-color: color-mix(in srgb, var(--accent) 42%, var(--line));
        box-shadow: 0 16px 38px rgba(0, 0, 0, 0.4);
      }

      body:is(
        [data-theme="red-black"],
        [data-theme="dark-gold"],
        [data-theme="burnt-orange"],
        [data-theme="forge-gradient"]
      ) .map-area {
        background:
          radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--blue) 7%, transparent), transparent 48%),
          linear-gradient(180deg, color-mix(in srgb, var(--map-shell) 90%, var(--panel-hi) 10%), var(--map-shell));
      }

      body:is(
        [data-theme="red-black"],
        [data-theme="dark-gold"],
        [data-theme="burnt-orange"],
        [data-theme="forge-gradient"]
      ) button {
        border-color: color-mix(in srgb, var(--accent) 34%, var(--line));
      }

      body:is(
        [data-theme="red-black"],
        [data-theme="dark-gold"],
        [data-theme="burnt-orange"],
        [data-theme="forge-gradient"]
      ) button:hover,
      body:is(
        [data-theme="red-black"],
        [data-theme="dark-gold"],
        [data-theme="burnt-orange"],
        [data-theme="forge-gradient"]
      ) .tab.active {
        border-color: color-mix(in srgb, var(--accent) 64%, var(--line));
      }

      body:is(
        [data-theme="red-black"],
        [data-theme="dark-gold"],
        [data-theme="burnt-orange"],
        [data-theme="forge-gradient"]
      ) .top-settings-menu > summary {
        border-color: color-mix(in srgb, var(--accent) 38%, var(--line));
        background: linear-gradient(180deg, var(--btn-a), var(--btn-b));
      }

      body:is(
        [data-theme="red-black"],
        [data-theme="dark-gold"],
        [data-theme="burnt-orange"],
        [data-theme="forge-gradient"]
      ) input:focus,
      body:is(
        [data-theme="red-black"],
        [data-theme="dark-gold"],
        [data-theme="burnt-orange"],
        [data-theme="forge-gradient"]
      ) select:focus {
        outline-color: color-mix(in srgb, var(--accent) 45%, transparent);
        border-color: var(--accent);
      }

      body:is(
        [data-theme="red-black"],
        [data-theme="dark-gold"],
        [data-theme="burnt-orange"],
        [data-theme="forge-gradient"]
      ) tbody tr:hover {
        background: color-mix(in srgb, var(--accent) 5%, transparent);
      }

      body:is(
        [data-theme="red-black"],
        [data-theme="dark-gold"],
        [data-theme="burnt-orange"],
        [data-theme="forge-gradient"]
      ) th {
        background: color-mix(in srgb, var(--panel-hi) 91%, var(--input) 9%);
        color: var(--ink);
        border-bottom-color: var(--line);
      }

      body:is(
        [data-theme="red-black"],
        [data-theme="dark-gold"],
        [data-theme="burnt-orange"],
        [data-theme="forge-gradient"]
      ) .switch-control input:checked + .switch-track {
        background: color-mix(in srgb, var(--accent) 20%, transparent);
        border-color: var(--accent);
      }

      body:is(
        [data-theme="red-black"],
        [data-theme="dark-gold"],
        [data-theme="burnt-orange"],
        [data-theme="forge-gradient"]
      ) .notice {
        border-left-color: var(--accent);
        background: color-mix(in srgb, var(--accent) 10%, transparent);
      }

      body[data-theme="forge-gradient"] .panel,
      body[data-theme="forge-gradient"] .map-area,
      body[data-theme="forge-gradient"] .table-wrap {
        background:
          linear-gradient(145deg, rgba(111, 135, 156, 0.045), transparent 34%),
          linear-gradient(225deg, rgba(65, 112, 96, 0.035), transparent 44%),
          linear-gradient(180deg, rgba(28, 36, 43, 0.985), rgba(20, 26, 32, 0.995));
      }
    `;
    document.head.appendChild(style);
    return true;
  }

  installOptions();
  installStyles();

  global.LabelerThemePresetsController = Object.freeze({
    installed: true,
    presets,
    installOptions,
    installStyles
  });
})(window);
