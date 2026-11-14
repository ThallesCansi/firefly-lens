"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BBox } from "@/lib/data/types";
import type { MapController, MapPointerEvent } from "@/lib/map/map-contract";
import {
  AdministrativeSelectionController,
  type AdministrativeCandidate,
} from "@/lib/interactions/administrative";
import { RectangleEditor } from "@/lib/interactions/rectangle-editor";
import {
  bindSelectionLayer,
  rectangleGeometry,
} from "@/lib/interactions/map-tool-layer";
import { distanceKm } from "@/lib/interactions/navigation";
import type { RectangleProjectionAdapter } from "./RectangleEditOverlay";

export function useWorkspaceTools(
  controller: MapController | null,
  commitRectangle: (box: BBox) => void,
  commitAdministrative: () => void,
) {
  const [administrativeActive, setAdministrativeActive] = useState(false);
  const [level, setLevel] = useState<"country" | "state">("country");
  const [boundary, setBoundary] = useState<AdministrativeCandidate | null>(
    null,
  );
  const [preview, setPreview] = useState<AdministrativeCandidate | null>(null);
  const [editor, setEditor] = useState<RectangleEditor | null>(null);
  const [draft, setDraft] = useState<BBox | null>(null);
  const [revision, setRevision] = useState(0);
  const [administrative] = useState(
    () =>
      new AdministrativeSelectionController(
        undefined,
        setPreview,
        (candidate) => {
          setBoundary(candidate);
          setPreview(null);
          setAdministrativeActive(false);
          commitAdministrative();
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
  const geometry = useMemo(
    () =>
      draft
        ? rectangleGeometry(draft)
        : ((preview ?? boundary)?.feature.geometry ?? null),
    [draft, preview, boundary],
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
    editor?.cancel();
    setEditor(null);
    setDraft(null);
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
    setAdministrativeActive(true);
  };
  const beginEdit = (box: BBox) => {
    stop();
    setDraft([...box]);
    setEditor(
      new RectangleEditor(box, {
        onPreview: setDraft,
        onConfirm: (next) => {
          setEditor(null);
          setDraft(null);
          clearAdministrative();
          commitRectangle(next);
        },
        onCancel: () => {
          setEditor(null);
          setDraft(null);
          controller?.lockCamera(false);
        },
      }),
    );
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
    beginEdit,
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
