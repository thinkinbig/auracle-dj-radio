/**
 * Map Supabase Auth error codes to user-friendly messages.
 *
 * Codes verified against @supabase/auth-js's `ErrorCode` union
 * (node_modules/@supabase/auth-js/src/lib/error-codes.ts). The SDK type
 * itself notes the server may return codes outside this list if the client
 * is older than the server, so unknown codes fall back to `error.message`
 * and a 429 status is treated as a rate limit even without a matching code.
 */

/**
 * signUp() for an existing confirmed user returns HTTP 200 with no `error`
 * (an anti-enumeration measure — see GoTrueClient.signUp jsdoc), so this
 * case can't be reached through error-code mapping. authApi.ts detects it
 * via `user.identities.length === 0` and throws this message directly.
 */
export const EMAIL_ALREADY_REGISTERED_MESSAGE = 'Email already registered. Please log in instead.';

export function getAuthErrorMessage(error: unknown): string {
  if (!(error instanceof Object)) return 'Authentication failed. Please try again.';

  const code = (error as Record<string, unknown>).code;
  const status = (error as Record<string, unknown>).status;
  const message = (error as Record<string, unknown>).message;
  const fallback = typeof message === 'string' && message.trim() ? message : 'Authentication failed. Please try again.';

  // Check the code first: a rate-limited response carries status 429 *and*
  // a specific code (over_request_rate_limit vs. over_email_send_rate_limit).
  // Checking status first would always win with the generic message and
  // hide the more accurate one below.
  if (typeof code === 'string') {
    const codeMessage = messageForCode(code);
    if (codeMessage) return codeMessage;
  }
  if (status === 429) return 'Too many attempts. Please wait a few minutes before trying again.';
  return fallback;
}

function messageForCode(code: string): string | undefined {
  switch (code) {
    case 'user_already_exists':
    case 'email_exists':
    case 'identity_already_exists':
      return EMAIL_ALREADY_REGISTERED_MESSAGE;

    case 'weak_password':
      return 'Password must be at least 8 characters with uppercase, lowercase, number, and special character.';

    case 'invalid_credentials':
      return 'Incorrect email or password.';

    case 'email_not_confirmed':
      return 'Check your email to confirm your account, then log in.';

    case 'user_not_found':
      return 'User not found. Please create an account.';

    case 'user_banned':
      return 'This account has been suspended. Please contact support.';

    case 'over_request_rate_limit':
      return 'Too many attempts. Please wait a few minutes before trying again.';

    case 'over_email_send_rate_limit':
      return 'Too many emails sent. Please wait before requesting another.';

    case 'session_not_found':
    case 'session_expired':
    case 'refresh_token_not_found':
    case 'refresh_token_already_used':
      return 'Session expired. Please log in again.';

    case 'signup_disabled':
    case 'email_provider_disabled':
      return 'Sign up is currently disabled. Please try again later.';

    case 'oauth_provider_not_supported':
    case 'provider_disabled':
      return 'This login provider is temporarily unavailable. Please try another method.';

    case 'bad_oauth_state':
    case 'bad_oauth_callback':
      return 'Login could not be completed. Please try again.';

    case 'captcha_failed':
      return 'Verification failed. Please try again.';

    case 'same_password':
      return 'New password must be different from your current password.';

    default:
      console.warn('[auth] unknown Supabase auth error code:', code);
      return undefined;
  }
}
