import { z } from "zod";
import { envelopeData, infrai, objectWasFound } from "./infrai_storage";

export const uploadRequestSchema = z.object({
  shipmentId: z.string().regex(/^[A-Za-z0-9_-]{3,64}$/),
  eventId: z.string().regex(/^[A-Za-z0-9_-]{3,64}$/),
  uploadId: z.string().uuid(),
  kind: z.enum(["proof_of_delivery", "exception_photo"]),
  contentType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  sizeBytes: z.number().int().positive().max(10_000_000),
});

export const confirmRequestSchema = uploadRequestSchema.pick({
  shipmentId: true,
  eventId: true,
  uploadId: true,
  kind: true,
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;
export type ConfirmRequest = z.infer<typeof confirmRequestSchema>;
export type ShipmentEventStatus = "delivered" | "exception_documented" | "asset_pending";

const extensionByType: Record<UploadRequest["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
};

export function assetKey(input: ConfirmRequest, extension = "bin"): string {
  return `shipments/${input.shipmentId}/events/${input.eventId}/${input.kind}-${input.uploadId}.${extension}`;
}

export function eventStatus(kind: ConfirmRequest["kind"], found: boolean): ShipmentEventStatus {
  if (!found) return "asset_pending";
  return kind === "proof_of_delivery" ? "delivered" : "exception_documented";
}

export class ShipmentAssetService {
  private readonly bucket: string;
  private readonly bucketReady: Promise<void>;

  constructor(bucket: string) {
    this.bucket = bucket;
    this.bucketReady = infrai.storage.bucket.create(bucket).then(() => undefined);
  }

  async issueUpload(input: UploadRequest) {
    await this.bucketReady;
    const key = assetKey(input, extensionByType[input.contentType]);
    const result = await infrai.storage.object.presign(this.bucket, key, {
      op: "put",
      expires_seconds: 600,
      content_type: input.contentType,
      max_bytes: input.sizeBytes,
      idempotency_key: input.uploadId,
    });
    const { url, method = "PUT", fields } = envelopeData(result);
    return { uploadUrl: url, method, fields, key, eventStatus: "asset_pending" as const };
  }

  async confirmUpload(input: ConfirmRequest & { extension: string }) {
    await this.bucketReady;
    const key = assetKey(input, input.extension);
    const result = await infrai.storage.object.head(this.bucket, key);
    const found = objectWasFound(result);
    return { key, found, eventStatus: eventStatus(input.kind, found) };
  }
}
