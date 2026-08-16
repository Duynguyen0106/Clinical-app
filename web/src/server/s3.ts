/**
 * Optional S3-compatible object storage for encrypted visit audio.
 * When S3_BUCKET is unset, callers keep using local disk.
 */

export function s3Configured() {
  return Boolean(
    process.env.S3_BUCKET?.trim() &&
      process.env.S3_ACCESS_KEY?.trim() &&
      process.env.S3_SECRET_KEY?.trim(),
  );
}

function s3Env() {
  return {
    bucket: process.env.S3_BUCKET!.trim(),
    region: (process.env.S3_REGION ?? "eu-west-2").trim(),
    accessKeyId: process.env.S3_ACCESS_KEY!.trim(),
    secretAccessKey: process.env.S3_SECRET_KEY!.trim(),
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
  };
}

async function getClient() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  const env = s3Env();
  return new S3Client({
    region: env.region,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    ...(env.endpoint
      ? { endpoint: env.endpoint, forcePathStyle: true }
      : {}),
  });
}

export async function s3PutObject(key: string, body: Buffer) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getClient();
  const env = s3Env();
  await client.send(
    new PutObjectCommand({
      Bucket: env.bucket,
      Key: key,
      Body: body,
      ContentType: "application/octet-stream",
      ServerSideEncryption: env.endpoint ? undefined : "AES256",
    }),
  );
}

export async function s3GetObject(key: string): Promise<Buffer> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getClient();
  const env = s3Env();
  const res = await client.send(
    new GetObjectCommand({ Bucket: env.bucket, Key: key }),
  );
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error("Empty S3 object");
  return Buffer.from(bytes);
}

export async function s3DeleteObject(key: string) {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getClient();
  const env = s3Env();
  await client.send(
    new DeleteObjectCommand({ Bucket: env.bucket, Key: key }),
  );
}
