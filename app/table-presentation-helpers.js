"use strict";

function optionList(items, selected) {
  const options = selected && !items.includes(selected) ? [selected, ...items] : items;
  return options.map((item) => {
    const escaped = String(item).replace(/"/g, '&quot;');
    const suffix = item === selected && !items.includes(selected) ? " (not found in specs)" : "";
    return `<option value="${escaped}"${item === selected ? " selected" : ""}>${item}${suffix}</option>`;
  }).join("");
}

window.LabelerTablePresentationHelpers = Object.freeze({ optionList });
