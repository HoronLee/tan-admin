# Email Infrastructure

> Executable contract for transactional email: transport abstraction, react-email templates, boot-time validation, and the i18n-aware send path.

---

## 1. Scope / Trigger

Triggers when work touches any of:

- `src/lib/email.tsx` (high-level `sendEmail` entry)
- `src/lib/email-transport.ts` (low-level driver factory)
- `src/emails/*.tsx` (react-email templates or shared layout)
- `src/lib/auth.ts` hooks that send mail (`sendVerificationEmail` / `sendResetPassword` / `sendInvitationEmail`)
- `EMAIL_*` / `SMTP_*` / `RESEND_API_KEY` env declarations in `src/env.ts`
- Adding a new email template or transport driver

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

- Discriminated union — each template's required props are checked at the call site.
- Subject line resolved via Paraglide `m.email_subject_*()` (i18n).
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

- Driver is picked **once at module-load time** based on `env.EMAIL_TRANSPORT`.
- `sendMail` is exported for tests / tooling; production code goes through `sendEmail`.

### Template component contract (`src/emails/*.tsx`)

```ts
// Each template exports its own typed Props interface.
export interface VerifyEmailProps      { url: string; userName?: string }
export interface ResetPasswordProps    { url: string; userName?: string }
export interface InviteMemberProps     { url: string; inviterName: string; organizationName: string }
export interface TransferOwnershipProps{ url: string; inviterName: string; organizationName: string }

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

Always-required: `EMAIL_FROM` (email address); optional `EMAIL_FROM_NAME` composes `"Name" <address>` format.

### Boot-time validation rules

Performed in `validateTransportEnv()` at module load of `email-transport.ts`:

- `appConfig.env === "prod"` **and** `EMAIL_TRANSPORT === "console"` → throw. Stops prod from silently swallowing verification emails.
- `EMAIL_TRANSPORT === "smtp"` with any of `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` missing → throw naming the missing fields.
- `EMAIL_TRANSPORT === "resend"` without `RESEND_API_KEY` → throw.

Validation runs **once**, at import time. A mis-configured deployment crashes before it accepts traffic — not 30 minutes later on the first verification email.

### Skip-list semantics

- `EMAIL_VERIFICATION_SKIP_LIST` is a comma-separated string.
- `sendEmail` compares each entry case-insensitively after `trim().toLowerCase()`.
- Matching addresses are logged as skipped and `sendEmail` returns without rendering or dispatching.
- Intended for dev (e.g. `admin@tan-admin.local`) so the super-admin can log in without a real inbox. **Keep empty in production.**

### Template / transport interaction

- Template rendering uses `pretty: true` in dev (`appConfig.env !== "prod"`) and `pretty: false` in prod — minified HTML saves bandwidth in production.
- Plain-text `text` is always generated via `toPlainText(html)` so every transport has a multipart fallback (deliverability signal).
- Errors from `sendMail` are logged with `{ err, to, type }` and rethrown by `sendEmail`. Callers (Better Auth hooks) decide whether to retry or surface.

### Better Auth wiring

Three BA hooks currently call `sendEmail`:

```ts
// src/lib/auth.ts
emailAndPassword: {
  sendResetPassword: ({ user, url }) =>
    sendEmail({ type: "reset",   to: user.email, props: { url, userName: user.name } }),
},
emailVerification: {
  sendVerificationEmail: ({ user, url }) =>
    sendEmail({ type: "verify",  to: user.email, props: { url, userName: user.name } }),
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

## 4. Validation & Error Matrix

| Condition | Expected behaviour |
|---|---|
| `EMAIL_TRANSPORT=smtp` missing `SMTP_HOST` | Module load throws: `"...SMTP_TRANSPORT=smtp requires: SMTP_HOST..."` |
| `EMAIL_TRANSPORT=resend` missing `RESEND_API_KEY` | Module load throws |
| `APP_ENV=prod` + `EMAIL_TRANSPORT=console` | Module load throws |
| `EMAIL_FROM_NAME` unset | From header = bare `EMAIL_FROM` |
| `EMAIL_FROM_NAME` set | From header = `"Name" <email>` |
| `to` in `EMAIL_VERIFICATION_SKIP_LIST` (case-insensitive) | Logged as skipped, no render/send |
| SMTP `verify()` fails at boot | Warn log only; provider may reject verify but accept sendMail |
| `sendMail` throws inside BA hook | `sendEmail` logs + rethrows; BA's hook is post-commit (#7260), so signup still succeeds |
| React-email render throws | Propagates out of `sendEmail`; caller sees the error |
| Resend returns `{ error }` | `sendMail` throws `Error("[resend] <message>")` |

**Post-commit hook caveat**: Because `sendVerificationEmail` fires after the user row is committed, a transport failure does **not** roll back signup. Operators need a manual "resend verification email" path for failed sends (out of scope for Phase 1).

---

## 5. Good / Base / Bad Cases

### Good — dev console transport

```bash
# .env.local
EMAIL_TRANSPORT=console
EMAIL_VERIFICATION_SKIP_LIST=admin@tan-admin.local
```

Dev signup logs `"[EMAIL_TRANSPORT=console] mail skipped (dev)"` with the extracted verify URL; super-admin auto-verified via skip list.

### Base — production SMTP (Aliyun Direct Mail)

```bash
EMAIL_TRANSPORT=smtp
SMTP_HOST=smtpdm.aliyun.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=...           # SMTP auth code, not mailbox password
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Tan Admin
EMAIL_VERIFICATION_SKIP_LIST=
```

Boot logs `"SMTP transporter verified"`; verify/reset/invite/transfer emails deliver.

### Bad — misconfig silently continues

```bash
# Prod with console transport
APP_ENV=prod
EMAIL_TRANSPORT=console   # ← no validation → every verify email lost
```

Or:

```bash
EMAIL_TRANSPORT=smtp
# SMTP_HOST / SMTP_USER / SMTP_PASS all unset
```

Either of these **must** crash at boot. If you see them silently start, the validation was bypassed (e.g. lazy driver init instead of module-load).

---

## 6. Tests Required

| Test | Assertion point | Type |
|---|---|---|
| `email-transport.boot.test.ts` | `EMAIL_TRANSPORT=smtp` without creds throws at import | Integration (reset modules) |
| `email-transport.boot.test.ts` | `EMAIL_TRANSPORT=resend` without key throws at import | Integration |
| `email-transport.boot.test.ts` | `APP_ENV=prod` + `EMAIL_TRANSPORT=console` throws | Integration |
| `email.test.ts` | `shouldSkip("AdMin@Tan-Admin.LOCAL")` when list has `admin@tan-admin.local` (case-insensitive match) | Unit |
| `email.test.ts` | Each `type` dispatches the correct template (mock `render`, assert it was called with the right component) | Unit |
| `email.test.ts` | Subject line comes from `m.email_subject_*()` (import Paraglide, assert output) | Unit |
| `email.test.ts` | `sendMail` failure bubbles out of `sendEmail` after logging | Unit |

No end-to-end SMTP test — covered by manual QA against a real provider (Aliyun / QQ) during release.

---

## 7. Wrong vs Correct

### Wrong — lazy driver init (validation deferred)

```ts
// src/lib/email-transport.ts  (anti-pattern)
let driver: Driver | null = null;

export async function sendMail(msg: MailMessage) {
  if (!driver) {
    // validate + build here
    validateTransportEnv();
    driver = buildDriver();
  }
  await driver(msg);
}
```

Problems:
1. First email request pays the boot cost.
2. Mis-configured prod starts happily; error only surfaces when a user hits signup.
3. `SMTP transporter.verify()` moves from boot-time warning to inline blocking.

### Correct — module-load factory

```ts
// src/lib/email-transport.ts
function buildDriver(): Driver { /* switch on env */ }

validateTransportEnv();          // throws on bad config
const driver: Driver = buildDriver();

export async function sendMail(m: MailMessage): Promise<void> {
  await driver(m);
}
```

Rationale: validation and driver construction are one-time, deterministic, and fail fast. The server either starts with a working email path, or it does not start.

---

## Related

- `.trellis/spec/frontend/i18n.md` — email templates consume Paraglide `m.email_*()`; subject lines too
- `.trellis/spec/backend/tenancy-modes.md` — `sendInvitationEmail` branches on `invitation.role === "owner"` for transfer flow
- `.trellis/spec/backend/authorization-boundary.md` — BA organization plugin owns the invitation table; email path is a thin adapter
- `docs/research/plugin-organization-deep.md` — real-world BA 1.6.5 findings (transfer ownership + `beforeAcceptInvitation` signature)
