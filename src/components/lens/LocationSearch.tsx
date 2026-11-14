"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AutocompleteController } from "@/lib/interactions/autocomplete";
import {
  navigationForSearch,
  type GeographicPoint,
  type SearchSuggestion,
} from "@/lib/interactions/navigation";
import type { BBox } from "@/lib/data/types";
import "./LocationSearch.css";

/** Existing callback stays compatible. Motion is a hint for the globe agent's navigation adapter. */
export type MapDestination = {
  center: [number, number];
  zoom: number;
  bounds?: BBox;
  id: number;
  motion?: ReturnType<typeof navigationForSearch>["motion"];
  animation?: ReturnType<typeof navigationForSearch>["animation"];
  maxZoom?: number;
};

export function LocationSearch({
  onNavigate,
  currentCenter,
  debounceMs = 650,
}: {
  onNavigate: (place: MapDestination) => void;
  currentCenter?: GeographicPoint;
  debounceMs?: number;
}) {
  const [controller] = useState(
    () => new AutocompleteController(undefined, { debounceMs }),
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const skipFocusSearch = useRef(false);
  const refocus = () => {
    if (document.activeElement !== input.current) {
      skipFocusSearch.current = true;
      input.current?.focus();
    }
  };
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const listId = id + "-places";
  const open = focused && state.results.length > 0;
  useEffect(() => () => controller.close(), [controller]);
  useEffect(() => {
    if (active >= 0 && open)
      document
        .getElementById(id + "-option-" + active)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  const choose = (result: SearchSuggestion) => {
    const intent = navigationForSearch(result, {
      from: currentCenter,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    controller.close(result.label);
    setActive(-1);
    setAnnouncement(
      "Navigation requested for " +
        result.label +
        ". Draw or select an area separately to analyze it.",
    );
    onNavigate(intent);
    refocus();
  };
  return (
    <div
      ref={root}
      className={"location-search " + "ff-location-root"}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocused(false);
          controller.close();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          controller.close();
          setActive(-1);
          setAnnouncement("Search cancelled.");
        }
      }}
    >
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const result = state.results[active >= 0 ? active : 0];
          if (result) choose(result);
          else controller.setQuery(state.query, true);
        }}
      >
        <label className="sr-only" htmlFor={id}>
          Search a place or latitude, longitude
        </label>
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && active >= 0 ? id + "-option-" + active : undefined
          }
          aria-describedby={id + "-hint"}
          autoComplete="off"
          spellCheck={false}
          className="field w-full min-w-0"
          placeholder="Search Earth: city or coordinates"
          value={state.query}
          maxLength={160}
          onFocus={() => {
            setFocused(true);
            if (skipFocusSearch.current) {
              skipFocusSearch.current = false;
              return;
            }
            if (state.query && !state.results.length)
              controller.setQuery(state.query);
          }}
          onChange={(e) => {
            setActive(-1);
            setAnnouncement("");
            controller.setQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            if (!state.results.length) {
              controller.setQuery(state.query, true);
              return;
            }
            setActive((i) =>
              e.key === "ArrowDown"
                ? (i + 1) % state.results.length
                : i <= 0
                  ? state.results.length - 1
                  : i - 1,
            );
          }}
        />
        <button
          type="submit"
          className="btn btn-quiet"
          disabled={!state.query.trim()}
          aria-label={
            state.phase === "loading" ? "Search locations, loading" : "Search"
          }
        >
          {state.phase === "loading" ? "..." : "Search"}
        </button>
      </form>
      <span id={id + "-hint"} className="sr-only">
        Type at least three characters. Use arrow keys to choose a suggestion
        and Enter to navigate. Search does not select an analysis area.
      </span>
      {focused && (state.message || open) && (
        <div className={"ff-location-dropdown" + " map-surface"}>
          <p role="status" className={"ff-location-status"}>
            {state.message}
          </p>
          <ul
            id={listId}
            role="listbox"
            aria-label="Location suggestions"
            className={"ff-location-options"}
            hidden={!open}
          >
            {state.results.map((result, i) => (
              <li
                key={result.label + ":" + result.center.join()}
                role="option"
                id={id + "-option-" + i}
                aria-selected={active === i}
                className={"ff-location-option"}
                onMouseMove={() => setActive(i)}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(result)}
                >
                  <span>{result.label}</span>
                  <small>
                    {result.kind === "coordinates"
                      ? "Coordinates"
                      : result.kind || "Place"}{" "}
                    - navigate only
                  </small>
                </button>
              </li>
            ))}
          </ul>
          <div className={"ff-location-footer"}>
            <a
              href="https://photon.komoot.io/"
              target="_blank"
              rel="noreferrer"
            >
              Photon / OpenStreetMap contributors
            </a>
            <button
              type="button"
              onClick={() => {
                controller.close();
                setActive(-1);
                refocus();
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
