/**
 * One minimum for every place a password is chosen. The reset flow required
 * 10 characters while the change-password flow required 8, so the same user
 * met a different rule depending on which door they came through — and the
 * weaker door set the real floor.
 *
 * Kept dependency-free so client forms can import it for their `minLength`
 * without pulling server code into the browser bundle. The server schemas
 * are still the authority; the attribute is only a courtesy to the user.
 */
export const MIN_PASSWORD_LENGTH = 10;
