import type { AnalysisArea, Sensor } from "@/lib/data/types";
import { firmsLink } from "@/lib/map/firms";

export function NasaFirmsLink({area,period,sensors}:{area:AnalysisArea;period:string;sensors:Sensor[]}) {
  const link=firmsLink(area,period,sensors);
  if(!link)return null;
  return <a className="nasa-firms-link" href={link.url} target="_blank" rel="noopener noreferrer"
    title={`${link.scope==="outline"?"Selected outline":"Enclosing area extent"}, dates and selected sensors. NASA shows original detections; processing and availability may differ from Lens.`}>
    Open in NASA FIRMS <span aria-hidden="true">↗</span>
    {link.scope==="extent"&&<span className="nasa-firms-scope"> · area extent</span>}
    <span className="sr-only"> · original detections, opens a new tab</span>
  </a>;
}
