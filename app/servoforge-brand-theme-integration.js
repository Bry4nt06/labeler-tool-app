"use strict";

(function installServoForgeBrandTheme(global) {
  if (global.ServoForgeBrandTheme?.installed) return;

  const THEME_VALUE = "servoforge";
  const THEME_LABEL = "ServoForge";
  const STYLE_ID = "servoforgeBrandThemeStyles";
  const BRAND_ASSET = "./assets/servoforge-mark.svg";

  function installBrowserBranding() {
    const build = encodeURIComponent(global.ServoForgeBootstrapBuild || global.SERVOFORGE_RELEASE_VERSION || "current");
    let icon = document.querySelector('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      icon.type = "image/svg+xml";
      document.head.appendChild(icon);
    }
    icon.href = `${BRAND_ASSET}?brand=${build}`;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", "#111820");
    return true;
  }

  function installThemeOption() {
    const select = document.querySelector("#themePreset");
    if (!select) return false;
    let option = [...select.options].find((item) => item.value === THEME_VALUE);
    if (!option) {
      option = document.createElement("option");
      option.value = THEME_VALUE;
      const lightOption = [...select.options].find((item) => item.value === "light") || null;
      select.insertBefore(option, lightOption);
    }
    option.textContent = THEME_LABEL;
    return true;
  }

  function installBrandHeader() {
    const heading = document.querySelector(".topbar h1");
    if (!heading || heading.dataset.servoforgeBranded === "true") return Boolean(heading);
    const build = encodeURIComponent(global.ServoForgeBootstrapBuild || global.SERVOFORGE_RELEASE_VERSION || "current");
    heading.dataset.servoforgeBranded = "true";
    heading.classList.add("servoforge-brand-heading");
    heading.innerHTML = `
      <span class="servoforge-brand-lockup">
        <img class="servoforge-brand-mark" src="${BRAND_ASSET}?brand=${build}" alt="" aria-hidden="true" />
        <span class="servoforge-brand-word">SERVOFORGE</span>
      </span>
      <span class="product-module">Labeler Tool</span>
    `;
    return true;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return false;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .servoforge-brand-heading {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.55rem 0.8rem;
      }

      .servoforge-brand-lockup {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        min-width: 0;
      }

      .servoforge-brand-mark {
        width: 2.15rem;
        height: 2.15rem;
        object-fit: contain;
        flex: 0 0 auto;
        filter: drop-shadow(0 0 8px rgba(255, 77, 46, 0.24));
      }

      .servoforge-brand-word {
        color: var(--ink);
        font-weight: 800;
        letter-spacing: 0.085em;
        line-height: 1;
      }

      body[data-theme="servoforge"] {
        --bg: #0a0f14;
        --bg-a: #070a0e;
        --bg-b: #111820;
        --bg-glow: rgba(255, 77, 46, 0.08);
        --panel: #111820;
        --panel-hi: #1a222c;
        --line: #26313d;
        --input: #0a0f14;
        --ink: #e6ecf2;
        --muted: #9aa7b3;
        --green: #2ecc71;
        --green-dark: #1d8d49;
        --blue: #2d6bff;
        --amber: #ff8a00;
        --red: #ff4d2e;
        --fill: #171d24;
        --btn-a: #ff4d2e;
        --btn-b: #c83b24;
        --btn-hover-a: #ff684f;
        --btn-hover-b: #e4482d;
        --panel-accent: rgba(255, 77, 46, 0.18);
        --accent: #ff4d2e;
        --map-shell: #070c11;
        --map-surface: #0d141b;
        --map-ring: #415160;
        --map-head-fill: #151c23;
        --map-head-stroke: #00d4ff;
        --map-label: #cbd6df;
        --map-text: #e6ecf2;
        --map-muted: #82909d;
        --map-readout: #111820;
        background:
          radial-gradient(circle at 9% 2%, rgba(255, 77, 46, 0.08), transparent 30%),
          radial-gradient(circle at 92% 8%, rgba(45, 107, 255, 0.065), transparent 34%),
          linear-gradient(145deg, #070b10 0%, #0a0f14 46%, #0d141b 100%);
        background-attachment: fixed;
      }

      body[data-theme="servoforge"] .panel,
      body[data-theme="servoforge"] .map-area,
      body[data-theme="servoforge"] .table-wrap,
      body[data-theme="servoforge"] .wipe-builder-drawer,
      body[data-theme="servoforge"] .top-settings-panel {
        background:
          linear-gradient(155deg, rgba(255, 77, 46, 0.025), transparent 34%),
          linear-gradient(180deg, var(--panel-hi), var(--panel));
        border-color: var(--line);
        box-shadow: 0 16px 38px rgba(0, 0, 0, 0.42);
      }

      body[data-theme="servoforge"] .map-area {
        background:
          radial-gradient(circle at 50% 42%, rgba(0, 212, 255, 0.045), transparent 46%),
          linear-gradient(180deg, #0c131a, var(--map-shell));
      }

      body[data-theme="servoforge"] button,
      body[data-theme="servoforge"] .tab,
      body[data-theme="servoforge"] .top-settings-menu > summary {
        border-color: color-mix(in srgb, var(--accent) 32%, var(--line));
      }

      body[data-theme="servoforge"] button:hover,
      body[data-theme="servoforge"] .tab.active,
      body[data-theme="servoforge"] .top-settings-menu > summary:hover {
        border-color: color-mix(in srgb, var(--accent) 72%, var(--line));
        box-shadow: 0 0 0 1px rgba(255, 77, 46, 0.08), 0 0 18px rgba(255, 77, 46, 0.08);
      }

      body[data-theme="servoforge"] .tab.active {
        background: linear-gradient(180deg, rgba(255, 77, 46, 0.28), rgba(200, 59, 36, 0.22));
        color: #fff4ef;
      }

      body[data-theme="servoforge"] input:focus,
      body[data-theme="servoforge"] select:focus,
      body[data-theme="servoforge"] textarea:focus {
        outline-color: rgba(45, 107, 255, 0.34);
        border-color: #2d6bff;
        box-shadow: 0 0 0 2px rgba(45, 107, 255, 0.12);
      }

      body[data-theme="servoforge"] th {
        background: #141c24;
        color: var(--ink);
        border-bottom-color: var(--line);
      }

      body[data-theme="servoforge"] tbody tr:hover {
        background: rgba(255, 77, 46, 0.045);
      }

      body[data-theme="servoforge"] .switch-control input:checked + .switch-track {
        background: rgba(45, 107, 255, 0.22);
        border-color: #2d6bff;
      }

      body[data-theme="servoforge"] .notice {
        border-left-color: #ff4d2e;
        background: rgba(255, 77, 46, 0.08);
      }

      body[data-theme="servoforge"] .validation-pass,
      body[data-theme="servoforge"] .status-pass,
      body[data-theme="servoforge"] .healthy {
        --accent: #2ecc71;
      }

      body[data-theme="servoforge"] .servoforge-brand-mark {
        filter: drop-shadow(0 0 10px rgba(255, 77, 46, 0.38));
      }

      @media (max-width: 720px) {
        .servoforge-brand-mark {
          width: 1.9rem;
          height: 1.9rem;
        }
        .servoforge-brand-word {
          letter-spacing: 0.055em;
        }
      }
    `;
    document.head.appendChild(style);
    return true;
  }

  installStyles();
  installBrowserBranding();
  installThemeOption();
  installBrandHeader();

  global.ServoForgeBrandTheme = Object.freeze({
    installed: true,
    theme: Object.freeze({
      value: THEME_VALUE,
      label: THEME_LABEL,
      palette: Object.freeze({
        deepSpace: "#0A0F14",
        charcoal: "#111820",
        gunmetal: "#1A222C",
        steel: "#232E3A",
        servoRed: "#FF4D2E",
        glowOrange: "#FF8A00",
        techBlue: "#2D6BFF",
        cyan: "#00D4FF",
        successGreen: "#2ECC71",
        primaryText: "#E6ECF2",
        secondaryText: "#9AA7B3",
        mutedText: "#5E6B78",
        divider: "#26313D"
      })
    }),
    installBrowserBranding,
    installThemeOption,
    installBrandHeader,
    installStyles
  });
})(window);
