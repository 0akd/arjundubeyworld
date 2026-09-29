export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  points: Point[];
  colorArgb: number;
  strokeWidth: number;
  isEraser: boolean;
  isNormalized: boolean;
}

export interface WhiteboardSlide {
  id: number;
  title: string;
  strokes: Stroke[];
}

export interface WhiteboardSavedData {
  version: number;
  slides: WhiteboardSlide[];
}

export interface BoardHistory {
  slides: WhiteboardSlide[];
  page: number;
  history: WhiteboardSlide[][];
  historyIndex: number;
}

export const BLACK_ARGB = argb(0, 0, 0);
export const WHITE_ARGB = argb(255, 255, 255);

/** Fractions of the square board side. See WHITEBOARD_SPEC.md. */
export const PEN_WIDTH = 0.006;
export const ERASER_MIN = 0.01;
export const ERASER_MAX = 0.12;
export const ERASER_DEFAULT = 0.05;

export function argb(
  red: number,
  green: number,
  blue: number,
  alpha = 255,
): number {
  const unsigned =
    (((alpha & 255) << 24) |
      ((red & 255) << 16) |
      ((green & 255) << 8) |
      (blue & 255)) >>>
    0;
  return unsigned | 0;
}

export function cssFromArgb(color: number): string {
  const unsigned = color >>> 0;
  const alpha = ((unsigned >>> 24) & 255) / 255;
  const red = (unsigned >>> 16) & 255;
  const green = (unsigned >>> 8) & 255;
  const blue = unsigned & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function emptyBoard(): WhiteboardSavedData {
  return { version: 2, slides: [{ id: 1, title: "Slide 1", strokes: [] }] };
}

export function parseWhiteboard(json: string): WhiteboardSavedData {
  if (!json.trim()) return emptyBoard();
  try {
    const parsed = JSON.parse(json) as unknown;
    if (isRecord(parsed) && Array.isArray(parsed.slides)) {
      const slides = parsed.slides.flatMap((item) => {
        const slide = asSlide(item);
        return slide ? [slide] : [];
      });
      return {
        version: typeof parsed.version === "number" ? parsed.version : 2,
        slides: slides.length ? slides : emptyBoard().slides,
      };
    }
    if (Array.isArray(parsed)) {
      if (
        parsed.some((item) => isRecord(item) && Array.isArray(item.strokes))
      ) {
        const slides = parsed.flatMap((item) => {
          const slide = asSlide(item);
          return slide ? [slide] : [];
        });
        if (slides.length) return { version: 2, slides };
      }
      const strokes = parsed.flatMap((item) => {
        const stroke = asStroke(item);
        return stroke ? [stroke] : [];
      });
      if (strokes.length) {
        return { version: 2, slides: [{ id: 1, title: "Slide 1", strokes }] };
      }
    }
  } catch {
    // Fall through to an empty board when the saved text is not JSON.
  }
  return emptyBoard();
}

export function serializeWhiteboard(data: WhiteboardSavedData): string {
  return JSON.stringify({ version: 2, slides: data.slides });
}

export function cloneSlides(
  slides: readonly WhiteboardSlide[],
): WhiteboardSlide[] {
  return JSON.parse(JSON.stringify(slides)) as WhiteboardSlide[];
}

export function loadBoard(json: string): BoardHistory {
  const parsed = parseWhiteboard(json);
  return {
    slides: cloneSlides(parsed.slides),
    page: 0,
    history: [cloneSlides(parsed.slides)],
    historyIndex: 0,
  };
}

export function pushHistory(
  state: BoardHistory,
  slides: readonly WhiteboardSlide[],
) {
  const clipped = state.history.slice(0, state.historyIndex + 1);
  const next = [...clipped, cloneSlides(slides)].slice(-40);
  state.history = next;
  state.historyIndex = next.length - 1;
  state.slides = cloneSlides(slides);
  if (state.page > state.slides.length - 1)
    state.page = Math.max(0, state.slides.length - 1);
}

export function undoBoard(state: BoardHistory): boolean {
  if (state.historyIndex <= 0) return false;
  state.historyIndex -= 1;
  state.slides = cloneSlides(state.history[state.historyIndex] ?? []);
  if (state.page > state.slides.length - 1)
    state.page = Math.max(0, state.slides.length - 1);
  return true;
}

export function redoBoard(state: BoardHistory): boolean {
  if (state.historyIndex >= state.history.length - 1) return false;
  state.historyIndex += 1;
  state.slides = cloneSlides(state.history[state.historyIndex] ?? []);
  if (state.page > state.slides.length - 1)
    state.page = Math.max(0, state.slides.length - 1);
  return true;
}

export function addSlide(state: BoardHistory) {
  const id =
    state.slides.reduce((max, slide) => Math.max(max, slide.id), 0) + 1;
  const slides = [...state.slides, { id, title: `Slide ${id}`, strokes: [] }];
  pushHistory(state, slides);
  state.page = slides.length - 1;
}

export function removeCurrentSlide(state: BoardHistory) {
  if (state.slides.length <= 1) return;
  const nextPage = Math.min(state.page, state.slides.length - 2);
  pushHistory(
    state,
    state.slides.filter((_, index) => index !== state.page),
  );
  state.page = nextPage;
}

export function clearCurrentSlide(state: BoardHistory) {
  pushHistory(
    state,
    state.slides.map((slide, index) =>
      index === state.page ? { ...slide, strokes: [] } : slide,
    ),
  );
}

export function simplifyPoints(points: readonly Point[]): Point[] {
  if (points.length <= 10) return [...points];
  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const previous = points[index - 1];
    return (
      Math.abs(point.x - previous.x) > 0.002 ||
      Math.abs(point.y - previous.y) > 0.002
    );
  });
}

export function normalizedPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): Point {
  const width = rect.width || 1;
  const height = rect.height || 1;
  return {
    x: clamp((clientX - rect.left) / width),
    y: clamp((clientY - rect.top) / height),
  };
}

function asSlide(value: unknown): WhiteboardSlide | null {
  if (!isRecord(value) || !Array.isArray(value.strokes)) return null;
  const strokes = value.strokes.flatMap((item) => {
    const stroke = asStroke(item);
    return stroke ? [stroke] : [];
  });
  return {
    id: typeof value.id === "number" ? value.id : 1,
    title: typeof value.title === "string" ? value.title : "Slide",
    strokes,
  };
}

function asStroke(value: unknown): Stroke | null {
  if (!isRecord(value) || !Array.isArray(value.points)) return null;
  const points: Point[] = [];
  for (const point of value.points) {
    if (
      !isRecord(point) ||
      typeof point.x !== "number" ||
      typeof point.y !== "number"
    )
      continue;
    points.push({ x: point.x, y: point.y });
  }
  return {
    points,
    colorArgb:
      typeof value.colorArgb === "number" ? value.colorArgb : BLACK_ARGB,
    strokeWidth:
      typeof value.strokeWidth === "number" ? value.strokeWidth : 0.01,
    isEraser: value.isEraser === true,
    isNormalized: value.isNormalized === true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
