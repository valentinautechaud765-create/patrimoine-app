import crypto from "node:crypto";

const b64u = (b) => Buffer.from(b).toString("base64url");
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

function vapidToken(endpoint) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateDer = process.env.VAPID_PRIVATE_KEY_PKCS8;
  if (!publicKey || !privateDer) throw new Error("Clés Web Push absentes sur le serveur.");
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(JSON.stringify({ aud: audience, exp: now + 12 * 60 * 60, sub: process.env.VAPID_SUBJECT || "mailto:support@patrimo.app" }));
  const input = header + "." + claims;
  const key = crypto.createPrivateKey({ key: Buffer.from(privateDer, "base64url"), format: "der", type: "pkcs8" });
  const signature = crypto.sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
  return { token: input + "." + b64u(signature), publicKey };
}

function encryptPayload(subscription, payload) {
  const clientPublic = unb64u(subscription.keys.p256dh);
  const authSecret = unb64u(subscription.keys.auth);
  if (clientPublic.length !== 65 || authSecret.length < 16) throw new Error("Abonnement Web Push invalide.");
  const ecdh = crypto.createECDH("prime256v1");
  const serverPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(clientPublic);
  const authInfo = Buffer.concat([Buffer.from("WebPush: info\0"), clientPublic, serverPublic]);
  const prk = Buffer.from(crypto.hkdfSync("sha256", shared, authSecret, authInfo, 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync("sha256", prk, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", prk, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const plain = Buffer.concat([Buffer.from(JSON.stringify(payload)), Buffer.from([2])]);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([serverPublic.length]), serverPublic, encrypted]);
}

export async function sendPush(row, payload) {
  const { token, publicKey } = vapidToken(row.endpoint);
  const body = encryptPayload({ keys: { p256dh: row.p256dh, auth: row.auth } }, payload);
  const response = await fetch(row.endpoint, {
    method: "POST",
    headers: {
      Authorization: "vapid t=" + token + ", k=" + publicKey,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal",
    },
    body,
  });
  if (response.status === 404 || response.status === 410) return { expired: true };
  if (!response.ok) throw new Error("Service Push (" + response.status + ")");
  return { sent: true };
}
