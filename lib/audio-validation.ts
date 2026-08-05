export function isAllowedAudio(bytes: ArrayBuffer, mimeType: string): boolean {
  const type = mimeType.toLowerCase().split(";")[0];
  const allowed = new Set([
    "audio/webm",
    "video/webm",
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
  ]);
  if (!allowed.has(type)) return false;
  const view = new Uint8Array(bytes.slice(0, 16));
  const ascii = String.fromCharCode(...view);
  const isWav = ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE";
  const isWebm = view[0] === 0x1a && view[1] === 0x45 && view[2] === 0xdf && view[3] === 0xa3;
  const isMp4 = ascii.slice(4, 8) === "ftyp";
  const isMp3 = ascii.startsWith("ID3") || (view[0] === 0xff && (view[1] & 0xe0) === 0xe0);
  return isWav || isWebm || isMp4 || isMp3;
}
