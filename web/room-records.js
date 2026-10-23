(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RoomRecords = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function ensure(room) {
    room.privateEvents = Array.isArray(room.privateEvents) ? room.privateEvents : [];
    room.daySkillWindowRecords = Array.isArray(room.daySkillWindowRecords) ? room.daySkillWindowRecords : [];
    return room;
  }

  function nextId(room, prefix) {
    ensure(room);
    const count = room.privateEvents.length + room.daySkillWindowRecords.length + (room.deathRecords || []).length;
    return `${prefix}-${Date.now()}-${count}`;
  }

  function recordPrivateEvent(room, { type, audience, payload = {}, createdAt = Date.now() }) {
    ensure(room);
    const event = {
      id: nextId(room, "private"),
      type,
      audience: audience || { kind: "JUDGE" },
      payload,
      createdAt
    };
    room.privateEvents.push(event);
    room.privateEvents = room.privateEvents.slice(-200);
    return event;
  }

  function privateEventsForViewer(room, { judge = false, seat = 0 } = {}) {
    ensure(room);
    if (judge) return room.privateEvents;
    return room.privateEvents.filter((event) => event.audience?.kind === "SEAT" && Number(event.audience.seat) === Number(seat));
  }

  function createDeathRecord(room, { day, phase, seats, reasons = {}, sourceAction = null, resolutionOrder = 0, createdAt = Date.now() }) {
    ensure(room);
    return {
      id: nextId(room, "death"),
      day,
      phase,
      seats: Array.isArray(seats) ? seats.map(Number) : [],
      reasons,
      sourceAction,
      resolutionOrder,
      deathSkill: { queued: false, resolved: false },
      visibility: {
        public: ["day", "phase", "seats", "createdAt"],
        judge: ["reasons", "sourceAction", "resolutionOrder", "deathSkill"]
      },
      createdAt
    };
  }

  function publicDeathRecord(record) {
    const { reasons, sourceAction, resolutionOrder, deathSkill, visibility, ...publicRecord } = record;
    return publicRecord;
  }

  function appendDaySkillWindowRecord(room, window, event, detail = {}) {
    ensure(room);
    const record = {
      id: nextId(room, "day-window"),
      windowId: window.id,
      day: window.day,
      event,
      trigger: window.trigger,
      kind: window.kind,
      eligibleSeats: [...window.eligibleSeats],
      detail,
      createdAt: Date.now()
    };
    room.daySkillWindowRecords.push(record);
    return record;
  }

  function openDaySkillWindow(room, { id, day, trigger, kind, eligibleSeats, action, resume = "DAY", metadata = {} }) {
    ensure(room);
    if (room.activeDaySkillWindow?.status === "OPEN") return null;
    const window = {
      id,
      day,
      trigger,
      kind,
      eligibleSeats: [...new Set((eligibleSeats || []).map(Number).filter(Boolean))],
      action,
      resume,
      metadata,
      status: "OPEN",
      createdAt: Date.now()
    };
    room.activeDaySkillWindow = window;
    appendDaySkillWindowRecord(room, window, "OPENED");
    window.eligibleSeats.forEach((seat) => recordPrivateEvent(room, {
      type: "DAY_SKILL_WINDOW_OPENED",
      audience: { kind: "SEAT", seat },
      payload: { windowId: window.id, kind: window.kind, trigger: window.trigger, action: window.action }
    }));
    return window;
  }

  function resolveDaySkillWindow(room, { actorSeat = 0, outcome, detail = {} }) {
    ensure(room);
    const window = room.activeDaySkillWindow;
    if (!window || window.status !== "OPEN") return null;
    window.status = outcome;
    window.resolvedAt = Date.now();
    window.resolvedBySeat = Number(actorSeat || 0);
    appendDaySkillWindowRecord(room, window, outcome, { actorSeat: window.resolvedBySeat, ...detail });
    room.activeDaySkillWindow = null;
    return window;
  }

  function daySkillWindowForViewer(room, { judge = false, controller = false, seat = 0 } = {}) {
    const window = room.activeDaySkillWindow;
    if (!window || window.status !== "OPEN") return null;
    if (judge || controller) return window;
    return window.eligibleSeats.includes(Number(seat)) ? {
      id: window.id,
      day: window.day,
      trigger: window.trigger,
      kind: window.kind,
      action: window.action,
      resume: window.resume,
      metadata: window.metadata
    } : null;
  }

  return {
    ensure,
    recordPrivateEvent,
    privateEventsForViewer,
    createDeathRecord,
    publicDeathRecord,
    openDaySkillWindow,
    resolveDaySkillWindow,
    daySkillWindowForViewer
  };
});
