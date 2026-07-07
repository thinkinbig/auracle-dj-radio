import { describe, expect, it } from 'vitest';
import { getAuthErrorMessage } from './authErrors';

describe('getAuthErrorMessage', () => {
  it('maps user_already_exists to a login prompt', () => {
    expect(getAuthErrorMessage({ code: 'user_already_exists', message: 'raw' })).toBe(
      'Email already registered. Please log in instead.',
    );
  });

  it('maps email_exists the same as user_already_exists', () => {
    expect(getAuthErrorMessage({ code: 'email_exists', message: 'raw' })).toBe(
      'Email already registered. Please log in instead.',
    );
  });

  it('maps weak_password to the password requirements', () => {
    expect(getAuthErrorMessage({ code: 'weak_password', message: 'raw' })).toContain('Password must be at least 8');
  });

  it('maps invalid_credentials to a generic incorrect-login message', () => {
    expect(getAuthErrorMessage({ code: 'invalid_credentials', message: 'raw' })).toBe(
      'Incorrect email or password.',
    );
  });

  it('maps over_request_rate_limit to a rate-limit message', () => {
    expect(getAuthErrorMessage({ code: 'over_request_rate_limit', message: 'raw' })).toBe(
      'Too many attempts. Please wait a few minutes before trying again.',
    );
  });

  it('maps over_email_send_rate_limit to an email-specific rate-limit message', () => {
    expect(getAuthErrorMessage({ code: 'over_email_send_rate_limit', message: 'raw' })).toBe(
      'Too many emails sent. Please wait before requesting another.',
    );
  });

  it('treats an HTTP 429 status as rate limited even without a matching code', () => {
    expect(getAuthErrorMessage({ status: 429, message: 'raw' })).toBe(
      'Too many attempts. Please wait a few minutes before trying again.',
    );
  });

  it('prefers the specific code message over the generic 429 message when both are present', () => {
    // A real over_email_send_rate_limit error carries status 429 *and* a
    // code — the code-specific message must win, not the generic one.
    expect(getAuthErrorMessage({ status: 429, code: 'over_email_send_rate_limit', message: 'raw' })).toBe(
      'Too many emails sent. Please wait before requesting another.',
    );
  });

  it('falls back to error.message for unknown codes', () => {
    expect(getAuthErrorMessage({ code: 'some_future_code', message: 'Something specific happened' })).toBe(
      'Something specific happened',
    );
  });

  it('falls back to a generic message when there is no code or message', () => {
    expect(getAuthErrorMessage({})).toBe('Authentication failed. Please try again.');
  });

  it('falls back to a generic message for non-object errors', () => {
    expect(getAuthErrorMessage('boom')).toBe('Authentication failed. Please try again.');
    expect(getAuthErrorMessage(null)).toBe('Authentication failed. Please try again.');
    expect(getAuthErrorMessage(undefined)).toBe('Authentication failed. Please try again.');
  });
});
