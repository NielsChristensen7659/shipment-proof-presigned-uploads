import { createServer, type ServerResponse } from "node:http";
import { ZodError, z } from "zod";
import { InfraiError } from "./infrai_storage";
import { ShipmentAssetService, confirmRequestSchema, uploadRequestSchema } from "./shipment_assets";

const port = Number(process.env.PORT ?? 3000);
const bucket = process.env.SHIPMENT_ASSET_BUCKET ?? "shipment-assets-demo";
const service = new ShipmentAssetService(bucket);
const confirmationSchema = confirmRequestSchema.extend({
  extension: z.enum(["jpg", "png", "pdf"]),
});

function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: AsyncIterable<Buffer>): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/shipment-assets/presign") {
      const input = uploadRequestSchema.parse(await readJson(request));
      return send(response, 201, await service.issueUpload(input));
    }
    if (request.method === "POST" && request.url === "/shipment-assets/confirm") {
      const input = confirmationSchema.parse(await readJson(request));
      const result = await service.confirmUpload(input);
      return send(response, result.found ? 200 : 409, result);
    }
    return send(response, 404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof ZodError) return send(response, 400, { error: "invalid_request", issues: error.issues });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return send(response, status, { error: error.code, message: error.message });
    }
    return send(response, 500, { error: "internal_error" });
  }
});

server.listen(port, () => {
  console.log(`Shipment asset service listening on http://localhost:${port}`);
});
