import { EditorView } from "@codemirror/view";
import { describe, expect, it, vi } from "vitest";
import { jumpToLine } from "../src/editor/jumpToLine";

describe("jumpToLine", () => {
  it("selects and focuses a clamped document line", () => {
    const scroll = vi.spyOn(EditorView, "scrollIntoView").mockReturnValue({} as never);
    const focus = vi.fn();
    const dispatch = vi.fn();
    const view = {
      state: {
        doc: {
          lines: 10,
          line: (n: number) => ({ from: n * 10 }),
        },
      },
      dispatch,
      focus,
    };

    jumpToLine(view as never, 4);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ selection: { anchor: 40, head: 40 } }),
    );
    expect(scroll).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();

    jumpToLine(view as never, 99);
    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ selection: { anchor: 100, head: 100 } }),
    );

    jumpToLine({ ...view, state: { doc: { lines: 0, line: () => ({ from: 0 }) } } } as never, 1);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
