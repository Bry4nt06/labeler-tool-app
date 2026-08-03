"use strict";

function renderWipeDownData() {
  if (!els.wipeDownDataPanel) return;
  const data = wipeDownTelemetry();
  const percentage = Math.round(data.percentage * 10) / 10;
  els.wipeLabelSection.textContent = data.sectionLabel;
  els.wipeLabelLength.textContent = data.labelLengthMm > 0 ? `${fmt(data.labelLengthMm, 1)} mm` : "-";
  els.wipeCurrentTurn.textContent = data.currentTurn;
  els.wipePlateAngle.textContent = `${fmt(data.plateAngle, 1)}°`;
  els.wipePercent.textContent = `${fmt(percentage, 1)}%`;
  els.wipeProgressText.textContent = `${fmt(percentage, 1)}% wiped`;
  if (data.tackMode === "leading") {
    els.wipeLeftSurfaceFill.style.width = `${data.mainWipePercent}%`;
    els.wipeRightSurfaceFill.style.width = "0%";
    els.wipeBackspinFill.style.width = `${data.backspinFillPercent}%`;
  } else {
    els.wipeLeftSurfaceFill.style.width = `${data.leftPercent / 2}%`;
    els.wipeRightSurfaceFill.style.width = `${data.rightPercent / 2}%`;
    els.wipeBackspinFill.style.width = "0%";
  }
  els.wipeLabelGraphic.classList.toggle("wipe-mode-center", data.tackMode === "center");
  els.wipeLabelGraphic.classList.toggle("wipe-mode-leading", data.tackMode === "leading");
  els.wipeLabelGraphic.classList.toggle("wipe-direction-rtl", data.direction === "rtl");
  els.wipeLabelGraphic.classList.toggle("wipe-direction-ltr", data.direction === "ltr");
  els.wipeLabelGraphic.style.setProperty("--backspin-width", `${data.backspinPercent}%`);
  els.wipeTackLine.hidden = data.tackMode !== "center";
  els.wipeLeadingBackspin.hidden = data.tackMode !== "leading";
  els.wipeTackText.textContent = "Center tack";
  els.wipeBackspinText.textContent = `${fmt(data.backspinMm, 1)} mm backspin`;
  if (data.tackMode === "center") {
    els.wipeLeftEdge.textContent = `Left • ${fmt(data.leftPercent, 1)}%`;
    els.wipeRightEdge.textContent = `Right • ${fmt(data.rightPercent, 1)}%`;
    els.wipeDirectionText.textContent = "Center → edges";
    els.wipeApplicationText.textContent = "Center tack";
  } else if (data.direction === "rtl") {
    els.wipeLeftEdge.textContent = `Trailing • ${fmt(data.leftPercent, 1)}%`;
    els.wipeRightEdge.textContent = `Leading • ${fmt(data.rightPercent, 1)}%`;
    els.wipeDirectionText.textContent = "Right → left";
    els.wipeApplicationText.textContent = "Leading edge";
  } else {
    els.wipeLeftEdge.textContent = `Leading • ${fmt(data.leftPercent, 1)}%`;
    els.wipeRightEdge.textContent = `Trailing • ${fmt(data.rightPercent, 1)}%`;
    els.wipeDirectionText.textContent = "Left → right";
    els.wipeApplicationText.textContent = "Leading edge";
  }
  const directionDescription = data.tackMode === "center" ? "from the center tack toward both edges" : data.direction === "rtl" ? "from the right leading edge toward the left" : "from the left leading edge toward the right";
  els.wipeLabelGraphic.setAttribute("aria-label", `${fmt(percentage, 1)}% total ${data.sectionLabel.toLowerCase()} surface wiped ${directionDescription}; left side ${fmt(data.leftPercent, 1)}%, right side ${fmt(data.rightPercent, 1)}%`);
}

window.LabelerWipeTelemetryRenderer = Object.freeze({ renderWipeDownData });
