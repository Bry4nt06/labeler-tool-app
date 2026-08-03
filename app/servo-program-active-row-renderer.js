"use strict";

function servoMovePairKey(segment) {
  return String(segment?.action || "")
    .replace(/\s*-\s*rest\s*$/i, "")
    .trim()
    .toLowerCase();
}

function updateActiveServoProgramRow() {
  if (!els.program) return;
  const program = currentProgram();
  const segments = programSegments(program);
  const active = activeSegmentForProgram(program, state.previewAngle);
  const activeHmi = Number(active?.hmi);
  const activeIndex = segments.findIndex((segment) => Number(segment.hmi) === activeHmi);
  const pairedHmis = new Set(Number.isFinite(activeHmi) ? [activeHmi] : []);
  const activeSegment = segments[activeIndex];
  const pairKey = servoMovePairKey(activeSegment);
  if (pairKey && [3, 7].includes(Number(activeSegment?.cmd))) {
    const counterpartCommand = Number(activeSegment.cmd) === 7 ? 3 : 7;
    const counterpart = segments
      .map((segment, index) => ({ segment, index }))
      .filter(({ segment }) => Number(segment.cmd) === counterpartCommand && servoMovePairKey(segment) === pairKey)
      .sort((a, b) => Math.abs(a.index - activeIndex) - Math.abs(b.index - activeIndex))[0]?.segment;
    if (counterpart) pairedHmis.add(Number(counterpart.hmi));
  }
  els.program.querySelectorAll("tbody tr[data-program-hmi]").forEach((row) => {
    const rowHmi = Number(row.dataset.programHmi);
    const isActive = rowHmi === activeHmi;
    const isMovePair = pairedHmis.has(rowHmi);
    row.classList.toggle("active-servo-move-row", isMovePair);
    row.classList.toggle("active-servo-program-row", isActive);
    if (isActive) {
      row.setAttribute("aria-current", "step");
      row.title = `Head 1 is executing HMI ${activeHmi}: ${active?.action || "Servo move"}`;
    } else {
      row.removeAttribute("aria-current");
      if (isMovePair) row.title = `Reference row paired with Head 1 move at HMI ${activeHmi}`;
      else row.removeAttribute("title");
    }
  });
}

window.LabelerServoProgramActiveRowRenderer = Object.freeze({
  servoMovePairKey,
  updateActiveServoProgramRow
});
