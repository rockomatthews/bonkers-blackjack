import { NextRequest, NextResponse } from "next/server";
import { transaction } from "../../../../server/database";
import { service } from "../../../../server/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
async function handle(req: NextRequest) {
  try {
    if (req.method === "GET" && req.nextUrl.pathname === "/api/v1/config")
      return NextResponse.json(
        {
          mode: "demo",
          realMoney: false,
          sharedTablesReady:
            !process.env.VERCEL ||
            !!(process.env.POSTGRES_URL || process.env.DATABASE_URL),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (req.method === "POST") {
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== req.headers.get("host"))
        return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
      if (Number(req.headers.get("content-length") ?? 0) > 32768)
        return NextResponse.json(
          { error: "Request too large" },
          { status: 413 },
        );
    }
    const text = req.method === "POST" ? await req.text() : "";
    if (text.length > 32768)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const body = text ? JSON.parse(text) : {};
    const path = req.nextUrl.pathname.replace("/api/v1/", ""),
      token = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? null;
    const response = await transaction(async (data) => {
      const s = service(data);
      s.tick();
      if (req.method === "GET" && path === "health")
        return {
          mode: "demo",
          realMoney: false,
          storage:
            process.env.POSTGRES_URL || process.env.DATABASE_URL
              ? "postgres"
              : "local",
          house: data.house,
          reserved: s.reserved(),
          conserved:
            Object.values(data.accounts).reduce(
              (sum, a) => sum + a.balance,
              0,
            ) +
              data.house ===
            data.initialSupply,
        };
      if (req.method === "POST" && path === "demo-login") return s.login(body);
      if (req.method === "GET" && path === "tables")
        return Object.values(data.tables)
          .filter((t) => !t.private)
          .map((t) => s.view(t, null));
      if (req.method === "GET" && path.startsWith("tables/")) {
        const table = data.tables[path.split("/")[1]];
        if (!table) throw Error("Table not found");
        const a = token ? s.auth(token) : null;
        if (a) data.presence[a.id] = { tableId: table.id, at: Date.now() };
        return {
          table: s.view(table, a),
          account: a ? s.accountView(a) : null,
        };
      }
      if (req.method === "GET" && path === "account")
        return s.accountView(s.auth(token));
      if (req.method === "POST" && path === "commands")
        return s.command(s.auth(token), body);
      if (req.method === "GET" && path.startsWith("receipts")) {
        const a = s.auth(token),
          receipts = Object.values(data.tables)
            .flatMap((t) => t.receipts)
            .filter((r) => r.wagers.some((w) => w.id === a.id));
        if (path === "receipts") return receipts;
        const receipt = receipts.find((r) => r.roundId === path.split("/")[1]);
        if (!receipt) throw Error("Receipt not found");
        return receipt;
      }
      throw Error("Endpoint not found");
    });
    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Request failed";
    // Infrastructure details and connection strings must never reach the client.
    const infrastructure =
      /password|connect|relation|database|ECONN|timeout|SSL|postgres/i.test(
        raw,
      );
    return NextResponse.json(
      {
        error: infrastructure
          ? "Shared tables are not available yet. Please try again later."
          : raw,
      },
      { status: infrastructure ? 503 : 400 },
    );
  }
}
export const GET = handle;
export const POST = handle;
