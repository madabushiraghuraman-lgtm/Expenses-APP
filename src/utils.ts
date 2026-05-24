export function getRelativeProofUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://localhost:3000")) {
    return url.replace(/^https?:\/\/localhost:3000/, "");
  }
  if (url.startsWith("http://127.0.0.1:3000")) {
    return url.replace(/^https?:\/\/127.0.0.1:3000/, "");
  }
  if (url.startsWith("http://0.0.0.0:3000")) {
    return url.replace(/^https?:\/\/0.0.0.0:3000/, "");
  }
  return url;
}
