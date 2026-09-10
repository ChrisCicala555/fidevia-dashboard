# Parked: logins, password resets and the Auth0 domain

> Part of the outstanding list in `TODO.md`.

Raised 10 Sep 2026 and deliberately parked to stay on the dashboard itself.
Nothing here is a code change waiting to be written — all of it needs somebody
inside the Auth0 dashboard first, and possibly a decision about tenants.

## What was seen

1. A password reset email arrived styled as Auth0's default — black button,
   speech-bubble icon, the raw ticket URL printed above it.
2. Both the link and the reset page were served from
   `dev-477eis4yqjwd6d4g.us.auth0.com`.
3. The new password chosen on that page **did not work** at sign-in.

The first is fixed as far as it can be from here: `auth0-emails/change-password.html`
is the dashboard's own template, ready to paste into Auth0 → Branding → Email
Templates → Change Password. Applying it is a dashboard action.

## What is actually inconsistent

The application already uses the custom domain:

```
index.html            AUTH0_DOMAIN = 'login.fidevia.com'
box-proxy.mjs         AUTH0_DOMAIN = 'login.fidevia.com'
                      AUTH0_DOMAIN_FALLBACK = 'dev-477eis4yqjwd6d4g.us.auth0.com'
```

The fallback exists so tokens issued before commit c007542 still verify. It is
not meant to be the domain anybody is sent to.

`resetPassword()` in index.html posts to
`https://login.fidevia.com/dbconnections/change_password`, so a reset started
from **My Account inside the dashboard** should produce a `login.fidevia.com`
link. A reset started from **"Forgot password?" on the Auth0 login page** takes
whatever domain that page was served from. Which of the two was used has not
been established, and it decides whether there is anything to fix here at all.

## Why the new password might not work — in the order worth checking

These are hypotheses. None has been tested; testing needs credentials, which
is not something to hand over.

1. **The account has no database identity.** If it was created through Google
   or Apple, a password reset can appear to succeed while there is still no
   password to sign in with — the account only has a social identity.
   `caulked-remains18@icloud.com` is the kind of address that usually arrives
   that way.
2. **Two user records share the email**, in different connections. Auth0 allows
   it. The reset ticket touches one; sign-in resolves the other.
3. **The reset was issued in a different context** from the one being signed
   into — the domain difference above is the visible symptom of that.

All three are answerable in a couple of minutes: **User Management → Users**,
search the address, and read *Identities* and *Connection* on each record that
comes back. That is a read, not a change.

## The tenant question, which is separate and larger

`dev-` is a Development tenant. Auth0 rate-limits those more aggressively than
production ones — the 503 back-off loop in `proxyCall` exists partly because of
it. Moving to a production tenant means recreating the application, the
role-assigning Action, the connection, and every existing user record, so it is
a planned migration rather than a setting.

Worth doing before real contractors depend on this. Not worth doing in the
middle of something else.

## What to pick this back up with

- Which reset route was used: My Account, or the login page?
- What Auth0 shows for that email under User Management → Users.
- A decision on the dev-tenant migration, with a date rather than a maybe.
