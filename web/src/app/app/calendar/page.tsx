"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, startOfWeek } from "date-fns";
import { AppShell } from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { PatientPrepPanel } from "@/components/PatientPrepPanel";
import { PatientLookup } from "@/components/PatientLookup";
import {
  appointmentOccupiesSlot,
  calendarEventStatusClass,
  diaryHoursFromRules,
  humanStatusLabel,
  isHourWithinRules,
  rulesForPractitioner,
  type AvailabilityRule,
} from "@/modules/scheduling/calendar-ui";
import {
  clinicDateKey,
  clinicDayOfWeek,
  clinicLocalDateTime,
  clinicMinutesFromMidnight,
} from "@/modules/scheduling/clinic-time";
import { patientDiaryLabel } from "@/modules/scheduling/diary-privacy";

type Appointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
  depositStatus?: string;
  depositCents?: number;
  depositPaidAt?: string | null;
  recurrenceGroupId?: string | null;
  patient: { id: string; firstName: string; lastName: string };
  practitioner: { id: string; displayName: string };
  appointmentType: {
    id: string;
    name: string;
    durationMinutes: number;
    defaultPriceCents: number;
  };
  room: { name: string } | null;
  visit: { id: string } | null;
};

type Block = {
  id: string;
  date: string;
  startMinute: number | null;
  endMinute: number | null;
  reason: string | null;
  practitioner: { id: string; displayName: string };
};

type CatalogPractitioner = {
  id: string;
  displayName: string;
  availability?: AvailabilityRule[];
  /** null/undefined = all services */
  appointmentTypeIds?: string[] | null;
};

type Catalog = {
  appointmentTypes: {
    id: string;
    name: string;
    durationMinutes: number;
    defaultPriceCents: number;
  }[];
  practitioners: CatalogPractitioner[];
};

