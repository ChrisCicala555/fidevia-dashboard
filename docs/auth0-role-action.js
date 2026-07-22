/**
 * Auth0 Action — "Assign Fidevia Role"
 * Trigger: Login / Post Login
 *
 * Stamps a signed role claim into the ID token based on email domain.
 * Runs on Auth0's servers during every login, so the browser cannot forge it.
 *
 * HOW TO INSTALL:
 *   Auth0 Dashboard → Actions → Library → Build Custom
 *   Name: "Assign Fidevia Role", Trigger: Login / Post Login
 *   Paste this code → Deploy → then Actions → Flows → Login → drag it into the flow → Apply
 */
exports.onExecutePostLogin = async (event, api) => {
  const email = (event.user.email || '').toLowerCase();
  const isInternal = email.endsWith('@fidevia.com') && event.user.email_verified;
  const role = isInternal ? 'internal' : 'external';

  // Namespaced custom claim (Auth0 requires a namespace URL for custom claims)
  const ns = 'https://fidevia.com/';
  api.idToken.setCustomClaim(ns + 'role', role);
  api.accessToken.setCustomClaim(ns + 'role', role);
};
