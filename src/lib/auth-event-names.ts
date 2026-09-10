/**
 * The fixed vocabulary from the design spec §3.3. Typing `recordAuthEvent`
 * to this union is what stops a typo in a caller from silently zeroing the
 * login rate limiter, which counts rows matching one of these exact strings.
 */
export const AUTH_EVENTS = {
  LOGIN_PASSWORD_OK: 'login.password_ok',
  LOGIN_PASSWORD_FAIL: 'login.password_fail',
  LOGIN_USER_INACTIVE: 'login.user_inactive',
  LOGIN_OTP_OK: 'login.otp_ok',
  LOGIN_OTP_FAIL: 'login.otp_fail',
  LOGIN_OTP_EXHAUSTED: 'login.otp_exhausted',
  LOGIN_CHALLENGE_EXPIRED: 'login.challenge_expired',
  WA_SEND_OK: 'wa.send_ok',
  WA_SEND_FAIL: 'wa.send_fail',
  TOTP_ENROLLED: 'totp.enrolled',
  TOTP_DISABLED: 'totp.disabled',
  PASSWORD_RESET_REQUESTED: 'password.reset_requested',
  PASSWORD_RESET_OK: 'password.reset_ok',
  PASSWORD_CHANGED: 'password.changed',
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_DEACTIVATED: 'user.deactivated',
  RECOVERY_SSH_USED: 'recovery.ssh_used',
} as const;

export type AuthEventName = (typeof AUTH_EVENTS)[keyof typeof AUTH_EVENTS];
