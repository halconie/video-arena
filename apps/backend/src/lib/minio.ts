import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

const BUCKET = process.env.MINIO_BUCKET ?? "video-arena";

// MinIO speaks the S3 API, so the AWS SDK works against it as-is once
// pointed at the MinIO endpoint with `forcePathStyle` enabled.
export const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
  region: process.env.MINIO_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
  },
});

// Base URL the *browser* can use to fetch objects back out of the bucket.
// In docker-compose this differs from MINIO_ENDPOINT (backend talks to the
// `minio` service on the compose network; the browser needs localhost).
const PUBLIC_URL = process.env.MINIO_PUBLIC_URL ?? "http://localhost:9000";

export async function uploadObject(params: {
  key?: string;
  body: Buffer | Uint8Array;
  contentType: string;
  folder: "uploads" | "outputs";
}): Promise<string> {
  const key = params.key ?? `${params.folder}/${randomUUID()}`;

  const input: PutObjectCommandInput = {
    Bucket: BUCKET,
    Key: key,
    Body: params.body,
    ContentType: params.contentType,
  };

  await s3.send(new PutObjectCommand(input));

  return `${PUBLIC_URL}/${BUCKET}/${key}`;
}

// Creates the bucket (and makes it publicly readable, since generated
// video/image URLs are served straight to the browser) if it doesn't
// already exist. Safe to call on every server boot.
export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    return;
  } catch {
    // bucket doesn't exist (or isn't reachable yet) - try to create it
  }

  await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: BUCKET,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${BUCKET}/*`],
          },
        ],
      }),
    }),
  );
}

export { BUCKET as MINIO_BUCKET };
