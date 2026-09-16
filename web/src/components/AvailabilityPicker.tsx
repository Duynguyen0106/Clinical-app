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
};

function dayKey(iso: string) {
  return format(parseISO(iso), "yyyy-MM-dd");
}

function isAfternoon(iso: string) {
  return parseISO(iso).getHours() >= 12;
}

export function AvailabilityPicker({
  slots,
  value,
  practitionerId,
  onSelect,
  emptyMessage = "No open slots in the next fortnight.",
  legend = "Choose a day",
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

  const daySlots = useMemo(() => {
    if (!selectedDay) return [];
    return slots.filter((s) => dayKey(s.startsAt) === selectedDay);
  }, [slots, selectedDay]);

  const morning = daySlots.filter((s) => !isAfternoon(s.startsAt));
  const afternoon = daySlots.filter((s) => isAfternoon(s.startsAt));

  function pickDay(key: string) {
    setSelectedDay(key);
    const first = slots.find((s) => dayKey(s.startsAt) === key);
    if (first) onSelect(first);
  }

  function isSelected(s: AvailabilitySlot) {
    if (s.startsAt !== value) return false;
    if (s.practitionerId && practitionerId) {
      return s.practitionerId === practitionerId;
    }
    return true;
  }

  function renderGroup(label: string, group: AvailabilitySlot[]) {
    if (group.length === 0) return null;
    return (
      <div className="avail-period">
        <p className="avail-period-label">{label}</p>
        <div className="avail-time-grid">
          {group.map((s) => (
            <button
              key={`${s.practitionerId ?? ""}-${s.startsAt}`}
              type="button"
              className={`avail-time ${isSelected(s) ? "selected" : ""}`}
              onClick={() => onSelect(s)}
            >
              <span className="avail-time-clock">
                {format(parseISO(s.startsAt), "HH:mm")}
              </span>
              {s.practitionerName ? (
                <span className="avail-time-prac">{s.practitionerName}</span>
              ) : null}
            </button>
          ))}
        </div>
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
                {d.count} {d.count === 1 ? "slot" : "slots"}
              </span>
            </button>
          );
        })}
      </div>

      {selectedDate ? (
        <p className="avail-day-heading">
          {format(selectedDate, "EEEE d MMMM")}
        </p>
      ) : null}

      {renderGroup("Morning", morning)}
      {renderGroup("Afternoon", afternoon)}
    </fieldset>
  );
}
