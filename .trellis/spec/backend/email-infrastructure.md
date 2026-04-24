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

### Templates directory layout

```
src/
├── components/email/              # 7 BA UI transactional templates (shadcn-added, own source)
│   ├── email-verification.tsx     # signup verification
│   ├── reset-password.tsx         # forgot-password link
│   ├── email-changed.tsx          # post-change confirmation
│   ├── password-changed.tsx       # post-change confirmation
│   ├── magic-link.tsx             # passwordless link
│   ├── new-device.tsx             # unknown-device alert
│   ├── otp.tsx                    # verification code
│   └── email-styles.tsx           # shared CSS injection (light/dark + tw classnames)
└── emails/                         # 2 org-specific templates (hand-written, mirror BA UI look)
    ├── invite-member.tsx           # org invite
    └── transfer-ownership.tsx      # org ownership transfer (invitation.role === "owner")
```

BA UI templates are installed via `pnpm dlx shadcn@latest add https://better-auth-ui.com/r/<name>-email.json` — we own the source, not the package. Re-sync with `shadcn add` when BA UI publishes updates; only post-install fix is rewriting `../../lib/utils` → `#/lib/utils` (shadcn CLI doesn't rewrite the relative source path baked into BA UI's registry `files[].path`).

All 9 templates use `<EmailStyles>` (CSS injection in `<Head>` instead of a `<Layout>` wrapper), `pixelBasedPreset` Tailwind, and `cn()` for className merging. Shadcn tokens (`bg-background`, `text-card-foreground`, `border-border`) resolve via `EmailStyles` — emails stay on the same design system as the app.

### Localization factory pattern (`src/lib/email-localization.ts`)

BA UI components accept `localization?: Partial<XxxLocalization>` and merge with their hard-coded English default. We want full i18n control, so we build a **complete** localization object from Paraglide messages per render:

```ts
export function verifyLocalization(): EmailVerificationEmailLocalization {
  return {
    VERIFY_YOUR_EMAIL_ADDRESS: m.email_verify_title(),
    CLICK_BUTTON_TO_VERIFY_EMAIL: m.email_verify_click_to_verify({
      emailAddress: "{emailAddress}",   // pass through BA UI placeholders
      appName: "{appName}",             // BA UI does .replace() at render
    }),
    // ... every key 1:1 mapped
  };
}
```

Paraglide placeholders stay literal `{emailAddress}` / `{appName}` / `{expirationMinutes}` because BA UI templates do `.replace()` at render time — we hand off a pre-translated string with placeholders intact, BA UI fills the values.

**Why not modify BA UI source**: keeping translations in factories means `shadcn add ...` can re-sync templates without clobbering our work. If BA UI renames a localization field the factory breaks at compile time — single-file fix.

### Brand integration (`buildBrandProps()` in `src/lib/email.tsx`)

All BA UI components accept `appName` + `logoURL` props. `buildBrandProps()` reads `appConfig.brand` (server-side `BRAND_*` env) and returns a ready-to-spread object:

```ts
function buildBrandProps() {
  const { name, logoURL, logoDarkURL } = appConfig.brand;
  return {
    appName: name,                             // never undefined — falls back to "Tan Servora"
    logoURL: logoURL
      ? logoDarkURL
        ? { light: logoURL, dark: logoDarkURL }
        : logoURL                              // single URL reused for both modes
      : undefined,                             // unset → BA UI renders no logo
  };
}
```

Every `render()` spreads `{...buildBrandProps()}` before spreading caller props, so templates stay consistent across emails without per-callsite boilerplate.

### Template component contract

```ts
// BA UI templates (7) — rich prop set for flexibility
export interface EmailVerificationEmailProps {
  url: string;
  email?: string;
  appName?: string;
  expirationMinutes?: number;
  logoURL?: string | { light: string; dark: string };
  classNames?: EmailClassNames;
  colors?: EmailColors;
  poweredBy?: boolean;
  darkMode?: boolean;
  localization?: Partial<EmailVerificationEmailLocalization>;
}
// ResetPasswordEmailProps / EmailChangedEmailProps / PasswordChangedEmailProps /
// MagicLinkEmailProps / NewDeviceEmailProps / OtpEmailProps follow the same shape
// with template-specific required fields.

// Org templates (2) — minimal, caller supplies inviter + org identity
export interface InviteMemberProps {
  url: string;
  inviterName: string;
  organizationName: string;
  // rest optional — `appName` / `logoURL` / `classNames` / `colors` / `darkMode` / `poweredBy`
}
export interface TransferOwnershipProps { /* same shape as InviteMember */ }
```

Caller payload (`sendEmail`) omits `appName` / `logoURL` / `localization` — those are injected centrally in `renderTemplate`. Signature enforced via `Omit<...>` in the `EmailPayload` discriminated union.

---

## 3. Contracts

### Required env per driver

