import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { s3Configured } from "@/lib/env";

function localPath(key: string) {
  return path.join(process.cwd(), "storage", key);
}

async function s3() {
  const { S3Client, PutObjectCommand, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    },
  });
  return { client, PutObjectCommand, GetObjectCommand, bucket: process.env.S3_BUCKET || "" };
}

export async function saveBytes(key: string, bytes: Buffer, contentType: string) {
  if (s3Configured()) {
    const { client, PutObjectCommand, bucket } = await s3();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
    return key;
  }
  const target = localPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
  return key;
}

export async function readBytes(key: string) {
  if (s3Configured()) {
    const { client, GetObjectCommand, bucket } = await s3();
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = result.Body;
    if (!body) return null;
    const bytes = Buffer.from(await body.transformToByteArray());
    return bytes;
  }
  try {
    return await readFile(localPath(key));
  } catch {
    return null;
  }
}
