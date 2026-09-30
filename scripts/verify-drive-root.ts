try {
  process.loadEnvFile(".env.local");
} catch {}
const { GoogleDrive } = await import("../src/server/drive");
try {
  const drive = new GoogleDrive();
  await drive.validateParent(process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!);
  console.log(
    "Root is a writable folder in the configured Drive. Read-only probe; no files created.",
  );
} catch {
  console.error(
    "Root validation failed. Check mode, scope, shared drive and canonical ID. No raw credential output.",
  );
  process.exitCode = 1;
}
export {};
