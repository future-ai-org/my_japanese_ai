type StreamProgressListener = (progress: {
  progress: number;
  text: string;
  streamedText: string;
}) => void;

export function createThrottledStreamProgress(
  onProgress?: StreamProgressListener,
) {
  let latest: string | undefined;
  let frame = 0;

  const publish = (streamedText: string) => {
    onProgress?.({
      progress: 1,
      text: "Generating the review…",
      streamedText,
    });
  };

  return {
    push(streamedText: string) {
      const first = latest === undefined;
      latest = streamedText;
      if (first) {
        publish(streamedText);
        return;
      }
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (latest !== undefined) publish(latest);
      });
    },
    flush() {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      if (latest !== undefined) publish(latest);
    },
    cancel() {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    },
  };
}
