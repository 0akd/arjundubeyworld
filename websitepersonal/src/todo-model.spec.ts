import assert from "node:assert/strict";
import { collectDeleteOrder, displayTodos, duplicateTree, isValidPaste, reorderTimestamps } from "./todo-tree";
import {
  BLACK_ARGB,
  ERASER_DEFAULT,
  ERASER_MAX,
  ERASER_MIN,
  PEN_WIDTH,
  WHITE_ARGB,
  argb,
  parseWhiteboard,
  serializeWhiteboard,
  simplifyPoints,
} from "./whiteboard-model";
import type { Todo } from "./api";

function todo(partial: Pick<Todo, "id" | "parentId" | "type" | "task"> & Partial<Todo>): Todo {
  return {
    isCompleted: false,
    timestamp: 1,
    steps: [],
    whiteboardJson: "",
    ...partial,
  };
}

const folder = todo({ id: "folder", parentId: "", type: "FOLDER", task: "Folder" });
const child = todo({ id: "child", parentId: "folder", type: "FOLDER", task: "Child", steps: ["one"], whiteboardJson: "{\"version\":2}" });
const grandchild = todo({ id: "leaf", parentId: "child", type: "TODO", task: "Leaf" });
const nodes = [folder, child, grandchild];

assert.deepEqual(collectDeleteOrder("folder", nodes), ["leaf", "child", "folder"]);
assert.equal(isValidPaste("", "folder", nodes), true);
assert.equal(isValidPaste("folder", "folder", nodes), false);
assert.equal(isValidPaste("child", "folder", nodes), false);
assert.equal(isValidPaste("leaf", "folder", nodes), false);

const copies = duplicateTree(folder, "dest", nodes, 100);
assert.equal(copies.length, 3);
assert.equal(copies[0].parentId, "dest");
assert.equal(copies[1].parentId, copies[0].id);
assert.equal(copies[2].parentId, copies[1].id);
assert.notEqual(copies[0].id, folder.id);
assert.equal(copies[1].steps[0], "one");
assert.equal(copies[1].whiteboardJson.includes("version"), true);
assert.equal(copies[0].timestamp, 100);
assert.deepEqual(
  displayTodos(nodes, "folder").map((item) => item.id),
  ["child"],
);

assert.equal(argb(0, 0, 0), -16777216);
assert.equal(BLACK_ARGB, -16777216);
assert.equal(argb(255, 255, 255), -1);
assert.equal(WHITE_ARGB, -1);

const saved = parseWhiteboard(
  JSON.stringify({
    version: 2,
    slides: [
      {
        id: 3,
        title: "Sketch",
        strokes: [
          {
            points: [
              { x: 0.1, y: 0.2 },
              { x: 0.4, y: 0.5 },
            ],
            colorArgb: BLACK_ARGB,
            strokeWidth: 0.02,
            isEraser: false,
            isNormalized: true,
          },
        ],
      },
    ],
  }),
);
assert.equal(saved.slides[0].strokes[0].isNormalized, true);
assert.equal(JSON.parse(serializeWhiteboard(saved)).version, 2);

assert.equal(PEN_WIDTH, 0.006);
assert.equal(ERASER_MIN, 0.01);
assert.equal(ERASER_MAX, 0.12);
assert.equal(ERASER_DEFAULT, 0.05);
const golden = parseWhiteboard(
  JSON.stringify({
    version: 2,
    slides: [
      {
        id: 1,
        title: "Slide 1",
        strokes: [
          {
            points: [
              { x: 0.2, y: 0.2 },
              { x: 0.8, y: 0.8 },
            ],
            colorArgb: -16777216,
            strokeWidth: PEN_WIDTH,
            isEraser: false,
            isNormalized: true,
          },
        ],
      },
    ],
  }),
);
const goldenStroke = golden.slides[0].strokes[0];
assert.equal(goldenStroke.strokeWidth, PEN_WIDTH);
assert.equal(goldenStroke.isNormalized, true);
assert.equal(goldenStroke.colorArgb, BLACK_ARGB);
assert.ok(goldenStroke.points.every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1));
assert.equal(JSON.parse(serializeWhiteboard(golden)).slides[0].strokes[0].strokeWidth, PEN_WIDTH);

const legacySlides = parseWhiteboard(JSON.stringify([{ id: 2, title: "Old", strokes: [] }]));
assert.equal(legacySlides.slides[0].title, "Old");

const legacyStrokes = parseWhiteboard(
  JSON.stringify([{ points: [{ x: 12, y: 8 }], colorArgb: WHITE_ARGB, strokeWidth: 4 }]),
);
assert.equal(legacyStrokes.slides[0].strokes[0].isNormalized, false);
assert.equal(legacyStrokes.slides[0].strokes[0].isEraser, false);
assert.equal(parseWhiteboard("").slides.length, 1);
assert.equal(parseWhiteboard("{").slides[0].strokes.length, 0);
assert.equal(simplifyPoints(Array.from({ length: 12 }, (_, index) => ({ x: index / 100, y: 0 }))).length, 12);
assert.equal(simplifyPoints(Array.from({ length: 12 }, (_, index) => ({ x: index / 10000, y: 0 }))).length, 2);

assert.deepEqual(reorderTimestamps(5, 9, "up"), { current: 9, neighbor: 5 });
assert.deepEqual(reorderTimestamps(4, 4, "up"), { current: 5, neighbor: 3 });
assert.deepEqual(reorderTimestamps(4, 4, "down"), { current: 3, neighbor: 5 });
assert.deepEqual(reorderTimestamps(9, 5, "down"), { current: 5, neighbor: 9 });

console.log("todo model tests passed");
