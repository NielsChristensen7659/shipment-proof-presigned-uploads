import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const serviceUrl = process.env.SERVICE_URL ?? "http://localhost:3000";
const filePath = process.argv[2];
if (!filePath) throw new Error("Run npm run demo -- path/to/proof.jpg");

const bytes = await readFile(filePath);
const request = {
  shipmentId: "SHP-1042",
  eventId: "DELIVERY-7",
  uploadId: randomUUID(),
  kind: "proof_of_delivery",
  contentType: "image/jpeg",
  sizeBytes: bytes.byteLength,
};

const signedResponse = await fetch(`${serviceUrl}/shipment-assets/presign`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(request),
});
if (!signedResponse.ok) throw new Error(await signedResponse.text());
const signed = await signedResponse.json() as {
  uploadUrl: string;
  method: "PUT" | "POST";
  fields?: Record<string, string>;
  key: string;
};

const uploadResponse = signed.method === "POST"
  ? await fetch(signed.uploadUrl, {
      method: "POST",
      body: (() => {
        const form = new FormData();
        for (const [name, value] of Object.entries(signed.fields ?? {})) form.append(name, value);
        form.append("file", new Blob([bytes], { type: request.contentType }), "proof.jpg");
        return form;
      })(),
    })
  : await fetch(signed.uploadUrl, {
      method: "PUT",
      headers: { "content-type": request.contentType },
      body: bytes,
    });
if (!uploadResponse.ok) throw new Error(`Upload returned HTTP ${uploadResponse.status}`);

const confirmationResponse = await fetch(`${serviceUrl}/shipment-assets/confirm`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ...request, extension: "jpg" }),
});
if (!confirmationResponse.ok) throw new Error(await confirmationResponse.text());
console.log(await confirmationResponse.json());
