import { useEffect, useRef, type RefObject } from "react";

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type ModalBehaviorOptions = {
  closeDisabled?: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  open: boolean;
};

export function useModalBehavior({
  closeDisabled = false,
  containerRef,
  onClose,
  open,
}: ModalBehaviorOptions) {
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);

  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  }, [closeDisabled, onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return undefined;
    }

    const container = containerRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const focusFrame = window.requestAnimationFrame(() => {
      const target = container?.querySelector<HTMLElement>(
        `[data-autofocus="true"], ${focusableSelector}`,
      );
      target?.focus();
    });

    function isTopModal() {
      const layers = document.querySelectorAll<HTMLElement>("[data-modal-layer='true']");
      return layers.length === 0 || layers.item(layers.length - 1) === container;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!container || !isTopModal()) {
        return;
      }

      if (event.key === "Escape" && !closeDisabledRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("hidden"));

      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, [containerRef, open]);
}
