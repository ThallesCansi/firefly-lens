"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closeRing,
  editableVertices,
  type AnalysisArea,
} from "@/lib/data/types";
import type { MapController, MapPointerEvent } from "@/lib/map/map-contract";
import {
  AdministrativeSelectionController,
  type AdministrativeCandidate,
} from "@/lib/interactions/administrative";
import { PolygonEditor, type Vertex } from "@/lib/interactions/polygon-editor";
import { bindSelectionLayer } from "@/lib/interactions/map-tool-layer";
import { distanceKm } from "@/lib/interactions/navigation";
import type { RectangleProjectionAdapter } from "./RectangleEditOverlay";

/**
 * Selection tools around the map: the state picker and the corner handles of
 * a drawn area. The handles exist whenever `editable` is a drawn area; every
 * finished edit goes to `commitShape`. Both callbacks should be stable
 * (useCallback): the state picker keeps the first `commitAdministrative`.
 */
export function useWorkspaceTools(
  controller: MapController | null,
  editable: AnalysisArea | null,
  commitShape: (vertices: Vertex[]) => void,
  commitAdministrative: (candidate: AdministrativeCandidate) => boolean,
) {
  const [administrativeActive, setAdministrativeActive] = useState(false);
  const [level, setLevel] = useState<"country" | "state">("state");
  const [boundary, setBoundary] = useState<AdministrativeCandidate | null>(
    null,
  );
  const [preview, setPreview] = useState<AdministrativeCandidate | null>(null);
  const [draft, setDraft] = useState<{ id: string; vertices: Vertex[] } | null>(
    null,
  );
  const [revision, setRevision] = useState(0);
  const [administrative] = useState(
    () =>
      new AdministrativeSelectionController(
        undefined,
        setPreview,
        (candidate) => {
          setPreview(null);
          setAdministrativeActive(false);
          // A Brazilian state becomes the area; anything else is only shown.
          if (!commitAdministrative(candidate))
            setBoundary(candidate);
          else setBoundary(null);
        },
      ),
  );
  useEffect(() => {
    if (boundary && controller)
      controller.navigate({
        id: Date.now(),
        bounds: boundary.bounds,
        maxZoom: 8,
        animation: "ease",
      });
  }, [boundary, controller]);

  // No handles while a state is being picked.
  const shown = administrativeActive ? null : editable;
  const editor = useMemo(() => {
    const vertices = editableVertices(shown);
    if (!shown || !vertices) return null;
    const id = shown.id;
    try {
      return new PolygonEditor(vertices, {
        onPreview: (next) => setDraft({ id, vertices: next }),
        onEnd: () => setDraft(null),
        onCommit: commitShape,
      });
    } catch {
      return null;
    }
  }, [shown, commitShape]);

  const layer = useRef<ReturnType<typeof bindSelectionLayer> | null>(null);
  useEffect(() => {
    if (!controller) return;
    const binding = bindSelectionLayer(controller);
    layer.current = binding;
    return () => {
      binding.dispose();
      layer.current = null;
    };
  }, [controller]);
  const liveDraft = draft && shown && draft.id === shown.id ? draft : null;
  const geometry = useMemo(
    () =>
      liveDraft
        ? {
            type: "Polygon" as const,
            coordinates: [closeRing(liveDraft.vertices)],
          }
        : ((preview ?? boundary)?.feature.geometry ?? null),
    [liveDraft, preview, boundary],
  );
  useEffect(() => {
    layer.current?.setGeometry(geometry);
  }, [controller, geometry]);
  useEffect(
    () => () => {
      administrative.cancel();
      controller?.lockCamera(false);
    },
    [administrative, controller],
  );
  const stop = useCallback(() => {
    editor?.revert();
    administrative.cancel();
    setAdministrativeActive(false);
    controller?.lockCamera(false);
  }, [editor, administrative, controller]);
  const clearAdministrative = useCallback(() => {
    administrative.cancel();
    setBoundary(null);
    setPreview(null);
    setAdministrativeActive(false);
  }, [administrative]);
  const clear = () => {
    stop();
    clearAdministrative();
  };
  const beginAdministrative = () => {
    stop();
    setBoundary(null);
    setAdministrativeActive(true);
  };
  const onMapClick = useCallback(
    (event: MapPointerEvent) => {
      if (administrativeActive && event.lngLat)
        void administrative.selectAt(event.lngLat, level);
    },
    [administrativeActive, administrative, level],
  );
  const adapter = useMemo<RectangleProjectionAdapter>(
    () => ({
      project(point) {
        if (!controller) return null;
        const pixel = controller.project([point[0], point[1]]);
        const inverse = controller.unproject(pixel);
        // Round trip rejects projected points on the back of the globe.
        if (
          !inverse ||
          !Number.isFinite(pixel[0]) ||
          !Number.isFinite(pixel[1])
        )
          return null;
        try {
          if (distanceKm(point, inverse) > 0.1) return null;
        } catch {
          return null;
        }
        return { x: pixel[0], y: pixel[1] };
      },
      unproject: (pixel) => controller?.unproject([pixel.x, pixel.y]) ?? null,
    }),
    [controller],
  );
  const updateView = useCallback(() => setRevision((n) => n + 1), []);
  const lock = useCallback(
    (locked: boolean) => controller?.lockCamera(locked),
    [controller],
  );
  return {
    administrative,
    administrativeActive,
    level,
    setLevel,
    boundary,
    preview,
    editor,
    adapter,
    revision,
    updateView,
    lock,
    onMapClick,
    stop,
    clear,
    clearAdministrative,
    beginAdministrative,
    cancelAdministrative: () => {
      administrative.cancel();
      setAdministrativeActive(false);
    },
    clearBoundary: () => {
      administrative.cancel();
      setBoundary(null);
    },
  };
}