function minutesLabel(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function durationOf(apt: Appointment) {
  return Math.round(
    (new Date(apt.endsAt).getTime() - new Date(apt.startsAt).getTime()) /
      60_000,
  );
}

function sameDayHour(
  iso: string,
  day: Date,
  hour: number,
  timeZone: string,
) {
  const s = new Date(iso);
  return (
    clinicDateKey(s, timeZone) === clinicDateKey(day, timeZone) &&
    Math.floor(clinicMinutesFromMidnight(s, timeZone) / 60) === hour
  );
}

function blockCoversHour(b: Block, dayKey: string, hour: number) {
  if (b.date.slice(0, 10) !== dayKey) return false;
  if (b.startMinute == null) return hour >= 8 && hour < 18;
  const hStart = Math.floor((b.startMinute ?? 0) / 60);
  const hEnd = Math.ceil((b.endMinute ?? 24 * 60) / 60);
  return hour >= hStart && hour < hEnd;
}

export default function CalendarPage() {
  const { me } = useAuth();
  const router = useRouter();
  const timeZone = me?.clinic.timezone ?? "Europe/London";
  const canEditSchedule =
    me?.role === "OWNER" || me?.role === "RECEPTION";
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  );
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [dayFocus, setDayFocus] = useState(() => new Date());
  /** Phone-first: day view is clearer on narrow screens */
  const [isNarrow, setIsNarrow] = useState(false);
  /** "" = all practitioners; otherwise filter diary to one profile */
  const [filterPractitionerId, setFilterPractitionerId] = useState<string>("");
  const [filterReady, setFilterReady] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /** When set with draggingId, slot tap shifts the whole series from that appointment */
  const [seriesMove, setSeriesMove] = useState(false);

  const [selected, setSelected] = useState<Appointment | null>(null);
  /** Appointment sheet: secondary actions behind More */
  const [sheetMoreOpen, setSheetMoreOpen] = useState(false);
  const setSelectedAppt = useCallback((apt: Appointment | null) => {
    setSelected(apt);
    setSheetMoreOpen(false);
  }, []);
  const [bookOpen, setBookOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  /** When true, slot came from clicking a diary cell */
  const [bookSlotFixed, setBookSlotFixed] = useState(false);

  const [bookPatientId, setBookPatientId] = useState("");
  const [bookIntakeNote, setBookIntakeNote] = useState<string | null>(null);
  const [bookTypeId, setBookTypeId] = useState("");
  const [bookPractitionerId, setBookPractitionerId] = useState("");
  const [bookDuration, setBookDuration] = useState(30);
  const [bookFeePounds, setBookFeePounds] = useState("");
  const [bookSlots, setBookSlots] = useState<string[]>([]);
  const [bookSlot, setBookSlot] = useState("");
  const [bookNotes, setBookNotes] = useState("");
  /** 1 = single; 2–26 = series including first slot */
  const [bookWeeklyCount, setBookWeeklyCount] = useState(1);
  /** 1 = weekly; 2 = fortnightly */
  const [bookIntervalWeeks, setBookIntervalWeeks] = useState(1);
  /** Book sheet: fee + notes (+ repeat) behind Options */
  const [bookOptionsOpen, setBookOptionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const privacyMode =
    me?.clinic.calendarPrivacyMode === "INITIALS" ? "INITIALS" : "FULL_NAME";
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [feedWebcal, setFeedWebcal] = useState<string | null>(null);
  const [feedHint, setFeedHint] = useState<string[] | null>(null);
  const [feedMessage, setFeedMessage] = useState<string | null>(null);
  /** Toolbar: Sync / Blocks / legend stay out of the first viewport */
  const [toolsOpen, setToolsOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);

  const [blockPractitionerId, setBlockPractitionerId] = useState("");
  const [blockDate, setBlockDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [blockAllDay, setBlockAllDay] = useState(true);
  const [blockStart, setBlockStart] = useState("12:00");
  const [blockEnd, setBlockEnd] = useState("13:00");
  const [blockReason, setBlockReason] = useState("");

  const [editDuration, setEditDuration] = useState(30);
  const [extraFee, setExtraFee] = useState("");
  const [feeNote, setFeeNote] = useState("");
  /** When reception moves or shortens/lengthens a booking, email/SMS the patient */
  const [notifyPatientOnChange, setNotifyPatientOnChange] = useState(true);

  const days = useMemo(
    () =>
      viewMode === "day"
        ? [dayFocus]
        : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart, viewMode, dayFocus],
  );

  const hours = useMemo(() => {
    const list = catalog?.practitioners ?? [];
    const relevant = filterPractitionerId
      ? list.filter((p) => p.id === filterPractitionerId)
      : list;
    return diaryHoursFromRules(
      relevant.map((p) => rulesForPractitioner(p.availability)),
    );
  }, [catalog, filterPractitionerId]);

  const bookableTypes = useMemo(() => {
    const types = catalog?.appointmentTypes ?? [];
    const prac = catalog?.practitioners.find(
      (p) => p.id === bookPractitionerId,
    );
    if (!prac?.appointmentTypeIds?.length) return types;
    const allowed = new Set(prac.appointmentTypeIds);
    return types.filter((t) => allowed.has(t.id));
  }, [catalog, bookPractitionerId]);

  const load = useCallback(() => {
    const from = viewMode === "day" ? dayFocus : weekStart;
    const to = viewMode === "day" ? addDays(dayFocus, 1) : addDays(weekStart, 7);
    const pracQs = filterPractitionerId
      ? `&practitionerId=${encodeURIComponent(filterPractitionerId)}`
      : "";
    void Promise.all([
      api<{ appointments: Appointment[] }>(
        `/appointments?from=${from.toISOString()}&to=${to.toISOString()}${pracQs}`,
      ),
      api<{ blocks: Block[] }>(
        `/blocks?from=${clinicDateKey(from, timeZone)}&to=${clinicDateKey(
          viewMode === "day" ? dayFocus : addDays(weekStart, 6),
          timeZone,
        )}${pracQs}`,
      ),
      // Refresh open hours so Team → Save hours updates the diary without a hard reload
      api<Catalog>("/clinic/catalog"),
    ])
      .then(([a, b, c]) => {
        setAppointments(a.appointments);
        setBlocks(b.blocks);
        setCatalog(c);
        // Keep sheet in sync when status changes elsewhere (Today Done, visit end)
        setSelected((prev) => {
          if (!prev) return null;
          const fresh = a.appointments.find((x) => x.id === prev.id);
          return fresh ?? prev;
        });
      })
      .catch((e: Error) => setError(e.message));
  }, [weekStart, viewMode, dayFocus, filterPractitionerId, timeZone]);

  useEffect(() => {
    if (!filterReady) return;
    load();
  }, [load, filterReady]);

  // Resync after completing a visit in another tab — debounce focus storms.
  useEffect(() => {
    if (!filterReady) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onFocus = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => load(), 400);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load, filterReady]);

  useEffect(() => {
    void api<Catalog>("/clinic/catalog")
      .then((c) => {
        setCatalog(c);
        setBookTypeId(c.appointmentTypes[0]?.id ?? "");
        const myId = me?.practitionerProfileId;
        const defaultPrac =
          (myId && c.practitioners.some((p) => p.id === myId)
            ? myId
            : c.practitioners[0]?.id) ?? "";
        setBookPractitionerId(defaultPrac);
        setBlockPractitionerId(defaultPrac);
        setBookDuration(c.appointmentTypes[0]?.durationMinutes ?? 30);
        const fee = c.appointmentTypes[0]?.defaultPriceCents ?? 0;
        setBookFeePounds(fee ? (fee / 100).toFixed(2) : "");
      })
      .catch(() => undefined);
  }, [me?.practitionerProfileId]);

  useEffect(() => {
    if (filterReady || !me) return;
    if (me.role === "PRACTITIONER" && me.practitionerProfileId) {
      setFilterPractitionerId(me.practitionerProfileId);
    } else {
      setFilterPractitionerId("");
    }
    setFilterReady(true);
  }, [me, filterReady]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => {
      const narrow = mq.matches;
      setIsNarrow(narrow);
      if (narrow) {
        setViewMode("day");
        setDayFocus(new Date());
        setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const stripDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        addDays(
          startOfWeek(viewMode === "day" ? dayFocus : weekStart, {
            weekStartsOn: 1,
          }),
          i,
        ),
      ),
    [dayFocus, weekStart, viewMode],
  );

  useEffect(() => {
    if (!bookOpen || !bookTypeId || !bookPractitionerId || bookSlotFixed) return;
    void api<{ slots: string[] }>(
      `/slots?appointmentTypeId=${bookTypeId}&practitionerId=${bookPractitionerId}&durationMinutes=${bookDuration}&days=14`,
    )
      .then((d) => {
        setBookSlots(d.slots);
        setBookSlot(d.slots[0] ?? "");
      })
      .catch((e: Error) => setError(e.message));
  }, [bookOpen, bookTypeId, bookPractitionerId, bookDuration, bookSlotFixed]);

  useEffect(() => {
    if (!selected) return;
    setEditDuration(durationOf(selected));
    setExtraFee("");
    setFeeNote("");
  }, [selected]);

  function practitionerOpenAt(
    practitionerId: string,
    day: Date,
    hour: number,
  ): boolean {
    const p = catalog?.practitioners.find((x) => x.id === practitionerId);
    if (!p) return false;
    return isHourWithinRules(
      clinicDayOfWeek(day, timeZone),
      hour,
      rulesForPractitioner(p.availability),
    );
  }

  /** Practitioners already occupied (appointment or block) in this hour. */
  function busyPractitionerIdsAt(day: Date, hour: number): Set<string> {
    const busy = new Set<string>();
    const dayKey = clinicDateKey(day, timeZone);
    for (const a of appointments) {
      if (!appointmentOccupiesSlot(a.status)) continue;
      if (sameDayHour(a.startsAt, day, hour, timeZone))
        busy.add(a.practitioner.id);
    }
    for (const b of blocks) {
      if (blockCoversHour(b, dayKey, hour)) busy.add(b.practitioner.id);
    }
    return busy;
  }

  function pickFreePractitioner(
    day: Date,
    hour: number,
    preferId?: string | null,
  ): string | null {
    const busy = busyPractitionerIdsAt(day, hour);
    const list = catalog?.practitioners ?? [];
    const open = (id: string) =>
      !busy.has(id) && practitionerOpenAt(id, day, hour);
    if (preferId && list.some((p) => p.id === preferId) && open(preferId)) {
      return preferId;
    }
    if (filterPractitionerId) {
      return open(filterPractitionerId) ? filterPractitionerId : null;
    }
    return list.find((p) => open(p.id))?.id ?? null;
  }

  function cellClosed(day: Date, hour: number): boolean {
    const list = catalog?.practitioners ?? [];
    if (list.length === 0) return false;
    if (filterPractitionerId) {
      return !practitionerOpenAt(filterPractitionerId, day, hour);
    }
    // All-practitioners view: closed only when nobody works this hour
    return !list.some((p) => practitionerOpenAt(p.id, day, hour));
  }

  function openBookSheet(opts?: {
    day?: Date;
    hour?: number;
    /** Prefer this practitioner if free; otherwise first free. */
    practitionerId?: string;
  }) {
    setSelectedAppt(null);
    setMessage(null);
    setError(null);
    setBookPatientId("");
    setBookIntakeNote(null);
    setBookNotes("");
    setBookOptionsOpen(false);
    if (opts?.day != null && opts.hour != null) {
      const startsAt = clinicLocalDateTime(
        clinicDateKey(opts.day, timeZone),
        opts.hour * 60,
        timeZone,
      );
      setBookSlot(startsAt.toISOString());
      setBookSlotFixed(true);
      const free = pickFreePractitioner(
        opts.day,
        opts.hour,
        opts.practitionerId ?? (filterPractitionerId || null),
      );
      if (free) setBookPractitionerId(free);
      else if (opts.practitionerId) setBookPractitionerId(opts.practitionerId);
      else if (filterPractitionerId) setBookPractitionerId(filterPractitionerId);
    } else {
      setBookSlotFixed(false);
      setBookSlot("");
    }
    setBookOpen(true);
  }

  function openBookAlongside(apt: Appointment) {
    const day = new Date(apt.startsAt);
    const hour = Math.floor(clinicMinutesFromMidnight(day, timeZone) / 60);
    const free = pickFreePractitioner(day, hour, null);
    if (!free) {
      setError("No other practitioner is free at this time");
      return;
    }
    openBookSheet({ day, hour, practitionerId: free });
  }

  async function reschedule(id: string, day: Date, hour: number) {
    const startsAt = clinicLocalDateTime(
      clinicDateKey(day, timeZone),
      hour * 60,
      timeZone,
    );
    if (seriesMove) {
      setBusy(true);
      setError(null);
      try {
        const d = await api<{
          movedCount: number;
          skippedStartsAt: string[];
        }>(`/appointments/${id}/reschedule-series`, {
          method: "POST",
          body: JSON.stringify({ startsAt: startsAt.toISOString() }),
        });
        setMessage(
          `Moved ${d.movedCount} series appointments${
            d.skippedStartsAt?.length
              ? ` (${d.skippedStartsAt.length} skipped — busy/closed)`
              : ""
          }.`,
        );
        setSeriesMove(false);
        setDraggingId(null);
        load();
      } catch (e) {
        setError(
          e instanceof ApiError ? e.message : "Could not move series",
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      const res = await api<{
        appointment: Appointment;
        notification?: {
          patientNotified?: boolean;
          patientEmailSent?: boolean;
          patientSmsSent?: boolean;
        };
      }>(`/appointments/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          startsAt: startsAt.toISOString(),
          notifyPatient: notifyPatientOnChange,
        }),
      });
      setError(null);
      const n = res.notification;
      if (!notifyPatientOnChange) {
        setMessage("Appointment moved (patient not notified)");
      } else if (n?.patientEmailSent || n?.patientSmsSent) {
        setMessage(
          `Appointment moved — patient notified${
            n.patientEmailSent && n.patientSmsSent
              ? " by email and SMS"
              : n.patientEmailSent
                ? " by email"
                : " by SMS"
          }`,
        );
      } else {
        setMessage(
          "Appointment moved — no patient email/phone on file to notify",
        );
      }
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reschedule");
    }
  }

  async function createBooking() {
    if (!bookPatientId || !bookSlot) return;
    setBusy(true);
    setError(null);
    try {
      const feeCents = bookFeePounds
        ? Math.round(Number(bookFeePounds) * 100)
        : 0;
      const notes = [
        bookNotes.trim() || null,
        bookIntakeNote ? `Intake: ${bookIntakeNote}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      const res = await api<{
        appointment: Appointment;
        confirmation?: {
          emailSent?: boolean;
          smsSent?: boolean;
        };
        series?: {
          createdCount: number;
          requestedCount: number;
          skippedStartsAt: string[];
        };
      }>("/appointments", {
        method: "POST",
        body: JSON.stringify({
          patientId: bookPatientId,
          practitionerId: bookPractitionerId,
          appointmentTypeId: bookTypeId,
          startsAt: bookSlot,
          durationMinutes: bookDuration,
          notes: notes || null,
          feeCents: feeCents > 0 ? feeCents : undefined,
          weeklyCount: bookWeeklyCount > 1 ? bookWeeklyCount : undefined,
          intervalWeeks:
            bookWeeklyCount > 1 && bookIntervalWeeks > 1
              ? bookIntervalWeeks
              : undefined,
        }),
      });
      const cadenceLabel =
        bookIntervalWeeks === 2 ? "fortnightly" : "weekly";
      setBookOpen(false);
      setBookSlotFixed(false);
      setBookIntakeNote(null);
      setBookWeeklyCount(1);
      setBookIntervalWeeks(1);
      const c = res.confirmation;
      const series = res.series;
      const seriesBit =
        series && series.requestedCount > 1
          ? ` · ${series.createdCount}/${series.requestedCount} ${cadenceLabel} slots created${
              series.skippedStartsAt?.length
                ? ` (${series.skippedStartsAt.length} skipped — busy/closed)`
                : ""
            }`
          : "";
      if (c?.emailSent || c?.smsSent) {
        setMessage(
          `Appointment booked — confirmation sent${
            c.emailSent && c.smsSent
              ? " by email and SMS"
              : c.emailSent
                ? " by email"
                : " by SMS"
          }${seriesBit}`,
        );
      } else {
        setMessage(
          `Appointment booked — add patient email or phone to send confirmations${seriesBit}`,
        );
      }
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not book");
    } finally {
      setBusy(false);
    }
  }

  async function createBlock() {
    setBusy(true);
    setError(null);
    try {
      const [sh, sm] = blockStart.split(":").map(Number);
      const [eh, em] = blockEnd.split(":").map(Number);
      await api("/blocks", {
        method: "POST",
        body: JSON.stringify({
          practitionerId: blockPractitionerId,
          date: blockDate,
          startMinute: blockAllDay ? null : sh * 60 + sm,
          endMinute: blockAllDay ? null : eh * 60 + em,
          reason: blockReason || null,
        }),
      });
      setMessage("Time blocked");
      setBlockReason("");
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not block time");
    } finally {
      setBusy(false);
    }
  }

  async function removeBlock(id: string, label?: string) {
    if (
      !confirm(
        label
          ? `Remove block on ${label}?`
          : "Remove this diary block?",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/blocks/${id}`, { method: "DELETE" });
      setMessage("Block removed");
      setBlocks((prev) => prev.filter((b) => b.id !== id));
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove block");
    } finally {
      setBusy(false);
    }
  }

  async function removeBlocksInView() {
    if (blocks.length === 0) return;
    if (
      !confirm(
        `Remove all ${blocks.length} diary block${blocks.length === 1 ? "" : "s"} in this ${viewMode} view?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await Promise.all(
        blocks.map((b) => api(`/blocks/${b.id}`, { method: "DELETE" })),
      );
      setMessage(
        `Removed ${blocks.length} block${blocks.length === 1 ? "" : "s"}`,
      );
      setBlocks([]);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove blocks");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function patchSelected(body: Record<string, unknown>, okMsg: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const payload = { ...body };
      if (
        "startsAt" in payload ||
        "durationMinutes" in payload ||
        "appointmentTypeId" in payload
      ) {
        payload.notifyPatient = notifyPatientOnChange;
      }
      const res = await api<{
        appointment: Appointment;
        notification?: {
          patientNotified?: boolean;
          patientEmailSent?: boolean;
          patientSmsSent?: boolean;
        };
      }>(`/appointments/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setSelected(res.appointment);
      const n = res.notification;
      if (
        ("startsAt" in body || "durationMinutes" in body) &&
        notifyPatientOnChange &&
        (n?.patientEmailSent || n?.patientSmsSent)
      ) {
        setMessage(`${okMsg} — patient notified`);
      } else if (
        ("startsAt" in body || "durationMinutes" in body) &&
        !notifyPatientOnChange
      ) {
        setMessage(`${okMsg} (patient not notified)`);
      } else {
        setMessage(okMsg);
      }
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function openPhoneFeed() {
    setFeedOpen(true);
    setFeedMessage(null);
    setError(null);
    try {
      const d = await api<{
        feed: {
          httpsUrl: string;
          webcalUrl: string;
          instructions: string[];
        };
      }>("/calendar/feed");
      setFeedUrl(d.feed.httpsUrl);
      setFeedWebcal(d.feed.webcalUrl);
      setFeedHint(d.feed.instructions);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load calendar feed");
      setFeedOpen(false);
    }
  }

  async function rotatePhoneFeed() {
    setBusy(true);
    setFeedMessage(null);
    try {
      const d = await api<{
        feed: { httpsUrl: string; webcalUrl: string; instructions: string[] };
      }>("/calendar/feed", { method: "POST" });
      setFeedUrl(d.feed.httpsUrl);
      setFeedWebcal(d.feed.webcalUrl);
      setFeedHint(d.feed.instructions);
      setFeedMessage("New link created — update the subscription on your phone.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not rotate feed");
    } finally {
      setBusy(false);
    }
  }

  async function copyFeed(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setFeedMessage("Link copied.");
    } catch {
      setFeedMessage(url);
    }
  }

  async function openVisit(apt: Appointment) {
    if (apt.visit) {
      router.push(`/app/visits/${apt.visit.id}`);
      return;
    }
    const { visit } = await api<{ visit: { id: string } }>("/visits", {
      method: "POST",
      body: JSON.stringify({ appointmentId: apt.id }),
    });
    router.push(`/app/visits/${visit.id}`);
  }

  return (
    <AppShell
      title={me?.role === "PRACTITIONER" ? "Schedule" : "Calendar"}
      subtitle={
        me?.role === "PRACTITIONER"
          ? "Your diary — tap an appointment to open the visit and take notes. Grey cells are outside your open hours."
          : "Click a time slot to book. Grey cells follow Team → Open hours (closed automatically — no diary block needed)."
      }
    >
      <div className="panel calendar-panel">
        <div className="cal-toolbar">
          <div className="cal-toolbar-top">
            <div className="view-toggle" role="group" aria-label="Calendar view">
              <button
                type="button"
                className={`btn-sm ${viewMode === "day" ? "btn-secondary" : "btn-ghost"}`}
                onClick={() => {
                  setViewMode("day");
                  setDayFocus(new Date());
                }}
              >
                Day
              </button>
              <button
                type="button"
                className={`btn-sm ${viewMode === "week" ? "btn-secondary" : "btn-ghost"}`}
                onClick={() => setViewMode("week")}
              >
                Week
              </button>
            </div>
            <div className="cal-toolbar-nav">
              <button
                type="button"
                className="btn-ghost btn-sm"
                aria-label="Previous"
                onClick={() =>
                  viewMode === "day"
                    ? setDayFocus((d) => addDays(d, -1))
                    : setWeekStart((d) => addDays(d, -7))
                }
              >
                ←
              </button>
              <h2 className="cal-date-label">
                {viewMode === "day"
                  ? format(dayFocus, isNarrow ? "EEE d MMM" : "EEE d MMM yyyy")
                  : `${format(weekStart, "d MMM")} – ${format(addDays(weekStart, 6), isNarrow ? "d MMM" : "d MMM yyyy")}`}
              </h2>
              <button
                type="button"
                className="btn-ghost btn-sm"
                aria-label="Next"
                onClick={() =>
                  viewMode === "day"
                    ? setDayFocus((d) => addDays(d, 1))
                    : setWeekStart((d) => addDays(d, 7))
                }
              >
                →
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  const todayKey = clinicDateKey(new Date(), timeZone);
                  const today = clinicLocalDateTime(todayKey, 12 * 60, timeZone);
                  setDayFocus(today);
                  setWeekStart(startOfWeek(today, { weekStartsOn: 1 }));
                }}
              >
                Today
              </button>
            </div>
            <div className="week-actions">
              {canEditSchedule ? (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => openBookSheet()}
                >
                  Book
                </button>
              ) : null}
              {me?.practitionerProfileId ||
              canEditSchedule ||
              appointments.length > 0 ? (
                <button
                  type="button"
                  className={`btn-sm cal-tools-toggle ${toolsOpen ? "btn-secondary" : "btn-ghost"}`}
                  aria-expanded={toolsOpen}
                  aria-controls="cal-tools-panel"
                  onClick={() => setToolsOpen((o) => !o)}
                >
                  Tools
                </button>
              ) : null}
            </div>
          </div>

          {toolsOpen &&
          (me?.practitionerProfileId ||
            canEditSchedule ||
            appointments.length > 0) ? (
            <div
              id="cal-tools-panel"
              className="cal-tools-panel"
              role="region"
              aria-label="Calendar tools"
            >
              {me?.practitionerProfileId ? (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => void openPhoneFeed()}
                >
                  {isNarrow ? "Sync" : "Phone calendar"}
                </button>
              ) : null}
              {canEditSchedule ? (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={() => setBlockOpen(true)}
                >
                  Blocks{blocks.length ? ` (${blocks.length})` : ""}
                </button>
              ) : null}
              {canEditSchedule || appointments.length > 0 ? (
                <button
                  type="button"
                  className={`btn-sm ${legendOpen ? "btn-secondary" : "btn-ghost"}`}
                  aria-expanded={legendOpen}
                  onClick={() => setLegendOpen((o) => !o)}
                >
                  Legend
                </button>
              ) : null}
            </div>
          ) : null}

          {toolsOpen && legendOpen ? (
            <div className="cal-legend" aria-label="Appointment status colours">
              <span className="cal-legend-item">
                <i className="cal-swatch status-booked" aria-hidden /> Booked
              </span>
              <span className="cal-legend-item">
                <i className="cal-swatch status-completed" aria-hidden /> Completed
              </span>
              <span className="cal-legend-item">
                <i className="cal-swatch status-no_show" aria-hidden /> No-show
              </span>
              <span className="cal-legend-item">
                <i className="cal-swatch status-in_progress" aria-hidden /> In progress
              </span>
              <span className="cal-legend-item">
                <i className="cal-swatch cal-swatch-closed" aria-hidden /> Closed
              </span>
            </div>
          ) : null}

          {catalog &&
          catalog.practitioners.length > 1 &&
          me?.role !== "PRACTITIONER" ? (
            <div
              className="view-toggle prac-filter cal-prac-filter"
              role="group"
              aria-label="Practitioner filter"
            >
              <button
                type="button"
                className={`btn-sm ${filterPractitionerId === "" ? "btn-secondary" : "btn-ghost"}`}
                onClick={() => setFilterPractitionerId("")}
              >
                All
              </button>
              {catalog.practitioners.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`btn-sm ${
                    filterPractitionerId === p.id ? "btn-secondary" : "btn-ghost"
                  }`}
                  onClick={() => setFilterPractitionerId(p.id)}
                >
                  {p.id === me?.practitionerProfileId
                    ? "Me"
                    : p.displayName.split(" ")[0]}
                </button>
              ))}
            </div>
          ) : null}

          {viewMode === "day" ? (
            <div className="cal-day-strip" role="tablist" aria-label="Days this week">
              {stripDays.map((day) => {
                const chipSelected =
                  clinicDateKey(day, timeZone) ===
                  clinicDateKey(dayFocus, timeZone);
                const isToday =
                  clinicDateKey(day, timeZone) ===
                  clinicDateKey(new Date(), timeZone);
                const dayClosed = hours.every((h) => cellClosed(day, h));
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    role="tab"
                    aria-selected={chipSelected}
                    className={`cal-day-chip ${chipSelected ? "active" : ""} ${
                      isToday ? "is-today" : ""
                    } ${dayClosed ? "is-closed" : ""}`}
                    title={dayClosed ? "Closed — outside open hours" : undefined}
                    onClick={() => {
                      setViewMode("day");
                      setDayFocus(day);
                      setWeekStart(startOfWeek(day, { weekStartsOn: 1 }));
                    }}
                  >
                    <span className="cal-day-chip-dow">{format(day, "EEE")}</span>
                    <span className="cal-day-chip-num">{format(day, "d")}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {viewMode === "week" && isNarrow ? (
            <p className="cal-swipe-hint muted">Swipe sideways to see the full week</p>
          ) : null}
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {message ? <p className="form-ok">{message}</p> : null}

        <div
          className={`week-grid ${viewMode === "day" ? "week-grid-day" : ""}`}
          role="grid"
          aria-label={viewMode === "day" ? "Day calendar" : "Week calendar"}
        >
          <div className="week-corner" />
          {days.map((day) => {
            const dayClosed = hours.every((h) => cellClosed(day, h));
            return (
              <div
                key={day.toISOString()}
                className={`week-day-head ${dayClosed ? "week-day-closed" : ""}`}
                title={dayClosed ? "Closed — outside open hours" : undefined}
              >
                <strong>{format(day, "EEE")}</strong>
                <span className="week-day-full">{format(day, "d MMM")}</span>
                <span className="week-day-short" aria-hidden>
                  {format(day, "d")}
                </span>
                {dayClosed ? (
                  <span className="week-day-closed-tag">Closed</span>
                ) : null}
              </div>
            );
          })}

          {hours.map((hour) => (
            <div key={hour} className="week-hour-row">
              <div className="week-hour">{`${String(hour).padStart(2, "0")}:00`}</div>
              {days.map((day) => {
                const cellAppts = appointments.filter((a) =>
                  sameDayHour(a.startsAt, day, hour, timeZone),
                );
                const dayKey = clinicDateKey(day, timeZone);
                const cellBlocks = blocks.filter((b) =>
                  blockCoversHour(b, dayKey, hour),
                );
                const closed = cellClosed(day, hour);
                const freePracId =
                  canEditSchedule && !closed
                    ? pickFreePractitioner(day, hour, filterPractitionerId || null)
                    : null;
                const canBookHere = Boolean(canEditSchedule && freePracId);
                const canDropMove =
                  Boolean(canEditSchedule && !closed && draggingId);
                return (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    className={`week-cell ${closed ? "week-cell-closed" : ""} ${
                      canDropMove ? "droppable" : ""
                    } ${canBookHere || canDropMove ? "week-cell-bookable" : ""}`}
                    role="button"
                    tabIndex={canBookHere || canDropMove ? 0 : -1}
                    aria-label={
                      closed
                        ? `Closed ${format(day, "EEE d MMM")} at ${String(hour).padStart(2, "0")}:00`
                        : draggingId
                          ? `Move appointment to ${format(day, "EEE d MMM")} at ${String(hour).padStart(2, "0")}:00`
                          : canBookHere
                            ? `Book ${format(day, "EEE d MMM")} at ${String(hour).padStart(2, "0")}:00`
                            : `${format(day, "EEE d MMM")} ${String(hour).padStart(2, "0")}:00`
                    }
                    onDragOver={(e) => {
                      if (canEditSchedule && !closed) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (!canEditSchedule || closed) return;
                      e.preventDefault();
                      const id =
                        e.dataTransfer.getData("text/appointment-id") ||
                        draggingId;
                      if (id) void reschedule(id, day, hour);
                      setDraggingId(null);
                    }}
                    onClick={() => {
                      // Touch-friendly move: tap appointment (sets draggingId), then tap slot
                      if (draggingId && !closed) {
                        void reschedule(draggingId, day, hour);
                        setDraggingId(null);
                        return;
                      }
                      if (!canBookHere) return;
                      openBookSheet({ day, hour });
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      if (draggingId && !closed) {
                        void reschedule(draggingId, day, hour);
                        setDraggingId(null);
                        return;
                      }
                      if (!canBookHere) return;
                      openBookSheet({ day, hour });
                    }}
                  >
                    {closed &&
                    cellAppts.length === 0 &&
                    cellBlocks.length === 0 ? (
                      <div className="cal-closed" title="Outside open hours">
                        Closed
                      </div>
                    ) : null}
                    {cellBlocks.map((b) =>
                      canEditSchedule ? (
                        <button
                          key={b.id}
                          type="button"
                          className="cal-block cal-block-btn"
                          title={
                            b.reason
                              ? `${b.reason} — click to remove`
                              : "Blocked — click to remove"
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeBlock(
                              b.id,
                              `${b.date.slice(0, 10)}${
                                b.reason ? ` · ${b.reason}` : ""
                              }`,
                            );
                          }}
                        >
                          Blocked · {b.practitioner.displayName}
                          {b.reason ? ` · ${b.reason}` : ""}
                        </button>
                      ) : (
                        <div
                          key={b.id}
                          className="cal-block"
                          title={b.reason ?? "Blocked"}
                        >
                          Blocked · {b.practitioner.displayName}
                          {b.reason ? ` · ${b.reason}` : ""}
                        </div>
                      ),
                    )}
                    {cellAppts.map((apt) => (
                      <button
                        key={apt.id}
                        type="button"
                        className={`cal-event week-event ${calendarEventStatusClass(apt.status)}`}
                        draggable={canEditSchedule}
                        onDragStart={(e) => {
                          if (!canEditSchedule) return;
                          e.dataTransfer.setData(
                            "text/appointment-id",
                            apt.id,
                          );
                          setDraggingId(apt.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMessage(null);
                          setError(null);
                          setSelectedAppt(apt);
                        }}
                        title={
                          canEditSchedule
                            ? "Click for actions · drag to reschedule"
                            : "View appointment"
                        }
                      >
                        <strong>
                          {patientDiaryLabel(apt.patient, privacyMode)}
                        </strong>
                        <span className="cal-prac">{apt.practitioner.displayName}</span>
                        <span>{apt.appointmentType.name}</span>
                        {apt.room ? (
                          <span className="cal-room">{apt.room.name}</span>
                        ) : null}
                      </button>
                    ))}
                    {canBookHere && cellAppts.length > 0 ? (
                      <span className="cal-slot-hint">+ Book another</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {selected ? (
        <div className="sheet-backdrop" onClick={() => setSelectedAppt(null)}>
          <div
            className="sheet-card"
            role="dialog"
            aria-label="Appointment"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-head">
              <h2>
                {patientDiaryLabel(selected.patient, privacyMode)}
              </h2>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setSelectedAppt(null)}
              >
                Close
              </button>
            </div>
            <p className="muted">
              {format(new Date(selected.startsAt), "EEE d MMM HH:mm")} ·{" "}
              {durationOf(selected)} min · {selected.appointmentType.name}
              {selected.room ? ` · ${selected.room.name}` : ""}
            </p>
            <p className="muted">
              Practitioner:{" "}
              <strong>{selected.practitioner.displayName}</strong>
            </p>
            <p className="muted">
              Status:{" "}
              <span
                className={`status-pill ${calendarEventStatusClass(selected.status)}`}
              >
                {humanStatusLabel(selected.status)}
              </span>
            </p>

            {selected.depositStatus &&
            selected.depositStatus !== "NONE" &&
            (selected.depositCents ?? 0) > 0 ? (
              <div className="sheet-deposit">
                <p className="muted">
                  Deposit:{" "}
                  <strong>
                    £{((selected.depositCents ?? 0) / 100).toFixed(2)}
                  </strong>{" "}
                  · {selected.depositStatus.toLowerCase().replaceAll("_", " ")}
                  {selected.depositPaidAt
                    ? ` · paid ${format(new Date(selected.depositPaidAt), "d MMM HH:mm")}`
                    : null}
                </p>
                {canEditSchedule && selected.depositStatus === "REQUIRED" ? (
                  <div className="sheet-actions">
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          setBusy(true);
                          setError(null);
                          try {
                            const d = await api<{
                              appointment: {
                                depositStatus: string;
                                depositCents: number;
                                depositPaidAt: string | null;
                                status: string;
                              };
                            }>(`/appointments/${selected.id}/deposit`, {
                              method: "POST",
                              body: JSON.stringify({ action: "mark_paid" }),
                            });
                            setSelected({
                              ...selected,
                              depositStatus: d.appointment.depositStatus,
                              depositCents: d.appointment.depositCents,
                              depositPaidAt: d.appointment.depositPaidAt,
                              status: d.appointment.status,
                            });
                            setAppointments((prev) =>
                              prev.map((a) =>
                                a.id === selected.id
                                  ? {
                                      ...a,
                                      depositStatus: d.appointment.depositStatus,
                                      depositCents: d.appointment.depositCents,
                                      depositPaidAt: d.appointment.depositPaidAt,
                                      status: d.appointment.status,
                                    }
                                  : a,
                              ),
                            );
                            setMessage("Deposit marked paid.");
                          } catch (e) {
                            setError(
                              e instanceof ApiError
                                ? e.message
                                : "Could not mark deposit paid",
                            );
                          } finally {
                            setBusy(false);
                          }
                        })()
                      }
                    >
                      Mark deposit paid
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          if (
                            !confirm(
                              "Waive this deposit? The patient will not need to pay it.",
                            )
                          ) {
                            return;
                          }
                          setBusy(true);
                          setError(null);
                          try {
                            const d = await api<{
                              appointment: {
                                depositStatus: string;
                                depositCents: number;
                                depositPaidAt: string | null;
                                status: string;
                              };
                            }>(`/appointments/${selected.id}/deposit`, {
                              method: "POST",
                              body: JSON.stringify({ action: "waive" }),
                            });
                            setSelected({
                              ...selected,
                              depositStatus: d.appointment.depositStatus,
                              depositCents: d.appointment.depositCents,
                              depositPaidAt: d.appointment.depositPaidAt,
                            });
                            setAppointments((prev) =>
                              prev.map((a) =>
                                a.id === selected.id
                                  ? {
                                      ...a,
                                      depositStatus: d.appointment.depositStatus,
                                      depositCents: d.appointment.depositCents,
                                      depositPaidAt: d.appointment.depositPaidAt,
                                    }
                                  : a,
                              ),
                            );
                            setMessage("Deposit waived.");
                          } catch (e) {
                            setError(
                              e instanceof ApiError
                                ? e.message
                                : "Could not waive deposit",
                            );
                          } finally {
                            setBusy(false);
                          }
                        })()
                      }
                    >
                      Waive deposit
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="sheet-actions sheet-actions-primary">
              {(() => {
                const terminal = ["CANCELLED", "COMPLETED", "NO_SHOW"].includes(
                  selected.status,
                );
                const awaiting =
                  selected.status === "BOOKED" ||
                  selected.status === "CONFIRMED";
                const isClinician =
                  me?.role === "OWNER" || me?.role === "PRACTITIONER";
                const primaryIsCheckIn = canEditSchedule && awaiting;
                return (
                  <>
                    {primaryIsCheckIn ? (
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={busy}
                        onClick={() =>
                          void patchSelected(
                            { status: "CHECKED_IN" },
                            "Checked in",
                          )
                        }
                      >
                        Check in
                      </button>
                    ) : null}
                    {isClinician && !terminal ? (
                      <button
                        type="button"
                        className={
                          primaryIsCheckIn ? "btn-secondary" : "btn-primary"
                        }
                        onClick={() => void openVisit(selected)}
                      >
                        Open visit
                      </button>
                    ) : null}
                    {canEditSchedule && !terminal ? (
                      <>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy}
                          onClick={() => {
                            setSeriesMove(false);
                            setDraggingId(selected.id);
                            setSelectedAppt(null);
                            setMessage(
                              "Tap a diary slot to move this appointment (or drag on desktop).",
                            );
                          }}
                        >
                          Move
                        </button>
                        <button
                          type="button"
                          className="btn-secondary apt-cancel-btn"
                          disabled={busy}
                          onClick={() =>
                            void patchSelected(
                              { status: "CANCELLED" },
                              "Cancelled",
                            )
                          }
                        >
                          Cancel
                        </button>
                      </>
                    ) : null}
                    {!canEditSchedule && !isClinician ? (
                      <p className="muted">
                        Schedule changes are managed by reception.
                      </p>
                    ) : null}
                    {!canEditSchedule && isClinician && !terminal ? (
                      <p className="muted">
                        Open the visit to record and take the clinical note.
                        Schedule changes are managed by reception.
                      </p>
                    ) : null}
                    {terminal ? (
                      <p className="muted">
                        This appointment is {humanStatusLabel(selected.status).toLowerCase()}.
                        {isClinician && selected.visit
                          ? " Open the visit from Notes if you need the record."
                          : ""}
                      </p>
                    ) : null}
                  </>
                );
              })()}
            </div>

            {selected.notes ? (
              <p className="muted sheet-notes">{selected.notes}</p>
            ) : null}

            {canEditSchedule &&
            !["CANCELLED", "COMPLETED", "NO_SHOW"].includes(selected.status) ? (
              <div className="sheet-more">
                <button
                  type="button"
                  className="btn-ghost btn-sm sheet-more-toggle"
                  aria-expanded={sheetMoreOpen}
                  onClick={() => setSheetMoreOpen((o) => !o)}
                >
                  {sheetMoreOpen ? "Hide more" : "More…"}
                </button>
                {sheetMoreOpen ? (
                  <div className="sheet-more-body">
                    <div className="sheet-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={
                          busy ||
                          !pickFreePractitioner(
                            new Date(selected.startsAt),
                            Math.floor(
                              clinicMinutesFromMidnight(
                                new Date(selected.startsAt),
                                timeZone,
                              ) / 60,
                            ),
                            null,
                          )
                        }
                        onClick={() => openBookAlongside(selected)}
                      >
                        Book another practitioner
                      </button>
                      <button
                        type="button"
                        className="btn-ghost apt-cancel-btn"
                        disabled={busy}
                        onClick={() =>
                          void patchSelected(
                            { status: "NO_SHOW" },
                            "Marked no-show",
                          )
                        }
                      >
                        No-show
                      </button>
                      {selected.recurrenceGroupId ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy || selected.status === "CANCELLED"}
                          onClick={() => {
                            void (async () => {
                              setBusy(true);
                              setError(null);
                              try {
                                const d = await api<{
                                  cancelledCount: number;
                                }>(
                                  `/appointments/${selected.id}/cancel-series`,
                                  { method: "POST" },
                                );
                                setSelectedAppt(null);
                                setMessage(
                                  `Cancelled ${d.cancelledCount} remaining series appointments.`,
                                );
                                load();
                              } catch (e) {
                                setError(
                                  e instanceof ApiError
                                    ? e.message
                                    : "Could not cancel series",
                                );
                              } finally {
                                setBusy(false);
                              }
                            })();
                          }}
                        >
                          Cancel series from here
                        </button>
                      ) : null}
                      {selected.recurrenceGroupId ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy || selected.status === "CANCELLED"}
                          onClick={() => {
                            setSeriesMove(true);
                            setDraggingId(selected.id);
                            setSelectedAppt(null);
                            setMessage(
                              "Tap a diary slot to move this and later series appointments by the same amount.",
                            );
                          }}
                        >
                          Move series from here
                        </button>
                      ) : null}
                    </div>

                    <label className="consent-label notify-patient-toggle">
                      <input
                        type="checkbox"
                        checked={notifyPatientOnChange}
                        onChange={(e) =>
                          setNotifyPatientOnChange(e.target.checked)
                        }
                      />
                      <span>
                        Notify patient by email/SMS when time or length changes
                        (also applies when you move to a new slot)
                      </span>
                    </label>

                    <label className="field">
                      <span>Length (minutes)</span>
                      <div className="inline-row">
                        <input
                          type="number"
                          min={5}
                          max={480}
                          step={5}
                          value={editDuration}
                          onChange={(e) =>
                            setEditDuration(Number(e.target.value))
                          }
                        />
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={busy}
                          onClick={() =>
                            void patchSelected(
                              { durationMinutes: editDuration },
                              "Length updated",
                            )
                          }
                        >
                          Save length
                        </button>
                      </div>
                    </label>

                    <label className="field">
                      <span>Additional fee (£)</span>
                      <div className="inline-row">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="e.g. 15"
                          value={extraFee}
                          onChange={(e) => setExtraFee(e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="Reason (tape, injection…)"
                          value={feeNote}
                          onChange={(e) => setFeeNote(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          disabled={busy || !extraFee || Number(extraFee) <= 0}
                          onClick={() =>
                            void patchSelected(
                              {
                                additionalFeeCents: Math.round(
                                  Number(extraFee) * 100,
                                ),
                                feeNote: feeNote || undefined,
                              },
                              "Fee added",
                            )
                          }
                        >
                          Add fee
                        </button>
                      </div>
                    </label>

                    {blocks.some(
                      (b) => b.practitioner.id === selected.practitioner.id,
                    ) ? (
                      <div className="block-list">
                        <h3>Diary blocks in this view</h3>
                        <p className="muted" style={{ margin: "0 0 0.5rem" }}>
                          Or open <strong>Tools → Blocks</strong> to manage all
                          blocks. Approved leave is under Team → Leave.
                        </p>
                        {blocks
                          .filter(
                            (b) =>
                              b.practitioner.id === selected.practitioner.id,
                          )
                          .map((b) => (
                            <div key={b.id} className="block-row">
                              <span>
                                {b.date.slice(0, 10)}{" "}
                                {b.startMinute == null
                                  ? "all day"
                                  : `${minutesLabel(b.startMinute)}–${minutesLabel(b.endMinute ?? 0)}`}
                                {b.reason ? ` · ${b.reason}` : ""}
                              </span>
                              <button
                                type="button"
                                className="btn-ghost btn-sm"
                                disabled={busy}
                                onClick={() =>
                                  void removeBlock(
                                    b.id,
                                    `${b.date.slice(0, 10)}${
                                      b.reason ? ` · ${b.reason}` : ""
                                    }`,
                                  )
                                }
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <PatientPrepPanel
              patientId={selected.patient.id}
              excludeAppointmentId={selected.id}
              compact
              defaultCollapsed
              source="calendar"
              privacyMode={privacyMode}
            />
          </div>
        </div>
      ) : null}

      {bookOpen ? (
        <div
          className="sheet-backdrop"
          onClick={() => {
            setBookOpen(false);
            setBookSlotFixed(false);
          }}
        >
          <div
            className="sheet-card"
            role="dialog"
            aria-label="Book appointment"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-head">
              <h2>Book appointment</h2>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  setBookOpen(false);
                  setBookSlotFixed(false);
                }}
              >
                Close
              </button>
            </div>
            {bookSlotFixed && bookSlot ? (
              <p className="alert-line">
                Slot: {format(new Date(bookSlot), "EEE d MMM HH:mm")}
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    setBookSlotFixed(false);
                    setBookSlot("");
                  }}
                >
                  Change slot
                </button>
              </p>
            ) : null}
            {bookSlotFixed && bookSlot ? (
              <p className="muted book-fineprint">
                Other practitioners can be booked at the same time if they are
                free. Busy practitioners are disabled below.
              </p>
            ) : null}
            <PatientLookup
              value={bookPatientId}
              onChange={(id, detail) => {
                setBookPatientId(id);
                setBookIntakeNote(detail?.intakeNote ?? null);
              }}
            />
            {bookIntakeNote ? (
              <p className="muted book-fineprint">
                Intake on file: {bookIntakeNote}
              </p>
            ) : null}
            <label className="field">
              <span>Service</span>
              <select
                value={bookTypeId}
                onChange={(e) => {
                  const id = e.target.value;
                  setBookTypeId(id);
                  const t = catalog?.appointmentTypes.find((x) => x.id === id);
                  if (t) {
                    setBookDuration(t.durationMinutes);
                    setBookFeePounds(
                      t.defaultPriceCents
                        ? (t.defaultPriceCents / 100).toFixed(2)
                        : "",
                    );
                  }
                }}
              >
                {bookableTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.durationMinutes} min · £
                    {(t.defaultPriceCents / 100).toFixed(2)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Practitioner</span>
              <select
                value={bookPractitionerId}
                onChange={(e) => {
                  setBookPractitionerId(e.target.value);
                  const prac = catalog?.practitioners.find(
                    (p) => p.id === e.target.value,
                  );
                  if (prac?.appointmentTypeIds?.length) {
                    const allowed = new Set(prac.appointmentTypeIds);
                    if (!allowed.has(bookTypeId)) {
                      const next =
                        catalog?.appointmentTypes.find((t) =>
                          allowed.has(t.id),
                        ) ?? null;
                      if (next) {
                        setBookTypeId(next.id);
                        setBookDuration(next.durationMinutes);
                        setBookFeePounds(
                          next.defaultPriceCents
                            ? (next.defaultPriceCents / 100).toFixed(2)
                            : "",
                        );
                      }
                    }
                  }
                }}
              >
                {catalog?.practitioners.map((p) => {
                  const busyAtFixed =
                    bookSlotFixed && bookSlot
                      ? busyPractitionerIdsAt(
                          new Date(bookSlot),
                          Math.floor(
                            clinicMinutesFromMidnight(
                              new Date(bookSlot),
                              timeZone,
                            ) / 60,
                          ),
                        ).has(p.id)
                      : false;
                  return (
                    <option key={p.id} value={p.id} disabled={busyAtFixed}>
                      {p.displayName}
                      {busyAtFixed ? " (busy)" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="field">
              <span>Length (minutes)</span>
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={bookDuration}
                onChange={(e) => setBookDuration(Number(e.target.value))}
              />
            </label>
            {!bookSlotFixed ? (
              <label className="field">
                <span>Slot</span>
                <select
                  value={bookSlot}
                  onChange={(e) => setBookSlot(e.target.value)}
                >
                  {bookSlots.length === 0 ? (
                    <option value="">No open slots</option>
                  ) : (
                    bookSlots.map((s) => (
                      <option key={s} value={s}>
                        {format(new Date(s), "EEE d MMM HH:mm")}
                      </option>
                    ))
                  )}
                </select>
              </label>
            ) : null}
            <div className="sheet-more">
              <button
                type="button"
                className="btn-ghost btn-sm sheet-more-toggle"
                aria-expanded={bookOptionsOpen}
                onClick={() => setBookOptionsOpen((o) => !o)}
              >
                {bookOptionsOpen ? "Hide options" : "Options…"}
              </button>
              {!bookOptionsOpen &&
              (bookFeePounds.trim() ||
                bookNotes.trim() ||
                bookWeeklyCount > 1) ? (
                <p className="muted book-fineprint">
                  {bookWeeklyCount > 1
                    ? `${bookWeeklyCount}× ${
                        bookIntervalWeeks > 1 ? "fortnightly" : "weekly"
                      }`
                    : null}
                  {bookWeeklyCount > 1 &&
                  (bookFeePounds.trim() || bookNotes.trim())
                    ? " · "
                    : null}
                  {bookFeePounds.trim()
                    ? `Fee £${Number(bookFeePounds).toFixed(2)}`
                    : null}
                  {bookFeePounds.trim() && bookNotes.trim() ? " · " : null}
                  {bookNotes.trim()
                    ? `Notes: ${bookNotes.trim().slice(0, 60)}${
                        bookNotes.trim().length > 60 ? "…" : ""
                      }`
                    : null}
                </p>
              ) : null}
              {bookOptionsOpen ? (
                <div className="sheet-more-body">
                  <label className="field">
                    <span>Repeat</span>
                    <select
                      value={bookWeeklyCount}
                      onChange={(e) => setBookWeeklyCount(Number(e.target.value))}
                    >
                      <option value={1}>No repeat — one appointment</option>
                      {[2, 3, 4, 6, 8, 12].map((n) => (
                        <option key={n} value={n}>
                          {n} occurrences (same day/time)
                        </option>
                      ))}
                    </select>
                  </label>
                  {bookWeeklyCount > 1 ? (
                    <label className="field">
                      <span>Cadence</span>
                      <select
                        value={bookIntervalWeeks}
                        onChange={(e) =>
                          setBookIntervalWeeks(Number(e.target.value))
                        }
                      >
                        <option value={1}>Every week</option>
                        <option value={2}>Every fortnight</option>
                      </select>
                    </label>
                  ) : null}
                  <label className="field">
                    <span>Fee (£) — optional invoice</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={bookFeePounds}
                      onChange={(e) => setBookFeePounds(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Notes</span>
                    <textarea
                      rows={2}
                      value={bookNotes}
                      onChange={(e) => setBookNotes(e.target.value)}
                    />
                  </label>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !bookSlot || !bookPatientId}
              onClick={() => void createBooking()}
            >
              {busy
                ? "Booking…"
                : bookWeeklyCount > 1
                  ? `Confirm ${bookWeeklyCount}-week series`
                  : "Confirm booking"}
            </button>
          </div>
        </div>
      ) : null}

      {blockOpen ? (
        <div className="sheet-backdrop" onClick={() => setBlockOpen(false)}>
          <div
            className="sheet-card"
            role="dialog"
            aria-label="Manage diary blocks"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-head">
              <h2>Manage blocks</h2>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setBlockOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="block-list">
              <h3>
                In this {viewMode} ({blocks.length})
              </h3>
              {blocks.length === 0 ? (
                <p className="muted">No diary blocks in the current view.</p>
              ) : (
                <>
                  <p className="muted" style={{ margin: "0 0 0.5rem" }}>
                    Remove a day to reopen online and staff booking for that
                    date. Leave requests are under Team → Leave.
                  </p>
                  {blocks.map((b) => (
                    <div key={b.id} className="block-row">
                      <span>
                        {b.date.slice(0, 10)}{" "}
                        {b.startMinute == null
                          ? "all day"
                          : `${minutesLabel(b.startMinute)}–${minutesLabel(b.endMinute ?? 0)}`}
                        {b.reason ? ` · ${b.reason}` : ""}
                        {` · ${b.practitioner.displayName}`}
                      </span>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() =>
                          void removeBlock(
                            b.id,
                            `${b.date.slice(0, 10)}${
                              b.reason ? ` · ${b.reason}` : ""
                            }`,
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => void removeBlocksInView()}
                  >
                    Remove all in this view
                  </button>
                </>
              )}
            </div>

            <hr className="sheet-divider" />
            <h3 className="sheet-subhead">Add a block</h3>
            <label className="field">
              <span>Practitioner</span>
              <select
                value={blockPractitionerId}
                onChange={(e) => setBlockPractitionerId(e.target.value)}
              >
                {catalog?.practitioners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={blockDate}
                onChange={(e) => setBlockDate(e.target.value)}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={blockAllDay}
                onChange={(e) => setBlockAllDay(e.target.checked)}
              />
              <span>All day</span>
            </label>
            {!blockAllDay ? (
              <div className="inline-row">
                <label className="field">
                  <span>From</span>
                  <input
                    type="time"
                    value={blockStart}
                    onChange={(e) => setBlockStart(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>To</span>
                  <input
                    type="time"
                    value={blockEnd}
                    onChange={(e) => setBlockEnd(e.target.value)}
                  />
                </label>
              </div>
            ) : null}
            <label className="field">
              <span>Reason</span>
              <input
                type="text"
                placeholder="Lunch, admin, meeting…"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => void createBlock()}
            >
              {busy ? "Saving…" : "Save block"}
            </button>
          </div>
        </div>
      ) : null}

      {feedOpen ? (
        <div className="sheet-backdrop" onClick={() => setFeedOpen(false)}>
          <div
            className="sheet-card"
            role="dialog"
            aria-label="Phone calendar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="panel-head">
              <h2>Phone calendar</h2>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setFeedOpen(false)}
              >
                Close
              </button>
            </div>
            <p className="muted">
              Subscribe your Treow diary on iPhone, Google Calendar, or Outlook.
              The link is private — treat it like a password.
            </p>
            {feedMessage ? <p className="alert-line">{feedMessage}</p> : null}
            {feedWebcal ? (
              <label className="field">
                <span>Subscribe link (iPhone)</span>
                <div className="inline-row">
                  <input readOnly value={feedWebcal} />
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => void copyFeed(feedWebcal)}
                  >
                    Copy
                  </button>
                </div>
              </label>
            ) : null}
            {feedUrl ? (
              <label className="field">
                <span>HTTPS link (Google / Outlook)</span>
                <div className="inline-row">
                  <input readOnly value={feedUrl} />
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => void copyFeed(feedUrl)}
                  >
                    Copy
                  </button>
                  <a className="btn-ghost btn-sm" href={feedUrl}>
                    Download .ics
                  </a>
                </div>
              </label>
            ) : (
              <p className="muted">Loading feed…</p>
            )}
            {feedHint ? (
              <ul className="muted feed-hint-list">
                {feedHint.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={busy}
              onClick={() => void rotatePhoneFeed()}
            >
              Rotate link (revoke old phones)
            </button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
