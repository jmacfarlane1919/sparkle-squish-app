const CODE_LEAK = /NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|digest/i;

export function friendlyError(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? String((error as { name?: string }).name || "") : "";
  const message = error instanceof Error ? error.message : "";
  const blob = `${name} ${message}`.toLowerCase();
  if (CODE_LEAK.test(message) || CODE_LEAK.test(name)) {
    return "That did not finish. Please try again.";
  }
  if (blob.includes("nosuchbucket")) {
    return "The file bucket was not found. In Vercel, S3_BUCKET should be the R2 bucket name, and the token must be allowed to use it.";
  }
  if (blob.includes("invalidaccesskeyid") || blob.includes("signaturedoesnotmatch") || blob.includes("invalidclienttokenid")) {
    return "The file storage keys were rejected. Check S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in Vercel. They are the R2 token's access key and secret.";
  }
  if (blob.includes("accessdenied") || blob.includes("access denied")) {
    return "File storage refused the upload. The R2 token needs permission to read and write objects in the bucket.";
  }
  if (blob.includes("enotfound") || blob.includes("getaddrinfo") || blob.includes("econnrefused") || blob.includes("unknownendpoint") || blob.includes("eai_again")) {
    return "Could not reach the file storage address. S3_ENDPOINT should be the R2 S3 URL, like https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com, with no bucket name on the end.";
  }
  if (blob.includes("permanentredirect") || blob.includes("permanently redirected")) {
    return "The storage address does not match the bucket. For R2, set S3_REGION to auto and S3_FORCE_PATH_STYLE to true.";
  }
  if (blob.includes("file storage is not set up")) return message;
  if (message.includes("postgres://") || message.includes("mysql://") || message.includes("AccessKey") || message.length > 280) {
    return "That could not be saved. Open Settings and run Check file storage if a photo was attached.";
  }
  return message || "Something went wrong. Please try again.";
}
