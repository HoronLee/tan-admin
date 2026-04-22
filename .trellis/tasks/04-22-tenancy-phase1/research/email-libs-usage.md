# Research: email-libs-usage

- **Query**: Minimal usage patterns for email / image compression libs PRD requires
- **Scope**: external
- **Date**: 2026-04-22

## TanStack Start runtime

TanStack Start (current project, `@tanstack/react-start latest`) runs on **Node.js by default**. `vite.config.ts` doesn't enable Cloudflare/Edge preset. The `start` script uses `node --import ./dist/server/instrument.server.mjs dist/server/server.js` (`package.json:16`). ⇒ safe to assume Node runtime; nodemailer (requires `net`/`tls`) is usable; `@react-email/render` Node export is valid.

## nodemailer — SMTP transport

Install: `pnpm add nodemailer` + `pnpm add -D @types/nodemailer`.

Key port/secure rule (from nodemailer.com/smtp):
- **Port 465** → `secure: true` (implicit TLS from handshake).
- **Port 587 or 25** → `secure: false`; let STARTTLS upgrade the connection (optionally `requireTLS: true` for strictness).
- Mismatching `secure` vs port is the #1 debug source; the project defaults to 465 + secure (aligned with Aliyun smtpdm).

Minimal TS snippet:

```ts
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,          // default 465
  secure: env.SMTP_SECURE,      // default true
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  pool: true,                   // reuse connections
});

await transporter.sendMail({
  from: env.EMAIL_FROM_NAME ? `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM}>` : env.EMAIL_FROM,
  to,
  subject,
  html,      // produced by @react-email/render
  // text: optional plain-text fallback (toPlainText from @react-email/render)
});
```

Tip: call `await transporter.verify()` once at boot to fail fast on misconfig.

## resend — Node SDK

Install: `pnpm add resend`. Node 18+.

Minimal snippet (from `resend/resend-examples` + `resend.com/docs/send-with-nodejs`):

```ts
import { Resend } from "resend";

const resend = new Resend(env.RESEND_API_KEY);

const { data, error } = await resend.emails.send({
  from: env.EMAIL_FROM_NAME
    ? `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`
    : env.EMAIL_FROM,
  to: [to],
  subject,
  html,
});

if (error) throw new Error(error.message);
return data?.id;
```

Resend can also accept `react: <Template />` directly — but that requires JSX runtime support at the call site. Since we're already rendering to an HTML string centrally, pass `html` to keep the SMTP + Resend code paths symmetric.

## @react-email/render — template → HTML

Install: `pnpm add @react-email/components @react-email/render` + `pnpm add -D react-email` (CLI for `pnpm email:dev`).

Key facts from `react-email.mintlify.dev/docs/utilities/render`:

- `render(<Template />)` returns **`Promise<string>`** (async) — always `await`.
- Node build uses `renderToPipeableStream` / `renderToReadableStream` (Node 20+); works in our runtime.
- `pretty: true` option formats with Prettier (dev only).
- `toPlainText(html)` returns plaintext alternative.

Minimal snippet:

```ts
import { render, pretty, toPlainText } from "@react-email/render";
import VerifyEmail from "#/emails/verify-email";

const html = await render(<VerifyEmail url={url} userName={user.name} />, {
  pretty: process.env.NODE_ENV !== "production",
});
const text = toPlainText(html);
```

`package.json` script for preview:

```json
"email:dev": "email dev --dir ./src/emails"
```

(`react-email` CLI scans the dir, spins up a preview server at :3000 by default — set `--port` if clashing with `pnpm dev`.)

## browser-image-compression — logo upload

Install: `pnpm add browser-image-compression`. **Browser-only** — do not import on server.

Minimal snippet (tailored for PRD R7, ≤200KB target):

```ts
import imageCompression from "browser-image-compression";

async function compressLogo(file: File): Promise<string> {
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.2,           // 200 KB
    maxWidthOrHeight: 512,    // logo; no retina need
    useWebWorker: true,
    initialQuality: 0.9,
  });
  if (compressed.size > 200 * 1024) {
    throw new Error("图片超过 200KB，请选择更小的图片");
  }
  // Convert to data-url for storage in organization.logo
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(compressed);
  });
}
```

Then pass `logo: dataUrl` into `authClient.organization.update({ organizationId, data: { logo } })`. `<img src={org.logo}>` handles both URL and data-url — no rendering changes needed.

## Constraints

- **Resend** max payload (including inlined HTML / images) ≈ 40MB; data-url logos inside templates are fine for 200KB.
- **Nodemailer** pooled transport keeps TCP open; on serverless/edge platforms this may hold connections — safe for us (long-lived Node process).
- `@react-email/render` v2.0.x had a Vite/browser regression (resend/react-email#3181); since we only render server-side, not affected.
- `package.json` does not yet include any of these; pnpm `onlyBuiltDependencies` does not need updates (pure JS/TS packages; no native addons).
