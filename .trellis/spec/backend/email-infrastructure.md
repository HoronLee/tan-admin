# Email Infrastructure

> Executable contract for transactional email: transport abstraction, react-email templates, boot-time validation, i18n-aware send path.

---

## 1. Scope / Trigger

Triggers when work touches: `src/lib/email.tsx` · `src/lib/email-transport.ts` · `src/emails/*.tsx` · `src/lib/auth.ts` mail hooks (`sendVerificationEmail` / `sendResetPassword` / `sendInvitationEmail`) · `EMAIL_*` / `SMTP_*` / `RESEND_API_KEY` in `src/env.ts` · adding a new template or driver.

---

## 2. Signatures

### High-level entry (`src/lib/email.tsx`)

```ts
export type EmailPayload =
  | { type: "verify";   to: string; props: VerifyEmailProps }
  | { type: "reset";    to: string; props: ResetPasswordProps }
  | { type: "invite";   to: string; props: InviteMemberProps }
  | { type: "transfer"; to: string; props: TransferOwnershipProps };

export async function sendEmail(payload: EmailPayload): Promise<void>;
```

- Discriminated union — each template's required props are checked at call site.
- Subject resolved via Paraglide `m.email_subject_*()` (i18n).
- Honours `EMAIL_VERIFICATION_SKIP_LIST` (dev skip).
- Renders HTML + plaintext fallback via `render` + `toPlainText` from `@react-email/render`.

### Low-level driver (`src/lib/email-transport.ts`)

```ts
export interface MailMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail(message: MailMessage): Promise<void>;
```

- Driver picked **once at module-load** based on `env.EMAIL_TRANSPORT`.
- `sendMail` exported for tests / tooling; production code goes through `sendEmail`.

### Template component contract (`src/emails/*.tsx`)

```ts
export interface VerifyEmailProps       { url: string; userName?: string }
export interface ResetPasswordProps     { url: string; userName?: string }
export interface InviteMemberProps      { url: string; inviterName: string; organizationName: string }
export interface TransferOwnershipProps { url: string; inviterName: string; organizationName: string }

export function VerifyEmail(props: VerifyEmailProps): JSX.Element;
// same shape for ResetPassword / InviteMember / TransferOwnership
```

All templates wrap `<EmailLayout preview=...>` from `src/emails/components/email-layout.tsx` and pull copy from `m.email_*()` Paraglide messages.

---

## 3. Contracts

### Required env per driver

| `EMAIL_TRANSPORT` | Required env | Behaviour |
|---|---|---|
| `console` (dev default) | none | Logs subject + first URL found in body. No network call. |
| `smtp` | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (+ `SMTP_PORT` / `SMTP_SECURE` opt) | `nodemailer` pool; `verify()` on boot (warn-only); `sendMail({ from, to, subject, html, text })`. |
| `resend` | `RESEND_API_KEY` | `Resend().emails.send(...)`; throws on non-null `{ error }` result. |

Always-required: `EMAIL_FROM`; optional `EMAIL_FROM_NAME` composes `"Name" <address>`.

### Boot-time validation (`validateTransportEnv()` at module load)

- `appConfig.env === "prod"` **and** `EMAIL_TRANSPORT === "console"` → throw. Stops prod from silently swallowing emails.
- `smtp` missing any of `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` → throw naming missing fields.
- `resend` without `RESEND_API_KEY` → throw.

Runs **once at import time**. Mis-configured deployment crashes before serving traffic — not 30 min later on first verify email.

### Skip-list

`EMAIL_VERIFICATION_SKIP_LIST` is comma-separated. `sendEmail` compares each entry case-insensitively after `trim().toLowerCase()`. Matching → logged as skipped, returns without render/dispatch. Intended for dev (e.g. `admin@tan-admin.local`). **Keep empty in production.**

### Template / transport interaction

- `pretty: true` in dev (`appConfig.env !== "prod"`), `pretty: false` in prod (minified HTML saves bandwidth).
- `text` always generated via `toPlainText(html)` for multipart fallback (deliverability).
- `sendMail` errors logged with `{ err, to, type }` and rethrown by `sendEmail`. Callers (BA hooks) decide retry/surface.

### Better Auth wiring

```ts
// src/lib/auth.ts
emailAndPassword: {
  sendResetPassword: ({ user, url }) =>
    sendEmail({ type: "reset",  to: user.email, props: { url, userName: user.name } }),
},
emailVerification: {
  sendVerificationEmail: ({ user, url }) =>
    sendEmail({ type: "verify", to: user.email, props: { url, userName: user.name } }),
},
organization({
  sendInvitationEmail: ({ email, inviter, organization: org, invitation }) => {
    const isTransfer = invitation.role === "owner";
    sendEmail({
      type: isTransfer ? "transfer" : "invite",
      to: email,
      props: { url, inviterName: inviter.user.name, organizationName: org.name },
    });
  },
});
```

