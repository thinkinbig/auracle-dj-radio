export const REGISTER_PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,32}$/;

export const REGISTER_PASSWORD_HINT = "Use 8-32 characters with uppercase, lowercase, and a number.";

export function isStrongRegisterPassword(password: string): boolean {
  return REGISTER_PASSWORD_PATTERN.test(password);
}
