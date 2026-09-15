import { readRailwayToken } from './credentials.js';

const RAILWAY_GRAPHQL_URL = 'https://backboard.railway.app/graphql/v2';

export class RailwayApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RailwayApiError';
    this.code = code;
  }
}

export async function railwayGraphQL<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const token = await readRailwayToken();
  if (!token) throw new RailwayApiError('railway_token_missing', 'Railway API token is not configured.');
  const response = await fetch(RAILWAY_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json().catch(() => ({})) as { data?: T; errors?: Array<{ message?: string }> };
  if (!response.ok || body.errors?.length) {
    throw new RailwayApiError('railway_api_error', body.errors?.[0]?.message ?? `Railway API returned ${response.status}`);
  }
  if (!body.data) throw new RailwayApiError('railway_api_empty', 'Railway API returned no data.');
  return body.data;
}

export async function verifyRailwayApiAuthentication(): Promise<{ ok: boolean; account: string | null }> {
  const data = await railwayGraphQL<{ me?: { name?: string | null; email?: string | null } }>('query { me { name email } }');
  return { ok: Boolean(data.me), account: data.me?.email ?? data.me?.name ?? null };
}