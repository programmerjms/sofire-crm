/* ══════════════════════════════════════════════════════════════════
   SESSION RECOVERY PATCH  —  v1.0
   ------------------------------------------------------------------
   Fixes: "Migration failed: HTTP 401: Unauthorized — invalid or
   expired session", and the silent sync divergence between browsers
   that it causes.

   Root cause
   ----------
   `sofire_db_token` is written to localStorage once at login and then
   reused forever. Tokens are HMAC-signed with SUPABASE_SERVICE_ROLE_KEY
   and hard-expire after 30 days (db.js verifySessionToken). Once the
   token dies, every gated action — sync.push, sync.pull, sync.migrate —
   returns HTTP 401, and NOTHING in the client clears the dead token or
   re-authenticates. migrateToSupabase() and forcePullFromSupabase()
   only prompt for a password `if (!token)`, so a token that is present
   but invalid skips re-auth entirely. The app is permanently stuck.

   Because pushToSupabase() only console.warn()s on failure while the
   UI still shows "✓ Saved", the failure is invisible: browser #1 keeps
   writing to localStorage, the cloud never updates, and browser #2
   shows stale data.

   What this does
   --------------
   Wraps the global dbCall() and adds the missing recovery path:
     • detects a 401 / expired-session response
     • clears the dead token
     • re-authenticates once (single prompt, deduped across concurrent
       calls, rate-limited so it cannot nag in a loop)
     • retries the original request with the fresh token
     • surfaces sync.push failures in the UI instead of swallowing them

   Loaded as a separate script AFTER the main bundle, so it touches no
   existing code and can be removed by deleting one <script> tag.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _origDbCall = window.dbCall;
  if (typeof _origDbCall !== 'function') {
    console.error('[session-recovery] dbCall not found — patch not applied.');
    return;
  }

  /* Actions that must never trigger recovery: they ARE the auth path.
     Retrying them on 401 would recurse. */
  var AUTH_ACTIONS = { 'auth.login': 1, 'auth.verify': 1, 'auth.refresh': 1 };

  var reauthInFlight = null;   /* dedupes concurrent 401s into one prompt */
  var lastReauthFail = 0;      /* backoff so a wrong password can't loop   */
  var REAUTH_COOLDOWN_MS = 30000;

  function isAuthError(res) {
    if (!res || !res.error) return false;
    var e = String(res.error);
    return e.indexOf('HTTP 401') === 0 ||
           /invalid or expired session/i.test(e) ||
           /unauthorized/i.test(e);
  }

  function notify(msg, kind) {
    if (typeof toast === 'function') { try { toast(msg, kind); return; } catch (e) {} }
    console[kind === 'error' ? 'error' : 'log']('[session-recovery] ' + msg);
  }

  /* ── Re-authenticate once, return a fresh token or null ─────────── */
  async function reauthenticate() {
    if (reauthInFlight) return reauthInFlight;
    if (Date.now() - lastReauthFail < REAUTH_COOLDOWN_MS) return null;

    reauthInFlight = (async function () {
      try {
        var sess = (typeof getSession === 'function' && getSession()) || null;
        var username = (sess && sess.username) || 'juan';

        var pw = window.prompt(
          'Your Supabase session has expired.\n\n' +
          'Enter your CRM password to reconnect. Your data is safe — ' +
          'nothing has been lost, it just has not reached the cloud yet.'
        );
        if (!pw) { lastReauthFail = Date.now(); return null; }

        var hash = await sha256(pw);
        var res = await _origDbCall('auth.login', { username: username, passwordHash: hash }, '');

        if (res && res.success && res.token) {
          setDbToken(res.token);
          notify('✓ Reconnected to Supabase', 'success');
          return res.token;
        }

        lastReauthFail = Date.now();
        notify('Reconnect failed: ' + ((res && res.error) || 'wrong password'), 'error');
        return null;
      } catch (e) {
        lastReauthFail = Date.now();
        notify('Reconnect error: ' + e.message, 'error');
        return null;
      } finally {
        reauthInFlight = null;
      }
    })();

    return reauthInFlight;
  }

  /* ── Report sync.push outcomes the user would otherwise never see ── */
  function reportPush(res) {
    if (typeof setSyncStatus !== 'function') return;
    try {
      if (res && res.error) setSyncStatus('offline');
      else if (res && res.success) setSyncStatus('saved');
    } catch (e) {}
  }

  /* ── The wrapper ────────────────────────────────────────────────── */
  window.dbCall = async function (action, payload, token) {
    var hasExplicitToken = arguments.length >= 3;
    var useToken = hasExplicitToken ? token : (typeof getDbToken === 'function' ? getDbToken() : '');
    if (payload === undefined) payload = {};

    var res = await _origDbCall(action, payload, useToken);

    /* Happy path, or an error we must not recover from */
    if (!isAuthError(res) || AUTH_ACTIONS[action]) {
      if (action === 'sync.push') reportPush(res);
      return res;
    }

    console.warn('[session-recovery] 401 on "' + action + '" — token is dead, recovering.');
    if (typeof setDbToken === 'function') setDbToken(null);

    var fresh = await reauthenticate();
    if (!fresh) {
      if (action === 'sync.push') reportPush(res);
      return res;   /* hand the original error back unchanged */
    }

    var retry = await _origDbCall(action, payload, fresh);
    if (action === 'sync.push') reportPush(retry);
    if (!isAuthError(retry)) {
      console.log('[session-recovery] "' + action + '" succeeded after re-auth.');
    }
    return retry;
  };

  /* Expose for the test harness / manual inspection */
  window.__sessionRecovery = {
    version: '1.0',
    isAuthError: isAuthError,
    reset: function () { reauthInFlight = null; lastReauthFail = 0; }
  };

  console.log('[session-recovery] v1.0 active — dbCall now self-heals on 401.');
}());