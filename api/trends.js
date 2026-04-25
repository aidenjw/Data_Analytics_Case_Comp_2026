const { handle } = require("./_lib/http");
const { rpc } = require("./_lib/supabase");

module.exports = (request, response) =>
  handle(request, response, "POST", async (filters) => rpc("dashboard_trends", { filters }));
