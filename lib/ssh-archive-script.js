export function buildSshArchiveScript({
  parentPath,
  folderName,
  remotePath,
  listPath,
  compression,
  files,
}) {
  const tarFlags = compression === 'gzip' ? '-czf' : '-cf';
  const archiveEntries = archiveEntryPaths(folderName, files);
  const listBase64 = Buffer.from(`${archiveEntries.join('\0')}\0`, 'utf8').toString('base64');
  return [
    'set -eu',
    `rm -f ${shellQuote(remotePath)}`,
    `rm -f ${shellQuote(listPath)}`,
    [
      'python3',
      '-c',
      shellQuote(
        'import base64,sys; open(sys.argv[1],"wb").write(base64.b64decode(sys.stdin.read().encode("ascii")))',
      ),
      shellQuote(listPath),
      "<<'ARCHIVE_LIST_BASE64'",
    ].join(' '),
    wrapBase64(listBase64),
    'ARCHIVE_LIST_BASE64',
    [
      'tar',
      '-C',
      shellQuote(parentPath),
      tarFlags,
      shellQuote(remotePath),
      '--dereference',
      '--hard-dereference',
      '--null',
      '-T',
      shellQuote(listPath),
    ].join(' '),
    `rm -f ${shellQuote(listPath)}`,
    `stat -c '%s' ${shellQuote(remotePath)}`,
  ].join('\n');
}

export function archiveEntryPaths(folderName, files) {
  return files.map((file) => {
    const relPath = normalizeRemotePath(file.RelPath || file.Path || file.Name || '');
    if (!relPath || relPath.startsWith('../') || relPath === '..') {
      throw Object.assign(new Error('打包文件路径不合法'), { statusCode: 400 });
    }
    return joinRemotePath(folderName, relPath);
  });
}

function wrapBase64(value) {
  return String(value).replace(/.{1,76}/g, '$&\n').trimEnd();
}

function joinRemotePath(parentPath, name) {
  return normalizeRemotePath([parentPath, name].filter(Boolean).join('/'));
}

function normalizeRemotePath(input) {
  return String(input || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/');
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}
