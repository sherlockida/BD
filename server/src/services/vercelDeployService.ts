import { config } from '../config.js';

// ── Types ──
export interface DeployProgress {
  step: 'packaging' | 'building' | 'uploading' | 'publishing' | 'live' | 'failed';
  progress: number; // 0–100
  message: string;
  url?: string;
}

interface VercelDeployment {
  id: string;
  url: string;
  readyState: 'INITIALIZING' | 'BUILDING' | 'UPLOADING' | 'READY' | 'ERROR';
  error?: { message: string };
}

interface VercelErrorResponse {
  error?: { message: string };
}

// ── Vercel API helpers ──
const VERCEL_API = 'https://api.vercel.com';

function vercelHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.deploy.vercelToken}`,
    'Content-Type': 'application/json',
  };
  return headers;
}

function vercelUrl(path: string): string {
  const url = `${VERCEL_API}${path}`;
  if (config.deploy.vercelTeamId) {
    return `${url}?teamId=${config.deploy.vercelTeamId}`;
  }
  return url;
}

/**
 * Check whether real Vercel deployment is available.
 */
export function vercelAvailable(): boolean {
  return !!config.deploy.vercelToken;
}

/**
 * Generate a local data-URI "deployment" URL for offline/demo use.
 * Returns a blob-like data URL that can be opened in the browser.
 */
function buildLocalBlobUrl(html: string): string {
  const base64 = Buffer.from(html, 'utf-8').toString('base64');
  return `data:text/html;base64,${base64}`;
}

/**
 * Create a deployment on Vercel with file content.
 * Returns the deployment ID or null on failure.
 */
async function createVercelDeployment(
  name: string,
  files: Array<{ file: string; data: string }>
): Promise<{ id: string; url: string } | null> {
  const body = {
    name: name.replace(/[^a-z0-9-]/gi, '-').toLowerCase().slice(0, 64),
    files,
    projectSettings: { framework: null as string | null },
  };

  const res = await fetch(vercelUrl('/v13/deployments'), {
    method: 'POST',
    headers: vercelHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as VercelErrorResponse;
    console.error('[Vercel] Deployment creation failed:', res.status, errBody.error?.message ?? 'unknown');
    return null;
  }

  const deployment = (await res.json()) as VercelDeployment;
  console.log(`[Vercel] Deployment created: ${deployment.id} — ${deployment.url}`);
  return { id: deployment.id, url: deployment.url };
}

/**
 * Poll Vercel deployment status until ready or error.
 */
async function pollDeployment(deploymentId: string): Promise<{ url: string } | null> {
  const maxAttempts = 60; // 2 minutes at 2s intervals
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000);

    const res = await fetch(vercelUrl(`/v13/deployments/${deploymentId}`), {
      headers: vercelHeaders(),
    });

    if (!res.ok) {
      console.warn(`[Vercel] Poll failed (${res.status}), retrying...`);
      continue;
    }

    const deployment = (await res.json()) as VercelDeployment;

    if (deployment.readyState === 'READY') {
      return { url: `https://${deployment.url}` };
    }
    if (deployment.readyState === 'ERROR') {
      console.error('[Vercel] Deployment error:', deployment.error?.message ?? 'unknown');
      return null;
    }
    // else: BUILDING / UPLOADING — keep polling
  }
  console.error('[Vercel] Deployment timed out');
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Public API ──

/**
 * Deploy an HTML artifact.
 *
 * - If Vercel Token is configured → real Vercel deployment with public URL
 * - Otherwise → local data URI fallback (user can still open in browser)
 *
 * @param artifactName — used as deployment name
 * @param htmlContent — the HTML to deploy
 * @param onProgress — callback for progress updates
 * @returns the final URL (vercel or data URI)
 */
export async function deployHtml(
  artifactName: string,
  htmlContent: string,
  onProgress: (p: DeployProgress) => void,
): Promise<string | null> {
  // Step 1: Packaging
  onProgress({ step: 'packaging', progress: 10, message: '正在打包静态资源...' });

  if (!vercelAvailable()) {
    // ── Fallback: local Blob URL ──
    onProgress({ step: 'building', progress: 40, message: 'Vercel Token 未配置，生成本地预览...' });
    await sleep(600);
    const localUrl = buildLocalBlobUrl(htmlContent);
    onProgress({ step: 'uploading', progress: 80, message: '正在生成预览链接...' });
    await sleep(400);
    onProgress({ step: 'live', progress: 100, message: '本地预览已就绪', url: localUrl });
    return localUrl;
  }

  // ── Real Vercel deployment ──

  // Step 2: Building
  onProgress({ step: 'building', progress: 30, message: '正在构建部署包...' });
  await sleep(300);

  const base64Content = Buffer.from(htmlContent, 'utf-8').toString('base64');
  const filename = artifactName.endsWith('.html') ? artifactName : `${artifactName}.html`;

  const deployment = await createVercelDeployment(artifactName, [
    { file: filename, data: base64Content },
  ]);

  if (!deployment) {
    onProgress({ step: 'failed', progress: 0, message: 'Vercel 部署创建失败' });
    return null;
  }

  // Step 3: Uploading
  onProgress({ step: 'uploading', progress: 60, message: '正在上传到 Vercel...' });
  await sleep(500);

  // Step 4: Publishing and polling
  onProgress({ step: 'publishing', progress: 80, message: '正在等待 Vercel 构建...' });

  const result = await pollDeployment(deployment.id);

  if (!result) {
    onProgress({ step: 'failed', progress: 0, message: 'Vercel 部署超时或失败' });
    return null;
  }

  // Step 5: Live
  onProgress({ step: 'live', progress: 100, message: '部署成功！', url: result.url });
  return result.url;
}
