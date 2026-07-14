import React from "react";

const MAP = {
  approved: { cls: "badge-approved", label: "Approved" },
  locked: { cls: "badge-locked", label: "Locked" },
  ready: { cls: "badge-ready", label: "Ready" },
  missing: { cls: "badge-missing", label: "Missing" },
  demo: { cls: "badge-demo", label: "Demo Mode" },
  provider_missing: { cls: "badge-provider-missing", label: "Provider Missing" },
  reference_photo_active: { cls: "badge-ref-active", label: "Reference Photo Active" },
};

export default function StatusBadge({ status, label, testid }) {
  const cfg = MAP[status] || MAP.locked;
  return (
    <span className={`badge ${cfg.cls}`} data-testid={testid || `badge-${status}`}>
      <span className="badge-dot" />
      {label || cfg.label}
    </span>
  );
}
