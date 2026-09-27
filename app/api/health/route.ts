import { NextResponse } from "next/server";
import { authConfig, getSession } from "@/lib/salesforce/auth";
import { isDemoMode } from "@/lib/salesforce/accounts";
import { query } from "@/lib/salesforce/client";

export const dynamic = "force-dynamic";

/** Connection check: GET /api/health. Never returns secrets. */
export async function GET() {
  if (isDemoMode()) return NextResponse.json({ ok: true, mode: "demo" });
  const cfg = authConfig();
  if (cfg.missing.length) return NextResponse.json({ ok: false, missing: cfg.missing }, { status: 503 });
  try {
    const session = await getSession();
    await query("SELECT Id FROM Account LIMIT 1", { maxRecords: 1 });
    return NextResponse.json({
      ok: true,
      flow: session.flow,
      instance: new URL(session.instanceUrl).host,
      news: Boolean(process.env.GNEWS_API_KEY?.trim()),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
