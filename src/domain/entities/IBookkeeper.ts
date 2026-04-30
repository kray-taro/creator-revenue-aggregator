/**
 * Bookkeeper aggregate — the primary user of the system.
 * Password is never stored on this entity (hash lives in DB only).
 */
export interface IBookkeeper {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly createdAt: string; // ISO-8601
  readonly updatedAt: string; // ISO-8601
}
