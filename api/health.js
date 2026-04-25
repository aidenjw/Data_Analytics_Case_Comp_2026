const { handle } = require("./_lib/http");
const { rpc } = require("./_lib/supabase");

module.exports = (request, response) =>
  handle(request, response, "GET", async () => {
    const metadata = await rpc("dashboard_metadata");
    return {
      status: "ok",
      warehouse: "ready",
      factRows: Number(metadata?.stats?.sector_rows ?? 0),
    };
  });
