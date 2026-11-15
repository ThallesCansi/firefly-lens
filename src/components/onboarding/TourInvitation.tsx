"use client";
import { useState, useSyncExternalStore } from "react";
import { Lume } from "@/components/firefly/Lume";
import { readTourOutcome, saveTourOutcome } from "@/lib/onboarding/persistence";
const subscribe = (notify: () => void) => { window.addEventListener("storage", notify); return () => window.removeEventListener("storage", notify); };
const snapshot = () => readTourOutcome();
export function TourInvitation({ onStart }: { onStart: () => void }) {
  const outcome = useSyncExternalStore(subscribe, snapshot, () => "hidden");
  const [dismissed, setDismissed] = useState(false);
  if (outcome || dismissed) return null;
  return <div className="lume-invitation">
    <Lume size={48} />
    <div><p>Meet Lume, your guide.</p><div className="lume-invitation-actions">
      <button type="button" className="btn btn-quiet" onClick={onStart}>Start tour</button>
      <button type="button" className="btn btn-text" onClick={() => { saveTourOutcome("dismissed"); setDismissed(true); }}>Skip tour</button>
    </div></div>
  </div>;
}
