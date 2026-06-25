import type { SaveTasteRequest, TasteProfileResponse } from '@auracle/shared';
import { jsonAuthHeaders } from '@/features/marketing/authApi';

/** Entity rejected by PUT validation (mirrors the S2 400 body). */
export interface InvalidEntity {
  entityType: string;
  entityId: string;
}

export class TasteApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly invalid?: InvalidEntity[],
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; invalid?: InvalidEntity[] } | null;
    throw new TasteApiError(body?.error ?? 'Request failed', res.status, body?.invalid);
  }
  return (await res.json()) as T;
}

/** GET /users/me/taste — current profile resolved against the live catalog. */
export async function fetchTaste(): Promise<TasteProfileResponse> {
  return parse<TasteProfileResponse>(await fetch('/users/me/taste', { headers: jsonAuthHeaders() }));
}

/** PUT /users/me/taste — replace the profile; throws TasteApiError on 400. */
export async function saveTaste(request: SaveTasteRequest): Promise<TasteProfileResponse> {
  return parse<TasteProfileResponse>(
    await fetch('/users/me/taste', {
      method: 'PUT',
      headers: jsonAuthHeaders(),
      body: JSON.stringify(request),
    }),
  );
}

/** Human-readable message for a save failure, including invalid entities. */
export function describeSaveError(err: unknown): string {
  if (err instanceof TasteApiError) {
    if (err.invalid?.length) {
      return `${err.message}: ${err.invalid.map((e) => `${e.entityType} "${e.entityId}"`).join(', ')}`;
    }
    return err.message;
  }
  return 'Could not save your taste. Check your connection and try again.';
}
