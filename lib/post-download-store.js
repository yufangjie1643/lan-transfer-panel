import fsp from 'node:fs/promises';
import path from 'node:path';

export function postDownloadJobsStorePath(aria2Dir) {
  return path.join(aria2Dir || '.', '.lan-transfer-post-download-jobs.json');
}

export async function loadPostDownloadJobs(storePath) {
  let parsed;
  try {
    parsed = JSON.parse(await fsp.readFile(storePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }

  const jobs = new Map();
  for (const candidate of Array.isArray(parsed?.jobs) ? parsed.jobs : []) {
    const job = normalizePostDownloadJob(candidate);
    if (job) jobs.set(job.gid, job);
  }
  return jobs;
}

export async function savePostDownloadJobs(storePath, jobs) {
  await fsp.mkdir(path.dirname(storePath), { recursive: true });
  const payload = {
    version: 1,
    jobs: [...jobs.values()].map((job) => normalizePostDownloadJob(job)).filter(Boolean),
  };
  await fsp.writeFile(storePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function normalizePostDownloadJob(candidate) {
  if (!candidate || candidate.type !== 'extract-archive') return null;
  const gid = String(candidate.gid || '');
  const archiveFileName = String(candidate.archiveFileName || '');
  if (!gid || !archiveFileName) return null;
  const status = candidate.status === 'error' ? 'error' : 'waiting';
  return {
    type: 'extract-archive',
    gid,
    archiveFileName,
    remoteArchivePath: candidate.remoteArchivePath ? String(candidate.remoteArchivePath) : '',
    extractDir: candidate.extractDir ? String(candidate.extractDir) : null,
    createdAt: Number(candidate.createdAt || Date.now()),
    status,
    ...(status === 'error' && candidate.errorMessage ? { errorMessage: String(candidate.errorMessage) } : {}),
  };
}
