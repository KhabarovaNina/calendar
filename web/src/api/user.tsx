// Единый источник данных текущего пользователя (/me). useResource без кэша,
// поэтому раньше /me запрашивался трижды (Layout, EventTypesPage, ProfilePage).
// Провайдер тянет его один раз и раздаёт через контекст — дедупликация запроса
// без внешних зависимостей вроде SWR.

import { createContext, useContext, type ReactNode } from "react";
import { meApi, type User } from "./client";
import { useResource, type Resource } from "./useApi";

const UserContext = createContext<Resource<User> | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const resource = useResource(() => meApi.get(), []);
  return <UserContext.Provider value={resource}>{children}</UserContext.Provider>;
}

/** Текущий пользователь из общего запроса /me. */
export function useCurrentUser(): Resource<User> {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useCurrentUser должен использоваться внутри <UserProvider>");
  return ctx;
}
