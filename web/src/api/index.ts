// Единая точка доступа к API.
// Сейчас — мок; при появлении реального бэкенда достаточно заменить
// реализацию на HTTP-клиент с теми же сигнатурами (контракт — в TypeSpec-спеке).

export {
  me,
  eventTypes,
  availability,
  slots,
  bookings,
  upcoming,
  publicPages,
  resetMockData,
  MockApiError,
} from "./mock/client";

export * from "./types";
