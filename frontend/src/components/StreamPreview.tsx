import { memo, useLayoutEffect, useRef } from "react";
import { APP_CONFIG } from "../config/app";
import { useLocale } from "../i18n/locale";

interface StreamPreviewProps {
  text: string;
}

export const StreamPreview = memo(function StreamPreview({
  text,
}: StreamPreviewProps) {
  const { t } = useLocale();
  const scrollerRef = useRef<HTMLPreElement>(null);
  const stickToBottom = useRef(true);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    if (el.textContent !== text) el.textContent = text;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <pre
      ref={scrollerRef}
      className="stream-preview"
      tabIndex={0}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label={t("results.streamAria")}
      onScroll={(event) => {
        const el = event.currentTarget;
        stickToBottom.current =
          el.scrollHeight - el.scrollTop - el.clientHeight <
          APP_CONFIG.ui.streamStickinessPx;
      }}
    />
  );
});
