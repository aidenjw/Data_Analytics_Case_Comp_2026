function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function handle(request, response, method, action) {
  if (request.method !== method) {
    response.setHeader("allow", method);
    return sendJson(response, 405, { detail: "Method not allowed" });
  }
  try {
    const body = method === "POST" ? await readJson(request) : undefined;
    const result = await action(body);
    return sendJson(response, 200, result);
  } catch (error) {
    const status = error.statusCode || 500;
    return sendJson(response, status, { detail: error.message || "Request failed" });
  }
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = { HttpError, handle, sendJson };