`invitation.role === "owner"` is the single switch that branches invite vs transfer template — no parallel hook.

---

## 4. Validation Matrix

| Condition | Expected |
|---|---|
| `smtp` missing creds | Module load throws naming missing field |
| `resend` missing key | Module load throws |
| `APP_ENV=prod` + `console` | Module load throws |
| `EMAIL_FROM_NAME` unset | From header = bare `EMAIL_FROM` |
| `EMAIL_FROM_NAME` set | From header = `"Name" <email>` |
| `to` in skip-list (case-insensitive) | Logged, no render/send |
| SMTP `verify()` fails at boot | Warn-only; provider may reject verify but accept `sendMail` |
| `sendMail` throws in BA hook | `sendEmail` logs + rethrows; BA hook is post-commit (#7260), signup still succeeds |
| React-email render throws | Propagates; caller sees error |
| Resend returns `{ error }` | `sendMail` throws `Error("[resend] <message>")` |

**Post-commit caveat**: `sendVerificationEmail` fires after user row committed, so transport failure does not roll back signup. Operators need manual "resend verification" path (out of scope Phase 1).

---

## 5. Good / Bad Cases

### Good — dev console

```bash
EMAIL_TRANSPORT=console
EMAIL_VERIFICATION_SKIP_LIST=admin@tan-admin.local
```

Signup logs `"[EMAIL_TRANSPORT=console] mail skipped (dev)"` + extracted verify URL; super-admin auto-verified via skip-list.

### Good — prod SMTP (Aliyun Direct Mail)

```bash
EMAIL_TRANSPORT=smtp
SMTP_HOST=smtpdm.aliyun.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=...              # SMTP auth code, not mailbox password
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Tan Admin
EMAIL_VERIFICATION_SKIP_LIST=
```

Boot logs `"SMTP transporter verified"`; all 4 mails deliver.

### Bad — misconfig silently continues

```bash
APP_ENV=prod
EMAIL_TRANSPORT=console    # ← no validation → every verify email lost
# or: EMAIL_TRANSPORT=smtp with SMTP_* all unset
```

Both **must** crash at boot. If they silently start, validation was bypassed (e.g. lazy driver init instead of module-load).

---

## 6. Tests Required

| Test | Assertion |
|---|---|
| `email-transport.boot.test.ts` | `smtp` without creds throws at import |
| `email-transport.boot.test.ts` | `resend` without key throws at import |
| `email-transport.boot.test.ts` | `prod` + `console` throws |
| `email.test.ts` | `shouldSkip("AdMin@Tan-Admin.LOCAL")` matches `admin@tan-admin.local` (case-insensitive) |
| `email.test.ts` | Each `type` dispatches correct template (mock `render`) |
| `email.test.ts` | Subject from `m.email_subject_*()` |
| `email.test.ts` | `sendMail` failure bubbles out of `sendEmail` after logging |

No e2e SMTP test — manual QA against real provider (Aliyun / QQ) during release.

---

## 7. Wrong vs Correct — module-load factory, not lazy

```ts
// ❌ Lazy init — validation deferred
let driver: Driver | null = null;
export async function sendMail(msg: MailMessage) {
  if (!driver) {
    validateTransportEnv();
    driver = buildDriver();
  }
  await driver(msg);
}
// 1) First email request pays the boot cost
// 2) Misconfigured prod starts happily; error surfaces only when user hits signup
// 3) SMTP verify() moves from boot-time warning to inline blocking

// ✅ Module-load factory — validation and driver construction are one-time,
//    deterministic, fail-fast. Server either starts with a working email
//    path, or it doesn't start.
function buildDriver(): Driver { /* switch on env */ }
validateTransportEnv();
const driver: Driver = buildDriver();

export async function sendMail(m: MailMessage): Promise<void> {
  await driver(m);
}
```

---

## Related

- `frontend/i18n.md` — email templates consume Paraglide `m.email_*()`; subject lines too
- `backend/tenancy-modes.md` — `sendInvitationEmail` branches on `invitation.role === "owner"` for transfer flow
- `backend/authorization-boundary.md` — BA organization plugin owns invitation table; email path is a thin adapter
- `docs/research/plugin-organization-deep.md` — BA 1.6.5 findings (transfer ownership + `beforeAcceptInvitation`)
