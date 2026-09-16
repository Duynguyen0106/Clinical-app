"use client";

import { useEffect, useMemo, useState } from "react";
import { format, isSameDay, parseISO } from "date-fns";

export type AvailabilitySlot = {
  startsAt: string;
  practitionerId?: string;
  practitionerName?: string;
};

type Props = {
  slots: AvailabilitySlot[];
  /** Selected slot ISO start */
  value: string;
  /** Selected practitioner when slots include practitioner metadata */
  practitionerId?: string;
  onSelect: (slot: AvailabilitySlot) => void;
  emptyMessage?: string;
  legend?: string;
  /** Max times shown per morning/afternoon before “Show more” */
  initialVisiblePerPeriod?: number;
};

function dayKey(iso: string) {
  return format(parseISO(iso), "yyyy-MM-dd");
}

function isAfternoon(iso: string) {
  return parseISO(iso).getHours() >= 12;
}

type TimeGroup = {
  startsAt: string;
  options: AvailabilitySlot[];
};

function groupByTime(slots: AvailabilitySlot[]): TimeGroup[] {
  const map = new Map<string, AvailabilitySlot[]>();
  for (const s of slots) {
    const list = map.get(s.startsAt) ?? [];
    list.push(s);
    map.set(s.startsAt, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([startsAt, options]) => ({ startsAt, options }));
}

export function AvailabilityPicker({
  slots,
  value,
  practitionerId,
  onSelect,
  emptyMessage = "No open slots in the next fortnight.",
  legend = "Choose a day",
  initialVisiblePerPeriod = 6,
}: Props) {
  const days = useMemo(() => {
    const map = new Map<
      string,
      { key: string; date: Date; count: number }
    >();
    for (const s of slots) {
      const key = dayKey(s.startsAt);
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { key, date: parseISO(s.startsAt), count: 1 });
    }
    return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [slots]);

  const [selectedDay, setSelectedDay] = useState<string>("");
  const [expandedMorning, setExpandedMorning] = useState(false);
  const [expandedAfternoon, setExpandedAfternoon] = useState(false);
  const [showMorning, setShowMorning] = useState(true);
  const [showAfternoon, setShowAfternoon] = useState(true);

  useEffect(() => {
    if (days.length === 0) {
      setSelectedDay("");
      return;
    }
    if (value) {
      const fromValue = dayKey(value);
      if (days.some((d) => d.key === fromValue)) {
        setSelectedDay(fromValue);
        return;
      }
    }
    setSelectedDay((prev) =>
      days.some((d) => d.key === prev) ? prev : days[0]!.key,
    );
  }, [days, value]);

  useEffect(() => {
    setExpandedMorning(false);
    setExpandedAfternoon(false);
    const hour = new Date().getHours();
    if (hour < 12) {
      setShowMorning(true);
      setShowAfternoon(false);
    } else {
      setShowMorning(false);
      setShowAfternoon(true);
    }
  }, [selectedDay]);

  const daySlots = useMemo(() => {
    if (!selectedDay) return [];
    return slots.filter((s) => dayKey(s.startsAt) === selectedDay);
  }, [slots, selectedDay]);

  const morningGroups = useMemo(
    () => groupByTime(daySlots.filter((s) => !isAfternoon(s.startsAt))),
    [daySlots],
  );
  const afternoonGroups = useMemo(
    () => groupByTime(daySlots.filter((s) => isAfternoon(s.startsAt))),
    [daySlots],
  );

  const uniqueTimesToday = morningGroups.length + afternoonGroups.length;

  const morningOpen =
    morningGroups.length > 0 &&
    (afternoonGroups.length === 0 || showMorning);
  const afternoonOpen =
    afternoonGroups.length > 0 &&
    (morningGroups.length === 0 || showAfternoon);

  // If the selected slot sits in a collapsed period, open it.
  useEffect(() => {
    if (!value || dayKey(value) !== selectedDay) return;
    if (!isAfternoon(value) && morningGroups.length > 0) {
      setShowMorning(true);
    }
    if (isAfternoon(value) && afternoonGroups.length > 0) {
      setShowAfternoon(true);
    }
  }, [value, selectedDay, morningGroups.length, afternoonGroups.length]);

  function pickDay(key: string) {
    setSelectedDay(key);
    const first = slots.find((s) => dayKey(s.startsAt) === key);
    if (first) onSelect(first);
  }

  function pickTimeGroup(group: TimeGroup) {
    const preferred =
      (practitionerId &&
        group.options.find((o) => o.practitionerId === practitionerId)) ||
      group.options[0];
    if (preferred) onSelect(preferred);
  }

  function isTimeSelected(group: TimeGroup) {
    return group.startsAt === value;
  }

  function renderGroup(
    label: string,
    groups: TimeGroup[],
    open: boolean,
    setOpen: (v: boolean) => void,
    expanded: boolean,
    setExpanded: (v: boolean) => void,
  ) {
    if (groups.length === 0) return null;
    if (!open) {
      return (
        <button
          type="button"
          className="avail-period-toggle"
          onClick={() => setOpen(true)}
        >
          <span>{label}</span>
          <span className="avail-period-toggle-meta">
            {groups.length} {groups.length === 1 ? "time" : "times"} · Show
          </span>
        </button>
      );
    }
    const visible = expanded
      ? groups
      : groups.slice(0, initialVisiblePerPeriod);
    const hidden = groups.length - visible.length;
    return (
      <div className="avail-period">
        <div className="avail-period-head">
          <p className="avail-period-label">{label}</p>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => setOpen(false)}
          >
            Hide
          </button>
        </div>
        <div className="avail-time-grid">
          {visible.map((g) => {
            const selected = isTimeSelected(g);
            const names = g.options
              .map((o) => o.practitionerName)
              .filter(Boolean);
            const multi = g.options.length > 1 && names.length > 0;
            return (
              <div key={g.startsAt} className="avail-time-wrap">
                <button
                  type="button"
                  className={`avail-time ${selected ? "selected" : ""}`}
                  onClick={() => pickTimeGroup(g)}
                >
                  <span className="avail-time-clock">
                    {format(parseISO(g.startsAt), "HH:mm")}
                  </span>
                  {!multi && names[0] ? (
                    <span className="avail-time-prac">{names[0]}</span>
                  ) : multi ? (
                    <span className="avail-time-prac">
                      {g.options.length} free
                    </span>
                  ) : null}
                </button>
                {selected && multi ? (
                  <div
                    className="avail-prac-chips"
                    role="group"
                    aria-label="Practitioner"
                  >
                    {g.options.map((o) => (
                      <button
                        key={o.practitionerId ?? o.startsAt}
                        type="button"
                        className={`avail-prac-chip ${
                          o.practitionerId === practitionerId ? "selected" : ""
                        }`}
                        onClick={() => onSelect(o)}
                      >
                        {o.practitionerName ?? "Practitioner"}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        {hidden > 0 ? (
          <button
            type="button"
            className="btn-ghost btn-sm avail-more"
            onClick={() => setExpanded(true)}
          >
            Show {hidden} more {label.toLowerCase()} times
          </button>
        ) : null}
        {expanded && groups.length > initialVisiblePerPeriod ? (
          <button
            type="button"
            className="btn-ghost btn-sm avail-more"
            onClick={() => setExpanded(false)}
          >
            Show fewer
          </button>
        ) : null}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <fieldset className="slot-fieldset avail-picker">
        <legend>{legend}</legend>
        <p className="muted">{emptyMessage}</p>
      </fieldset>
    );
  }

  const selectedDate = days.find((d) => d.key === selectedDay)?.date;

  return (
    <fieldset className="slot-fieldset avail-picker">
      <legend>{legend}</legend>
      <div className="avail-day-strip" role="tablist" aria-label="Available days">
        {days.map((d) => {
          const active = d.key === selectedDay;
          const isToday = isSameDay(d.date, new Date());
          const uniqueForDay = groupByTime(
            slots.filter((s) => dayKey(s.startsAt) === d.key),
          ).length;
          return (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={active}
              className={`avail-day ${active ? "selected" : ""}`}
              onClick={() => pickDay(d.key)}
            >
              <span className="avail-day-dow">
                {isToday ? "Today" : format(d.date, "EEE")}
              </span>
              <span className="avail-day-num">{format(d.date, "d")}</span>
              <span className="avail-day-mon">{format(d.date, "MMM")}</span>
              <span className="avail-day-count">
                {uniqueForDay} {uniqueForDay === 1 ? "time" : "times"}
              </span>
            </button>
          );
        })}
      </div>

      {selectedDate ? (
        <p className="avail-day-heading">
          {format(selectedDate, "EEEE d MMMM")}
          <span className="avail-day-heading-meta">
            {" "}
            · {uniqueTimesToday} {uniqueTimesToday === 1 ? "time" : "times"}
          </span>
        </p>
      ) : null}

      {renderGroup(
        "Morning",
        morningGroups,
        morningOpen,
        setShowMorning,
        expandedMorning,
        setExpandedMorning,
      )}
      {renderGroup(
        "Afternoon",
        afternoonGroups,
        afternoonOpen,
        setShowAfternoon,
        expandedAfternoon,
        setExpandedAfternoon,
      )}
    </fieldset>
  );
}
