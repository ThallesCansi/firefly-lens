import { describe, expect, it, vi } from "vitest";
import { PolygonEditor, polygonProblem, selfIntersects, type Vertex } from "./polygon-editor";

const square: Vertex[] = [
  [-56, -14],
  [-50, -14],
  [-50, -8],
  [-56, -8],
];

describe("polygon rules", () => {
  it("accept a simple shape and refuse crossing edges", () => {
    expect(polygonProblem(square)).toBeNull();
    const bowtie: Vertex[] = [square[0], square[2], square[1], square[3]];
    expect(selfIntersects(bowtie)).toBe(true);
    expect(polygonProblem(bowtie)).toMatch(/cross/);
  });

  it("accept a vertex in line with its neighbours but not one folding back", () => {
    expect(selfIntersects([...square.slice(0, 1), [-53, -14], ...square.slice(1)])).toBe(false);
    expect(selfIntersects([[0, 0], [2, 0], [1, 0], [1, 1]])).toBe(true);
  });

  it("keep shapes inside the coverage and within the size limit", () => {
    expect(polygonProblem([[-80, -10], [-60, -10], [-60, -5]])).toMatch(/coverage/);
    const wide: Vertex[] = [[-60, -10], [-45, -10], [-45, -5]];
    expect(polygonProblem(wide)).toMatch(/12/);
    expect(polygonProblem(wide, false)).toBeNull();
  });
});

describe("PolygonEditor", () => {
  it("moves one vertex without touching the others and commits on release", () => {
    const commit = vi.fn();
    const editor = new PolygonEditor(square, { onCommit: commit });
    expect(editor.begin(2, [-50, -8])).toBe(true);
    expect(editor.update([-48, -6])).toBe(true);
    editor.endDrag();
    const v = editor.snapshot().vertices;
    expect(v[2]).toEqual([-48, -6]);
    expect([v[0], v[1], v[3]]).toEqual([square[0], square[1], square[3]]);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("refuses a drag that would cross edges and keeps the last valid shape", () => {
    const editor = new PolygonEditor(square);
    editor.begin(0, [-56, -14]);
    expect(editor.update([-53, -7])).toBe(false);
    expect(editor.snapshot().error).toMatch(/cross/);
    expect(editor.snapshot().vertices[0]).toEqual(square[0]);
  });

  it("moves the whole shape, reverts a drag and does not commit without change", () => {
    const commit = vi.fn();
    const editor = new PolygonEditor(square, { onCommit: commit });
    editor.begin("move", [-53, -11]);
    editor.update([-52, -10]);
    expect(editor.snapshot().vertices[0]).toEqual([-55, -13]);
    editor.revert();
    expect(editor.snapshot().vertices).toEqual(square);
    editor.begin(1, [-50, -14]);
    editor.endDrag();
    expect(commit).not.toHaveBeenCalled();
  });

  it("adds a vertex on an edge and removes vertices down to three", () => {
    const editor = new PolygonEditor(square);
    expect(editor.insert(0, [-53, -14])).toBe(true);
    editor.update([-53, -16]);
    editor.endDrag();
    expect(editor.snapshot().vertices).toHaveLength(5);
    expect(editor.snapshot().vertices[1]).toEqual([-53, -16]);
    expect(editor.remove(1)).toBe(true);
    expect(editor.remove(0)).toBe(true);
    expect(editor.snapshot().vertices).toHaveLength(3);
    expect(editor.remove(0)).toBe(false);
  });

  it("keeps and commits an added corner released without moving", () => {
    const commit = vi.fn();
    const editor = new PolygonEditor(square, { onCommit: commit });
    editor.insert(1, [-50, -11]);
    editor.endDrag();
    expect(commit).toHaveBeenCalledWith(expect.arrayContaining([[-50, -11]]));
    expect(commit.mock.calls[0][0]).toHaveLength(5);
  });

  it("nudges a vertex by a keyboard step", () => {
    const editor = new PolygonEditor(square);
    editor.nudge(3, -0.5, 0);
    expect(editor.snapshot().vertices[3]).toEqual([-56.5, -8]);
  });
});
