export interface IntegrationStatus {
  id: 'github' | 'railway' | 'cloudflare' | 'voice' | 'ollama' | 'anthropic';
  state: 'NOT_CONFIGURED' | 'CONFIGURED' | 'ERROR';
  configured: boolean;
  available: boolean;
  reason: string;
}

function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN || process.env.GITHUB_APP_ID);
}

function railwayConfigured(): boolean {
  return Boolean(process.env.RAILWAY_TOKEN || process.env.RAILWAY_API_TOKEN || process.env.RAILWAY_PROJECT_ID);
}

/** Configuration-only status. This never calls external services or exposes secrets. */
export function readIntegrationStatus(): IntegrationStatus[] {
  const ollamaConfigured = Boolean(process.env.OLLAMA_BASE_URL && process.env.OLLAMA_MODEL);
  const anthropicConfigured = Boolean(process.env.ANTHROPIC_API_KEY) && process.env.ANTHROPIC_FALLBACK_ENABLED !== 'false';
  return [
    { id: 'ollama', state: ollamaConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED', configured: ollamaConfigured, available: ollamaConfigured, reason: ollamaConfigured ? 'Configured locally; liveness is checked by the provider router.' : 'OLLAMA_BASE_URL/OLLAMA_MODEL not configured.' },
    { id: 'anthropic', state: anthropicConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED', configured: anthropicConfigured, available: anthropicConfigured, reason: anthropicConfigured ? 'Configured as an available fallback.' : 'Fallback disabled or key not configured.' },
    { id: 'github', state: githubConfigured() ? 'CONFIGURED' : 'NOT_CONFIGURED', configured: githubConfigured(), available: githubConfigured(), reason: githubConfigured() ? 'GitHub credential/configuration is present; use /api/control/github/status for live GitHub App status.' : 'No GitHub App credential has been configured for Mara.' },
    { id: 'railway', state: railwayConfigured() ? 'CONFIGURED' : 'NOT_CONFIGURED', configured: railwayConfigured(), available: railwayConfigured(), reason: railwayConfigured() ? 'Railway credential/configuration is present; use /api/control/railway/status for live status.' : 'No Railway API token is configured. Local CLI auth may still provide read-only status.' },
    { id: 'cloudflare', state: process.env.CLOUDFLARE_API_TOKEN ? 'CONFIGURED' : 'NOT_CONFIGURED', configured: Boolean(process.env.CLOUDFLARE_API_TOKEN), available: false, reason: process.env.CLOUDFLARE_API_TOKEN ? 'Credential configured; DNS/CDN operations still require explicit approval and no handler is registered in this build.' : 'No Cloudflare capability integration is configured.' },
    { id: 'voice', state: process.env.VOICE_PROVIDER ? 'CONFIGURED' : 'NOT_CONFIGURED', configured: Boolean(process.env.VOICE_PROVIDER), available: false, reason: process.env.VOICE_PROVIDER ? 'Provider configured; server-side voice integration is not implemented in this build.' : 'Browser-native voice layer is available when supported; no server-side STT/TTS provider is configured.' },
  ];
}
