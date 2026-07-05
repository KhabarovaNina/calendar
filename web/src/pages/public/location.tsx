import {
  IconMapPin,
  IconLink,
  IconPhone,
  IconVideo,
  IconUser,
  type IconProps,
} from "@tabler/icons-react";
import type { EventLocation } from "../../api/client";

const INTEGRATION_LABEL: Record<string, string> = {
  "google-meet": "Google Meet",
  zoom: "Zoom",
  "ms-teams": "Microsoft Teams",
  daily: "Daily",
};

/**
 * Человекочитаемое описание места встречи + иконка.
 * `EventLocation` в сгенерированной схеме теряет `type` у части вариантов
 * (особенность эмиттера для дискриминированных union), поэтому приводим к union.
 */
export function describeLocation(
  loc: EventLocation | undefined,
): { label: string; Icon: React.ComponentType<IconProps> } | null {
  const l = loc as EventLocation | undefined;
  if (!l) return null;
  switch (l.type) {
    case "integration":
      return { label: INTEGRATION_LABEL[l.integration] ?? l.integration, Icon: IconVideo };
    case "link":
      return { label: "Видеовстреча по ссылке", Icon: IconLink };
    case "address":
      return { label: l.address, Icon: IconMapPin };
    case "phone":
      return { label: "Телефонный звонок", Icon: IconPhone };
    case "attendeeDefined":
      return { label: "Место на выбор участника", Icon: IconUser };
    default:
      return null;
  }
}
