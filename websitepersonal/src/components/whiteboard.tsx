import {
  $,
  component$,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
  type QRL,
} from "@builder.io/qwik";
import { paintWhiteboard } from "../whiteboard-paint";
import {
  BLACK_ARGB,
  ERASER_DEFAULT,
  ERASER_MAX,
  ERASER_MIN,
  PEN_WIDTH,
  WHITE_ARGB,
  addSlide,
  clearCurrentSlide,
  loadBoard,
  normalizedPoint,
  pushHistory,
  redoBoard,
  removeCurrentSlide,
  serializeWhiteboard,
  simplifyPoints,
  undoBoard,
  type BoardHistory,
  type Point,
  type Stroke,
} from "../whiteboard-model";

interface WhiteboardProps {
  todoId: string;
  title: string;
  json: string;
  notice?: string;
  onClose$: QRL<() => void>;
  onSave$: QRL<(json: string) => void>;
}

export const WebWhiteboard = component$((props: WhiteboardProps) => {
  const canvasRef = useSignal<HTMLCanvasElement>();
  const saveTimer = useSignal(0);
  const gesture = useSignal<{ drawing: boolean; points: Point[] }>({
    drawing: false,
    points: [],
  });
  const state = useStore({
    loadedId: "",
    erasing: false,
    eraserWidth: ERASER_DEFAULT,
    showControls: true,
    dirty: false,
    dark: false,
    ...(loadBoard("") as BoardHistory),
  });

  useTask$(({ track }) => {
    const todoId = track(() => props.todoId);
    const json = track(() => props.json);
    if (state.loadedId === todoId) return;
    const loaded = loadBoard(json);
    state.loadedId = todoId;
    state.slides = loaded.slides;
    state.page = loaded.page;
    state.history = loaded.history;
    state.historyIndex = loaded.historyIndex;
    state.dirty = false;
    state.erasing = false;
  });

  const paint = $(() => {
    const canvas = canvasRef.value;
    if (!canvas) return;
    paintWhiteboard(canvas, {
      slide: state.slides[state.page],
      draft: gesture.value.points,
      erasing: gesture.value.drawing && state.erasing,
      eraserWidth: state.eraserWidth,
      dark: state.dark,
    });
  });

  const persist = $(async (closeAfter: boolean) => {
    window.clearTimeout(saveTimer.value);
    if (state.dirty) {
      try {
        await props.onSave$(
          serializeWhiteboard({ version: 2, slides: state.slides }),
        );
        state.dirty = false;
      } catch {
        state.dirty = true;
        return;
      }
    }
    if (closeAfter) await props.onClose$();
  });

  const scheduleSave = $(() => {
    state.dirty = true;
    window.clearTimeout(saveTimer.value);
    saveTimer.value = window.setTimeout(() => {
      void persist(false);
    }, 1800);
  });

  const commitStroke = $(() => {
    const canvas = canvasRef.value;
    const points = simplifyPoints(gesture.value.points);
    gesture.value.drawing = false;
    gesture.value.points = [];
    if (!canvas || points.length < 2) {
      paint();
      return;
    }
    const stroke: Stroke = {
      points,
      colorArgb: state.dark ? WHITE_ARGB : BLACK_ARGB,
      strokeWidth: state.erasing ? state.eraserWidth : PEN_WIDTH,
      isEraser: state.erasing,
      isNormalized: true,
    };
    const slides = state.slides.map((slide, index) =>
      index === state.page
        ? { ...slide, strokes: [...slide.strokes, stroke] }
        : slide,
    );
    pushHistory(state, slides);
    state.dirty = true;
    scheduleSave();
    paint();
  });

  // Canvas, theme, and keyboard listeners exist only in the browser.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    state.dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => {
      state.dark = media.matches;
      void paint();
    };
    media.addEventListener("change", onTheme);
    const canvas = canvasRef.value;
    const observer = new ResizeObserver(() => {
      void paint();
    });
    if (canvas) observer.observe(canvas);
    void paint();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") void persist(true);
    };
    window.addEventListener("keydown", onKey);
    cleanup(() => {
      observer.disconnect();
      media.removeEventListener("change", onTheme);
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(saveTimer.value);
      if (state.dirty)
        void props.onSave$(
          serializeWhiteboard({ version: 2, slides: state.slides }),
        );
    });
  });

  return (
    <section
      class={state.dark ? "whiteboard dark-board" : "whiteboard"}
      aria-label="Whiteboard"
    >
      <div class="whiteboard-top">
        <strong>{props.title}</strong>
        {props.notice && <p class="error">{props.notice}</p>}
        {state.showControls && (
          <div class="whiteboard-tools">
            <button
              type="button"
              class={!state.erasing ? "tool active" : "tool"}
              onClick$={() => (state.erasing = false)}
            >
              Pen
            </button>
            <button
              type="button"
              class={state.erasing ? "tool active" : "tool"}
              onClick$={() => (state.erasing = true)}
            >
              Eraser
            </button>
            {state.erasing && (
              <label class="eraser-size">
                Size
                <input
                  type="range"
                  min={ERASER_MIN}
                  max={ERASER_MAX}
                  step={0.005}
                  value={state.eraserWidth}
                  onInput$={(_, element) => {
                    state.eraserWidth = Number(element.value);
                  }}
                />
              </label>
            )}
            <button
              type="button"
              class="tool"
              onClick$={() => {
                clearCurrentSlide(state);
                state.dirty = true;
                scheduleSave();
                paint();
              }}
            >
              Clear
            </button>
            <button
              type="button"
              class="tool"
              disabled={state.historyIndex <= 0}
              onClick$={() => {
                if (!undoBoard(state)) return;
                state.dirty = true;
                scheduleSave();
                paint();
              }}
            >
              Undo
            </button>
            <button
              type="button"
              class="tool"
              disabled={state.historyIndex >= state.history.length - 1}
              onClick$={() => {
                if (!redoBoard(state)) return;
                state.dirty = true;
                scheduleSave();
                paint();
              }}
            >
              Redo
            </button>
          </div>
        )}
        <div class="whiteboard-tools">
          <button type="button" class="btn" onClick$={() => persist(true)}>
            Save
          </button>
          <button
            type="button"
            class="tool"
            onClick$={() => (state.showControls = !state.showControls)}
          >
            {state.showControls ? "Hide tools" : "Show tools"}
          </button>
        </div>
      </div>

      <div class="whiteboard-stage">
        <canvas
          ref={canvasRef}
          class="whiteboard-canvas"
          onPointerDown$={(event) => {
            const canvas = event.target as HTMLCanvasElement;
            canvas.setPointerCapture(event.pointerId);
            const rect = canvas.getBoundingClientRect();
            gesture.value.drawing = true;
            gesture.value.points = [
              normalizedPoint(event.clientX, event.clientY, rect),
            ];
            paint();
          }}
          onPointerMove$={(event) => {
            if (!gesture.value.drawing) return;
            const canvas = event.target as HTMLCanvasElement;
            const rect = canvas.getBoundingClientRect();
            gesture.value.points.push(
              normalizedPoint(event.clientX, event.clientY, rect),
            );
            paint();
          }}
          onPointerUp$={() => commitStroke()}
          onPointerCancel$={() => {
            gesture.value.drawing = false;
            gesture.value.points = [];
            paint();
          }}
        />
      </div>

      {state.showControls && (
        <div class="slide-bar">
          <div class="slide-list">
            {state.slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                class={index === state.page ? "tool active" : "tool"}
                onClick$={() => {
                  state.page = index;
                  paint();
                }}
              >
                Slide {index + 1}
              </button>
            ))}
          </div>
          <button
            type="button"
            class="btn green"
            onClick$={() => {
              addSlide(state);
              state.dirty = true;
              scheduleSave();
              paint();
            }}
          >
            Add slide
          </button>
          {state.slides.length > 1 && (
            <button
              type="button"
              class="btn danger"
              onClick$={() => {
                removeCurrentSlide(state);
                state.dirty = true;
                scheduleSave();
                paint();
              }}
            >
              Remove slide
            </button>
          )}
        </div>
      )}
    </section>
  );
});
