import { expect, it } from "vitest";
import { PAGE_TOUR, TOUR_STEPS, TOUR_TOTAL, stepIndex, tourNumber } from "./steps";

it("numbers the tour across the Lens, About and Method without gaps", () => {
  const numbers = [
    ...TOUR_STEPS.slice(0, -1).map((_, lens) => tourNumber({ lens })),
    ...PAGE_TOUR.about.map((_, index) => tourNumber({ page: "about", index })),
    ...PAGE_TOUR.method.map((_, index) => tourNumber({ page: "method", index })),
    tourNumber({ lens: stepIndex("complete") }),
  ];
  expect(numbers).toEqual(Array.from({ length: TOUR_TOTAL }, (_, i) => i + 1));
  // The visit leaves from the step just before the last one.
  expect(stepIndex("pages")).toBe(stepIndex("complete") - 1);
});
