import {
  BLACK_ARGB,
  WHITE_ARGB,
  cssFromArgb,
  type Point,
  type Stroke,
  type WhiteboardSlide,
} from "./whiteboard-model";

export interface PaintInput {
  slide: WhiteboardSlide | undefined;
  draft: readonly Point[];
  erasing: boolean;
  eraserWidth: number;
  dark: boolean;
}

export function paintWhiteboard(canvas: HTMLCanvasElement, input: PaintInput) {
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  if (cssWidth <= 0 || cssHeight <= 0) return;

  const pixelRatio = window.devicePixelRatio || 1;
  const bitmapWidth = Math.max(1, Math.round(cssWidth * pixelRatio));
  const bitmapHeight = Math.max(1, Math.round(cssHeight * pixelRatio));
  if (canvas.width !== bitmapWidth || canvas.height !== bitmapHeight) {
    canvas.width = bitmapWidth;
    canvas.height = bitmapHeight;
  }

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, cssWidth, cssHeight);
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const stroke of input.slide?.strokes ?? []) {
    drawStroke(context, stroke, cssWidth, cssHeight, input.dark);
  }

  if (input.draft.length > 1) {
    drawStroke(
      context,
      {
        points: [...input.draft],
        colorArgb: input.dark ? WHITE_ARGB : BLACK_ARGB,
        strokeWidth: input.erasing ? input.eraserWidth : 8,
        isEraser: input.erasing,
        isNormalized: false,
      },
      cssWidth,
      cssHeight,
      input.dark,
      true,
    );
  }
}

function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: Stroke,
  cssWidth: number,
  cssHeight: number,
  dark: boolean,
  draft = false,
) {
  if (stroke.points.length < 2) return;
  context.save();
  context.globalCompositeOperation = stroke.isEraser
    ? "destination-out"
    : "source-over";
  context.strokeStyle = stroke.isEraser
    ? "rgba(0,0,0,1)"
    : inkColor(stroke.colorArgb, dark);
  context.lineWidth =
    draft || !stroke.isNormalized
      ? stroke.strokeWidth
      : stroke.strokeWidth * cssWidth;
  context.beginPath();
  const first = stroke.points[0];
  context.moveTo(
    scaleX(first, stroke, cssWidth, draft),
    scaleY(first, stroke, cssHeight, draft),
  );
  for (const point of stroke.points.slice(1)) {
    context.lineTo(
      scaleX(point, stroke, cssWidth, draft),
      scaleY(point, stroke, cssHeight, draft),
    );
  }
  context.stroke();
  context.restore();
}

function scaleX(
  point: Point,
  stroke: Stroke,
  cssWidth: number,
  draft: boolean,
): number {
  return draft || stroke.isNormalized ? point.x * cssWidth : point.x;
}

function scaleY(
  point: Point,
  stroke: Stroke,
  cssHeight: number,
  draft: boolean,
): number {
  return draft || stroke.isNormalized ? point.y * cssHeight : point.y;
}

function inkColor(color: number, dark: boolean): string {
  if (dark && color === BLACK_ARGB) return cssFromArgb(WHITE_ARGB);
  if (!dark && color === WHITE_ARGB) return cssFromArgb(BLACK_ARGB);
  return cssFromArgb(color);
}
