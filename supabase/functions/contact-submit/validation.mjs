export const MAX_BODY_BYTES = 12_000;

export function normalizeContactPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const name = typeof body.sender_name === "string" ? body.sender_name.trim() : "";
  const email = typeof body.sender_email === "string" ? body.sender_email.trim().toLowerCase() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  const hasControlChars = (value) => /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
  if (name.length < 1 || name.length > 120 || hasControlChars(name)) return null;
  if (email.length < 3 || email.length > 254 || hasControlChars(email)) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (message.length < 1 || message.length > 5000 || hasControlChars(message)) return null;

  return { name, email, message };
}

export function isValidIp(value) {
  if (typeof value !== "string") return false;
  const ip = value.trim();
  if (ip.length < 2 || ip.length > 45) return false;

  const ipv4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
  if (ipv4.test(ip)) return true;
  if (!ip.includes(":") || !/^[0-9a-f:]+$/i.test(ip)) return false;

  try {
    return new URL("http://[" + ip + "]/").hostname.length > 0;
  } catch {
    return false;
  }
}
