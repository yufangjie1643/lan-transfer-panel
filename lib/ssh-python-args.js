export function encodeSshPythonArg(value) {
  return Buffer.from(String(value), 'utf8').toString('base64');
}

export function encodeSshRemotePath(remotePath) {
  return encodeSshPythonArg(remotePath || '.');
}
