// Human-readable reasons from the same margins that determine route colors.
export function returnLimitMessages(view) {
  const overdue = key => Math.max(0, -(view.margins?.[key] ?? 0)).toFixed(1);
  return (view.violations ?? []).map(reason => ({
    SPEED_ZERO: 'Speed ×0: crew stopped; no walking return ETA',
    MISSION_END: `Mission window exceeded by ${overdue('mission')} min`,
    SUNSET: `Return must finish before sunset (${overdue('sunset')} min past the boundary)`,
    SHELTER_LIMIT: `Return exceeds the 60 min shelter limit by ${overdue('shelter')} min`,
    SLOPE_BLOCKED: 'Return includes terrain above the allowed slope limit',
  })[reason] ?? reason);
}
