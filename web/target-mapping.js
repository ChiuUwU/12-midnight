(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TargetMapping = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const LEGACY_MAGICIANS_SWAP = {
    id: "magician_swap",
    kind: "SWAP",
    appliesTo: ["wolves_kill", "witch_antidote", "witch_poison", "seer_check"],
    order: 100
  };

  function normalizeSeat(value) {
    const seat = Number(value || 0);
    return Number.isInteger(seat) && seat > 0 ? seat : 0;
  }

  function normalizePair(seats) {
    if (!Array.isArray(seats) || seats.length !== 2) return [];
    const pair = seats.map(normalizeSeat);
    return pair[0] && pair[1] && pair[0] !== pair[1] ? pair : [];
  }

  function legacyMappingForAction(room, action) {
    if (room?.boardId !== "realm_of_trickery" || action?.stepId !== "magician_swap") return null;
    return { ...LEGACY_MAGICIANS_SWAP, targetSeats: action.targetSeats };
  }

  function normalizeMapping(room, action) {
    if (!action || action.skipped || action.invalidByConflict) return null;
    const raw = action.targetMapping || legacyMappingForAction(room, action);
    if (!raw || raw.kind !== "SWAP") return null;
    const targetSeats = normalizePair(raw.targetSeats || action.targetSeats);
    const appliesTo = Array.isArray(raw.appliesTo) ? raw.appliesTo.filter(Boolean).map(String) : [];
    if (!raw.id || !targetSeats.length || !appliesTo.length) return null;
    return {
      id: String(raw.id),
      kind: "SWAP",
      targetSeats,
      appliesTo,
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0,
      sourceStepId: String(action.stepId || "")
    };
  }

  function getNightTargetMappings(room, night = room?.night) {
    return (room?.nightActions || [])
      .filter((action) => Number(action.night) === Number(night))
      .map((action) => normalizeMapping(room, action))
      .filter(Boolean)
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  }

  function appliesTo(mapping, scope) {
    return mapping.appliesTo.includes("*") || mapping.appliesTo.includes(String(scope || ""));
  }

  function applyMapping(seat, mapping) {
    if (mapping.kind !== "SWAP") return seat;
    if (seat === mapping.targetSeats[0]) return mapping.targetSeats[1];
    if (seat === mapping.targetSeats[1]) return mapping.targetSeats[0];
    return seat;
  }

  function resolveNightTarget(room, { night = room?.night, scope, seat } = {}) {
    const originalSeat = normalizeSeat(seat);
    let effectiveSeat = originalSeat;
    const mappingIds = [];
    getNightTargetMappings(room, night).forEach((mapping) => {
      if (!appliesTo(mapping, scope)) return;
      const nextSeat = applyMapping(effectiveSeat, mapping);
      if (nextSeat === effectiveSeat) return;
      effectiveSeat = nextSeat;
      mappingIds.push(mapping.id);
    });
    return { originalSeat, effectiveSeat, mappingIds };
  }

  function actionTargetEntries(action) {
    if (!action || action.skipped) return [];
    if (action.stepId === "witch_action") {
      const entries = [];
      if (action.antidoteUsed) entries.push({ scope: "witch_antidote", seat: action.antidoteTargetSeat });
      if (normalizeSeat(action.poisonTargetSeat)) entries.push({ scope: "witch_poison", seat: action.poisonTargetSeat });
      return entries;
    }
    return (action.targetSeats || []).map((seat) => ({ scope: action.stepId, seat }));
  }

  function syncNightTargetResolutions(room, night = room?.night) {
    (room?.nightActions || [])
      .filter((action) => Number(action.night) === Number(night))
      .forEach((action) => {
        const targets = actionTargetEntries(action);
        if (!targets.length) {
          delete action.targetResolution;
          return;
        }
        action.targetResolution = targets.map((target) => ({
          scope: target.scope,
          ...resolveNightTarget(room, { night, ...target })
        }));
      });
  }

  return {
    LEGACY_MAGICIANS_SWAP,
    getNightTargetMappings,
    resolveNightTarget,
    syncNightTargetResolutions
  };
});
