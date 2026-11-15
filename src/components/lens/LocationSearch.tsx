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
import {
  municipalities,
  municipalityLabel,
  searchMunicipalities,
  type Municipality,
} from "@/lib/interactions/municipalities";
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

/** A row of the list: a Brazilian municipality to select, or a place to move the map to. */
type Option =
  | { type: "municipality"; place: Municipality }
  | { type: "place"; place: SearchSuggestion };

export function LocationSearch({
  onNavigate,
  onSelectMunicipality,
  currentCenter,
  debounceMs = 650,
}: {
  onNavigate: (place: MapDestination) => void;
  /** Makes the municipality the area of interest. Rejects when its outline cannot be loaded. */
  onSelectMunicipality?: (place: Municipality) => Promise<void>;
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
  // Brazilian municipalities are matched in the browser, as the person types.
  const [index, setIndex] = useState<Municipality[]>([]);
  const [failure, setFailure] = useState("");
  useEffect(() => {
    if (!onSelectMunicipality) return;
    let live = true;
    municipalities.index().then((list) => live && setIndex(list), () => {});
    return () => {
      live = false;
    };
  }, [onSelectMunicipality]);
  const options: Option[] = [
    ...searchMunicipalities(index, state.query, 4).map((place) => ({ type: "municipality" as const, place })),
    ...state.results.map((place) => ({ type: "place" as const, place })),
  ];
  const open = focused && options.length > 0;
  useEffect(() => () => controller.close(), [controller]);
  useEffect(() => {
    if (active >= 0 && open)
      document
        .getElementById(id + "-option-" + active)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  const choose = (option: Option) => {
    if (option.type === "place") return navigate(option.place);
    const label = municipalityLabel(option.place);
    controller.close(label);
    setActive(-1);
    setFailure("");
    onSelectMunicipality?.(option.place).then(
      () => setAnnouncement(label + " selected as the area of interest."),
      (error) => setFailure(error instanceof Error ? error.message : "The municipality could not be selected."),
    );
  };
  const navigate = (result: SearchSuggestion) => {
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
          const result = options[active >= 0 ? active : 0];
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
          placeholder="City in Brazil, a place or lat, lon"
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
            setFailure("");
            controller.setQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            if (!options.length) {
              controller.setQuery(state.query, true);
              return;
            }
            setActive((i) =>
              e.key === "ArrowDown"
                ? (i + 1) % options.length
                : i <= 0
                  ? options.length - 1
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
        and Enter to choose it. A Brazilian municipality becomes the area of
        interest; any other place only moves the map.
      </span>
      {failure && (
        <p role="alert" className="ff-location-status">
          {failure}
        </p>
      )}
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
            {options.map((option, i) => (
              <li
                key={option.type === "municipality" ? "m" + option.place.id : option.place.label + ":" + option.place.center.join()}
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
                  onClick={() => choose(option)}
                >
                  <span>{option.type === "municipality" ? municipalityLabel(option.place) : option.place.label}</span>
                  <small>
                    {option.type === "municipality"
                      ? "Brazilian municipality - select as area"
                      : (option.place.kind === "coordinates" ? "Coordinates" : option.place.kind || "Place") + " - navigate only"}
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
