# Auth0 emails and the login domain

Two things live in the Auth0 dashboard rather than in this repository, which is
why they do not match anything else and cannot be fixed by pushing code.

## 1. The password reset email

Auth0 sends it, not the dashboard, so `emailTemplate` in index.html never
touched it — hence the black button, the Auth0 speech-bubble icon and the raw
URL printed above it.

`change-password.html` here is the same shell every dashboard notification
uses, checked element by element against the rendered output of
`emailTemplate`: the 600px card, the wordmark, the CONSTRUCTION DASHBOARD
strip, the olive rule, the Georgia two-tone heading, the olive button, the
footer rule and line.

**To apply it:** Auth0 → Branding → Email Templates → *Change Password*, and
paste it into the Message body.

- Set **From** to `dashboard@fidevia.com` so it comes from the same address as
  everything else the dashboard sends.
- Set **Subject** to `Reset your Fidevia Dashboard password`.
- Leave the template **enabled** and the URL lifetime as it is.

Auth0 renders Liquid. The template uses `{{ url }}` (the one-time link) and
`{{ user.email }}`. Keep the double braces.

The raw URL is kept, once, at the bottom in small muted type — a reset mail
that only offers a button is unusable in a client that strips them, and a
password link is the worst place to leave somebody stuck.

## 2. The domain the reset link came from

**Correction to an earlier version of this note.** It said the fix was to set
up an Auth0 custom domain. That was written without reading the config, and it
was wrong: the custom domain already exists. Commit c007542 moved both the
client SDK and the server-side token validation to `login.fidevia.com`, and
`box-proxy.mjs` keeps `dev-477eis4yqjwd6d4g.us.auth0.com` only as
`AUTH0_DOMAIN_FALLBACK`, for tokens issued before the switch.

So a password reset arriving on the dev domain is not a missing feature. It is
one flow still using the old domain while everything else uses the new one, and
that is written up in `docs/TODO-auth0-logins.md` along with the sign-in
failure that came with it.