| `EMAIL_TRANSPORT` | Required env | Behaviour |
|---|---|---|
| `console` (dev default) | none | Logs subject + first URL found in body. No network call. |
| `smtp` | `SMTP_HOST` required; `SMTP_USER` + `SMTP_PASS` both-or-neither (unauth relays like mailpit/maildev work without); `SMTP_PORT` / `SMTP_SECURE` opt | `nodemailer` pool; `verify()` on boot (warn-only); `auth: undefined` when creds absent. |
| `resend` | `RESEND_API_KEY` | `Resend().emails.send(...)`; throws on non-null `{ error }` result. |

Always-required: `EMAIL_FROM`; optional `EMAIL_FROM_NAME` composes `"Name" <address>`.

### Boot-time validation (`validateTransportEnv()` at module load)

- `appConfig.env === "prod"` **and** `EMAIL_TRANSPORT === "console"` → throw. Stops prod from silently swallowing emails.
- `smtp` missing `SMTP_HOST` → throw. `SMTP_USER` XOR `SMTP_PASS` (one set, the other empty) → throw. Both empty is valid (local relay path).
- `resend` without `RESEND_API_KEY` → throw.

Runs **once at import time**. Mis-configured deployment crashes before serving traffic — not 30 min later on first verify email.

### Dev auto-verify domain

`APP_ENV=dev` + signup email ending in `@dev.com` → `sendVerificationEmail` hook flips `user.emailVerified=true` in-place via shared `pool` and skips dispatch. Hardcoded in `src/lib/auth.ts` (`DEV_AUTO_VERIFY_DOMAIN`). Prod and non-matching addresses go through normal verification. Super-admin seed bypasses this path entirely via `internalAdapter.createUser({ emailVerified: true })`.

### Template / transport interaction

- `pretty: true` in dev (`appConfig.env !== "prod"`), `pretty: false` in prod (minified HTML saves bandwidth).
- `text` always generated via `toPlainText(html)` for multipart fallback (deliverability).
- `sendMail` errors logged with `{ err, to, type }` and rethrown by `sendEmail`. Callers (BA hooks) decide retry/surface.

### Better Auth wiring

```ts
// src/lib/auth.ts
emailAndPassword: {
  sendResetPassword: ({ user, url }) =>
    sendEmail({ type: "reset",  to: user.email, props: { url, email: user.email } }),
},
emailVerification: {
  sendVerificationEmail: ({ user, url }) =>
    sendEmail({ type: "verify", to: user.email, props: { url, email: user.email } }),
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
| `smtp` missing `SMTP_HOST` | Module load throws |
| `smtp` has `SMTP_USER` xor `SMTP_PASS` | Module load throws (both-or-neither) |
| `smtp` with neither creds | Valid; `auth: undefined`, works for mailpit/maildev/local relay |
| `resend` missing key | Module load throws |
| `APP_ENV=prod` + `console` | Module load throws |
| `EMAIL_FROM_NAME` unset | From header = bare `EMAIL_FROM` |
| `EMAIL_FROM_NAME` set | From header = `"Name" <email>` |
| `APP_ENV=dev` + `user.email` ends `@dev.com` | `sendVerificationEmail` sets `emailVerified=true`, skips dispatch |
| SMTP `verify()` fails at boot | Warn-only; provider may reject verify but accept `sendMail` |
| `sendMail` throws in BA hook | `sendEmail` logs + rethrows; BA hook is post-commit (#7260), signup still succeeds |
| React-email render throws | Propagates; caller sees error |
| Resend returns `{ error }` | `sendMail` throws `Error("[resend] <message>")` |

**Post-commit caveat**: `sendVerificationEmail` fires after user row committed, so transport failure does not roll back signup. Operators need manual "resend verification" path (out of scope Phase 1).

---

## 5. Good / Bad Cases

### Good — dev console

```bash
APP_ENV=dev
EMAIL_TRANSPORT=console
```

Signup from non-`@dev.com` addresses logs `"[EMAIL_TRANSPORT=console] mail skipped (dev)"` + extracted verify URL (click-through via log). `@dev.com` addresses auto-verify without emitting the URL. Super-admin is seeded verified regardless.

### Good — prod SMTP (Aliyun Direct Mail)

```bash
EMAIL_TRANSPORT=smtp
SMTP_HOST=smtpdm.aliyun.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=...              # SMTP auth code, not mailbox password
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Tan Servora
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
| `email.test.ts` | `shouldSkip("AdMin@Tan-Servora.LOCAL")` matches `admin@tan-servora.local` (case-insensitive) |
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
- `backend/product-modes.md` — `sendInvitationEmail` branches on `invitation.role === "owner"` for transfer flow
- `backend/authorization-boundary.md` — BA organization plugin owns invitation table; email path is a thin adapter
- `docs/research/plugin-organization-deep.md` — BA 1.6.5 findings (transfer ownership + `beforeAcceptInvitation`)
