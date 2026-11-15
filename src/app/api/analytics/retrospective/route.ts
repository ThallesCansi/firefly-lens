import { proxyAnalytics } from "@/lib/analytics/proxy";
export const maxDuration = 60;
export async function POST(request: Request) {
  return proxyAnalytics(request, "retrospective");
}
