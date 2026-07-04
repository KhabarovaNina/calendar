// Типы зеркалят TypeSpec-спеку (main.tsp + api/*.tsp)

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface ApiError {
  code: number;
  errorCode: string;
  message: string;
}

export interface Page<T> {
  items: T[];
  totalCount: number;
}

// ── /me ──────────────────────────────────────

export interface User {
  id: number;
  username: string;
  name: string;
  email: string;
  timeZone: string;
  locale?: string;
  avatarUrl?: string;
  defaultScheduleId?: number;
  createdAt: string;
}

// ── /event-types ─────────────────────────────

export type EventLocation =
  | { type: "address"; address: string; displayPublicly?: boolean }
  | { type: "link"; link: string }
  | { type: "phone"; phone?: string }
  | { type: "integration"; integration: "google-meet" | "zoom" | "ms-teams" | "daily" }
  | { type: "attendeeDefined" };

export type BookingFieldType =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "phone"
  | "select"
  | "multiselect"
  | "checkbox"
  | "radio"
  | "boolean";

export interface BookingField {
  type: BookingFieldType;
  name: string;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  hidden?: boolean;
}

export type SchedulingType = "individual" | "collective" | "roundRobin";

export interface Recurrence {
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  count: number;
}

export interface BookingLimits {
  day?: number;
  week?: number;
  month?: number;
  year?: number;
}

export interface EventPrice {
  amount: number;
  currency: string;
}

export interface EventType {
  id: number;
  title: string;
  slug: string;
  description?: string;
  lengthInMinutes: number;
  lengthInMinutesOptions?: number[];
  locations: EventLocation[];
  bookingFields?: BookingField[];
  hidden: boolean;
  requiresConfirmation: boolean;
  disableGuests: boolean;
  minimumBookingNotice: number;
  beforeEventBuffer: number;
  afterEventBuffer: number;
  slotInterval?: number;
  seatsPerTimeSlot?: number;
  bookingWindowDays?: number;
  bookingLimits?: BookingLimits;
  recurrence?: Recurrence;
  schedulingType: SchedulingType;
  price?: EventPrice;
  scheduleId?: number;
  ownerId: number;
  createdAt: string;
  updatedAt: string;
}

// ── /availability ────────────────────────────

export interface AvailabilityRule {
  days: Weekday[];
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

export interface DateOverrideInterval {
  startTime: string;
  endTime: string;
}

export interface DateOverride {
  date: string; // YYYY-MM-DD
  intervals: DateOverrideInterval[];
}

export interface Schedule {
  id: number;
  name: string;
  timeZone: string;
  availability: AvailabilityRule[];
  overrides?: DateOverride[];
  isDefault: boolean;
  ownerId: number;
}

// ── /slots ───────────────────────────────────

export interface Slot {
  start: string; // ISO datetime
  end: string;
  seatsAvailable?: number;
}

export interface SlotsResponse {
  slots: Record<string, Slot[]>;
}

// ── /bookings, /upcoming ─────────────────────

export type BookingStatus = "pending" | "accepted" | "rejected" | "cancelled";

export interface Attendee {
  name: string;
  email: string;
  timeZone: string;
  locale?: string;
  phone?: string;
}

export interface Booking {
  id: number;
  uid: string;
  eventTypeId: number;
  status: BookingStatus;
  title: string;
  start: string;
  end: string;
  organizer: User;
  attendees: Attendee[];
  guests?: string[];
  location: EventLocation;
  meetingUrl?: string;
  bookingFieldsResponses?: Record<string, unknown>;
  cancellationReason?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBookingRequest {
  eventTypeId: number;
  start: string;
  lengthInMinutes?: number;
  attendee: Attendee;
  guests?: string[];
  location?: EventLocation;
  bookingFieldsResponses?: Record<string, unknown>;
  metadata?: Record<string, string>;
}
