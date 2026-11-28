// GitHub 内容 API 备份：Token 只从本机 localStorage 读取，不进入备份 JSON。

const TOKEN_KEY = 'github.backup.token';

export function loadToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function saveToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
}

export async function buildBackupPayload(db) {
  const tables = db.tables.slice();
  const data = {};
  for (const table of tables) data[table.name] = await table.toArray();
  return { version: 2, exportedAt: Date.now(), tables: tables.map((table) => table.name), data };
}

export async function uploadBackup({ token, repo, branch = 'main', path, payload }) {
  if (!token || !repo || !path) throw new Error('缺少 GitHub 备份配置');
  if (!/^[^/]+\/[^/]+$/.test(repo)) throw new Error('仓库格式应为 用户名/仓库名');
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));
  const url = `https://api.github.com/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
  const existing = await fetch(url, { headers });
  const old = existing.ok ? await existing.json() : null;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `backup: ${new Date().toISOString()}`,
      content,
      branch,
      ...(old?.sha ? { sha: old.sha } : {}),
    }),
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  return { uploadedAt: Date.now() };
}
