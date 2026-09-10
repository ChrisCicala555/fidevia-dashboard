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

## 2. `dev-477eis4yqjwd6d4g.us.auth0.com`

That is the tenant's default Auth0 domain, and it is what the reset link and
the login page are served from. It is fixable, and it is worth fixing: a
password page on a domain nobody recognises is exactly what a phishing page
looks like, and telling people to trust it teaches them the wrong lesson.

**The fix is an Auth0 custom domain** — `login.fidevia.com`, say. Auth0's Free
plan includes one custom domain; a card has to be on file for verification but
is not charged. Branding → Custom Domains, then add the CNAME/TXT records
Auth0 gives you to the fidevia.com DNS.

Three things to do at the same time, or the change breaks sign-in:

1. Update `auth0Client` in index.html to the new domain.
2. Add the new domain to Allowed Callback/Logout/Web Origins on the
   application.
3. Re-check the Auth0 Action that assigns internal/external roles — it keys on
   the email domain, not the tenant, so it should be unaffected, but confirm.

**The `dev-` prefix is the other half of it.** That is a Development tenant.
Auth0 rate-limits those harder than production ones, and the 503 back-off in
`proxyCall` exists partly because of it. A production tenant with the custom
domain on it is the real answer; moving means recreating the application, the
Action and the connection, and every existing user record.

Neither is a code change, which is why both are written down here rather than
done.
