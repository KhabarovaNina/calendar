// Глобальное модальное подтверждение действий (замена нативному window.confirm).
//
// Использование:
//   import { confirm } from "../components/confirm";
//   const ok = await confirm({ title: "Удалить?", message: "…", danger: true });
//   if (!ok) return;
//
// Провайдер `ConfirmProvider` монтируется один раз в main.tsx и рендерит
// единственную Mantine-модалку. Императивная функция `confirm()` возвращает
// Promise<boolean> — по образцу notifications.show().

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";

export interface ConfirmOptions {
  title?: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Красная кнопка подтверждения — для необратимых/деструктивных действий. */
  danger?: boolean;
}

let confirmFn: ((o: ConfirmOptions) => Promise<boolean>) | null = null;

/** Показать модалку подтверждения. Резолвится в true/false. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  if (!confirmFn) return Promise.resolve(false);
  return confirmFn(options);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  confirmFn = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <>
      {children}
      <Modal
        opened={!!opts}
        onClose={() => close(false)}
        title={opts?.title ?? "Подтверждение"}
        centered
        zIndex={1000}
      >
        <Stack>
          {opts?.message && (
            <Text size="sm" c="dimmed">
              {opts.message}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => close(false)}>
              {opts?.cancelLabel ?? "Отмена"}
            </Button>
            <Button color={opts?.danger ? "red" : undefined} onClick={() => close(true)} data-autofocus>
              {opts?.confirmLabel ?? "Подтвердить"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
