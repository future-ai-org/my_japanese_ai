import { EditorView } from "@codemirror/view";

export function jumpToLine(view: EditorView, line: number): void {
  const max = view.state.doc.lines;
  if (max < 1) return;
  const target = Math.min(Math.max(Math.trunc(line), 1), max);
  const info = view.state.doc.line(target);
  view.dispatch({
    selection: { anchor: info.from, head: info.from },
    effects: EditorView.scrollIntoView(info.from, { y: "center" }),
  });
  view.focus();
}
