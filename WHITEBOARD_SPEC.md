# Whiteboard spec

Both clients draw one square. Coordinates and brush sizes are fractions of that side. Each platform only chooses how large to draw the square, letterboxed so it never stretches. Convert to pixels at draw time: `strokeWidth * boardSidePx`.

| Thing | Value |
| --- | --- |
| Board | Square, coordinates 0..1 on both axes |
| Pen width | `0.006` |
| Eraser width | Slider `0.01..0.12`, default `0.05` |
| Points | Clamped to 0..1 |
| Stroke width when rendering | `strokeWidth * boardSidePx` |

Saved JSON stays version 2. `isNormalized: true` means points and `strokeWidth` are in this square. Older strokes that omit `isNormalized` are absolute pixels from before this spec.

Mirror these numbers in `websitepersonal/src/whiteboard-model.ts` and `android/.../whiteboard/WhiteboardSpec.kt`. Do not save raw px or dp.

Golden sample:

```json
{
  "version": 2,
  "slides": [
    {
      "id": 1,
      "title": "Slide 1",
      "strokes": [
        {
          "points": [
            { "x": 0.2, "y": 0.2 },
            { "x": 0.8, "y": 0.8 }
          ],
          "colorArgb": -16777216,
          "strokeWidth": 0.006,
          "isEraser": false,
          "isNormalized": true
        }
      ]
    }
  ]
}
```
