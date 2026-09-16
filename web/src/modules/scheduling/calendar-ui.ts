/** Active statuses that occupy a practitioner's diary slot. */
const OCCUPYING = new Set([
  "BOOKED",
  "CONFIRMED",
  "CHECKED_IN",
  "IN_PROGRESS",
  "COMPLETED",
]);

export function appointmentOccupiesSlot(status: string): boolean {
  return OCCUPYING.has(status.toUpperCase());
}

/** CSS modifier for calendar event colouring by appointment status. */
export function calendarEventStatusClass(status: string): string {
  switch (status.toUpperCase()) {
    case "COMPLETED":
      return "status-completed";
    case "NO_SHOW":
      return "status-no_show";
    case "CANCELLED":
      return "status-cancelled";
    case "CHECKED_IN":
    case "IN_PROGRESS":
      return "status-in_progress";
    case "CONFIRMED":
      return "status-confirmed";
    case "BOOKED":
    default:
      return "status-booked";
  }
}

export function humanStatusLabel(status: string): string {
  switch (status.toUpperCase()) {
    case "NO_SHOW":
      return "No-show";
    case "CHECKED_IN":
      return "Checked in";
    case "IN_PROGRESS":
      return "In progress";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    case "CONFIRMED":
      return "Confirmed";
    case "BOOKED":
    default:
      return "Booked";
  }
}
