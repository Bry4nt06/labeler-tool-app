"use strict";

function specificationAttributeValue(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function specificationActionIcon(kind) {
  if (kind === "duplicate") {
    return '<svg class="spec-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="9" y="9" width="10" height="10" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
  }
  return '<svg class="spec-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v5M14 11v5"></path></svg>';
}

function specificationDeleteButton(label) {
  const description = specificationAttributeValue(label || "specification");
  return `<button class="danger small-button spec-icon-button spec-delete-button" type="button" title="Delete ${description}" aria-label="Delete ${description}">${specificationActionIcon("delete")}</button>`;
}

function renderBottleSpecs() {
  els.bottleSpecs.innerHTML = `<div class="table-tools"><button id="addBottleSpec" type="button">Add Bottle</button></div><table><thead><tr><th>#</th><th>Bottle Type</th><th class="num">Diameter Target (mm)</th><th class="num">Radius Reduction (mm)</th><th class="num">Body/Back Diameter (mm)</th><th class="num">Body/Back Circumference (mm)</th><th>Action</th></tr></thead><tbody></tbody></table>`;
  const body = els.bottleSpecs.querySelector("tbody");
  state.bottleSpecs.forEach((spec, index) => {
    const tr = document.createElement("tr");
    tr.dataset.specLibrary = "bottle";
    tr.dataset.specIndex = String(index);
    tr.dataset.specId = String(spec.id);
    tr.innerHTML = `<td>${spec.id}</td><td><input data-spec-field="bottleType" value="${specificationAttributeValue(spec.bottleType)}"></td><td><input data-spec-field="diameterTargetMm" class="num" type="number" step="0.001" value="${specificationAttributeValue(spec.diameterTargetMm)}"></td><td><input data-spec-field="radiusReductionMm" class="num" type="number" step="0.001" value="${specificationAttributeValue(spec.radiusReductionMm)}"></td><td class="num">${fmt(bodyDiameter(spec), 3)}</td><td class="num">${fmt(bodyCircumference(spec), 3)}</td><td>${specificationDeleteButton(spec.bottleType)}</td>`;
    body.appendChild(tr);
  });
}

function renderLabelSpecs() {
  els.labelSpecs.innerHTML = `
    <div class="table-tools">
      <span class="table-tool-note">Assign each brand to APL or Cold Glue. Build selections are filtered by the active application map.</span>
      <button id="addLabelSpec" type="button">Add Label</button>
    </div>
    <table><thead><tr><th>#</th><th>Brand</th><th>Spec #</th><th>Application</th><th class="num">Body Length</th><th class="num">Back Length</th><th class="num">Neck Height <button class="info-tip" type="button" title="Measure the vertical height of the neck label from its bottom edge to its top edge on the approved label drawing." aria-label="Where to get Neck Height information">i</button></th><th class="num">Neck Length</th><th class="num">Neck Curve Bottom <button class="info-tip" type="button" title="Use the developed label width along the lower curved edge of the neck label from the approved label drawing." aria-label="Where to get Neck Curve Bottom information">i</button></th><th class="num">Neck Bottom Circ <button class="info-tip" type="button" title="Measure the bottle circumference at the exact height where the bottom edge of the neck label sits." aria-label="Where to get Neck Bottom Circumference information">i</button></th><th class="num">Code Box Center from Left Edge <button class="info-tip" type="button" title="On the approved label drawing, measure from the label's left edge to the center of the 20 mm coding box." aria-label="Where to get Code Box Center information">i</button></th><th>Action</th></tr></thead><tbody></tbody></table>`;
  const labelSpecsTable = els.labelSpecs.querySelector("table");
  labelSpecsTable.classList.add("label-specs-table");
  labelSpecsTable.insertAdjacentHTML("afterbegin", '<colgroup><col class="label-col-id"><col class="label-col-brand"><col class="label-col-spec"><col class="label-col-application"><col class="label-col-short"><col class="label-col-short"><col class="label-col-neck-height"><col class="label-col-neck-length"><col class="label-col-curve"><col class="label-col-circ"><col class="label-col-code"><col class="label-col-action"></colgroup>');
  const body = els.labelSpecs.querySelector("tbody");
  state.labelSpecs.forEach((spec, index) => {
    spec.applicationMode = normalizeLabelApplicationMode(spec.applicationMode);
    const tr = document.createElement("tr");
    tr.dataset.specLibrary = "label";
    tr.dataset.specIndex = String(index);
    tr.dataset.specId = String(spec.id);
    if (String(spec.brand ?? "") === String(state.selectedBrand ?? "")) {
      tr.classList.add("selected-brand-spec");
      tr.setAttribute("aria-current", "true");
      tr.title = "Currently selected Brand Recipe";
    }
    tr.innerHTML = `<td>${spec.id}</td><td><input data-spec-field="brand" value="${specificationAttributeValue(spec.brand)}"></td><td><input data-spec-field="specNumber" value="${specificationAttributeValue(spec.specNumber)}"></td><td><select data-spec-field="applicationMode" aria-label="Application for ${specificationAttributeValue(spec.brand || "label")}"><option value="apl"${spec.applicationMode === "apl" ? " selected" : ""}>APL</option><option value="cold-glue"${spec.applicationMode === "cold-glue" ? " selected" : ""}>Cold Glue</option></select></td><td><input data-spec-field="bodyLengthMm" class="num" type="number" step="0.001" value="${specificationAttributeValue(spec.bodyLengthMm)}"></td><td><input data-spec-field="backLengthMm" class="num" type="number" step="0.001" value="${specificationAttributeValue(spec.backLengthMm)}"></td><td><input data-spec-field="neckHeightMm" class="num" type="number" step="0.001" value="${specificationAttributeValue(spec.neckHeightMm)}"></td><td><input data-spec-field="neckLengthMm" class="num" type="number" step="0.001" value="${specificationAttributeValue(spec.neckLengthMm)}"></td><td><input data-spec-field="neckBottomCurveMm" class="num" type="number" step="0.001" value="${specificationAttributeValue(spec.neckBottomCurveMm)}"></td><td><input data-spec-field="neckBottomCircumferenceMm" class="num" type="number" step="0.001" value="${specificationAttributeValue(spec.neckBottomCircumferenceMm)}"></td><td><input data-spec-field="codeBoxCenterMm" class="num" type="number" step="0.001" value="${specificationAttributeValue(spec.codeBoxCenterMm)}"></td><td>${specificationDeleteButton(spec.brand)}</td>`;
    body.appendChild(tr);
  });
}

window.LabelerSpecificationTableRenderer = Object.freeze({
  renderBottleSpecs,
  renderLabelSpecs
});
