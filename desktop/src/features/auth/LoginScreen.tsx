import { FormEvent, useEffect, useState } from 'react';
import type { ConnectionProfile } from './connectionProfiles';

export interface LoginLabels {
  title: string;
  subtitle: string;
  profile: string;
  profileName: string;
  host: string;
  port: string;
  username: string;
  authMethod: string;
  password: string;
  passwordAuth: string;
  keyAuth: string;
  privateKeyPath: string;
  passphrase: string;
  saveCredential: string;
  saveProfile: string;
  deleteProfile: string;
  advanced: string;
  aria2Rpc: string;
  aria2Secret: string;
  remoteTempDir: string;
  remoteDownloadService: string;
  connect: string;
  connecting: string;
}

interface LoginScreenProps {
  labels: LoginLabels;
  profiles: ConnectionProfile[];
  isConnecting: boolean;
  error: string | null;
  onSubmit: (credentials: ConnectionProfile) => void;
  onSaveProfile: (profile: ConnectionProfile) => void;
  onDeleteProfile: (id: string) => void;
}

export function LoginScreen({
  labels,
  profiles,
  isConnecting,
  error,
  onSubmit,
  onSaveProfile,
  onDeleteProfile
}: LoginScreenProps) {
  const firstProfile = profiles[0] ?? {
    id: 'custom',
    label: 'Custom',
    host: '',
    port: 22,
    username: '',
    authMethod: 'password' as const,
    password: '',
    saveCredential: false
  };
  const [selectedProfileId, setSelectedProfileId] = useState(firstProfile.id);
  const [label, setLabel] = useState(firstProfile.label);
  const [host, setHost] = useState(firstProfile.host);
  const [port, setPort] = useState(String(firstProfile.port || 22));
  const [username, setUsername] = useState(firstProfile.username);
  const [authMethod, setAuthMethod] = useState<ConnectionProfile['authMethod']>(
    firstProfile.authMethod
  );
  const [password, setPassword] = useState(firstProfile.password || '');
  const [privateKeyPath, setPrivateKeyPath] = useState(firstProfile.privateKeyPath || '');
  const [passphrase, setPassphrase] = useState(firstProfile.passphrase || '');
  const [saveCredential, setSaveCredential] = useState(firstProfile.saveCredential);
  const [aria2Rpc, setAria2Rpc] = useState('http://127.0.0.1:6800/jsonrpc');
  const [aria2Secret, setAria2Secret] = useState('');
  const [remoteTempDir, setRemoteTempDir] = useState('/tmp/lan-transfer');
  const [remoteDownloadService, setRemoteDownloadService] = useState('auto');

  useEffect(() => {
    const selectedProfile =
      profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0];
    if (!selectedProfile) return;
    applyProfile(selectedProfile);
  }, [profiles, selectedProfileId]);

  function handleProfileChange(profileId: string) {
    const nextProfile = profiles.find((profile) => profile.id === profileId);
    if (!nextProfile) return;
    applyProfile(nextProfile);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(currentProfile());
  }

  function applyProfile(profile: ConnectionProfile) {
    setSelectedProfileId(profile.id);
    setLabel(profile.label);
    setHost(profile.host);
    setPort(String(profile.port || 22));
    setUsername(profile.username);
    setAuthMethod(profile.authMethod);
    setPassword(profile.password || '');
    setPrivateKeyPath(profile.privateKeyPath || '');
    setPassphrase(profile.passphrase || '');
    setSaveCredential(profile.saveCredential);
  }

  function currentProfile(): ConnectionProfile {
    return {
      id: selectedProfileId,
      label,
      host,
      port: Number(port || 22),
      username,
      authMethod,
      password,
      privateKeyPath,
      passphrase,
      saveCredential
    };
  }

  const canConnect =
    host.trim() &&
    Number(port) > 0 &&
    username.trim() &&
    (authMethod === 'password' ? password : privateKeyPath.trim());

  return (
    <section className="login-panel" aria-label={labels.title}>
      <div className="login-heading">
        <strong>{labels.title}</strong>
        <span>{labels.subtitle}</span>
      </div>
      <form className="login-form" onSubmit={handleSubmit}>
        <label>
          {labels.profile}
          <select
            value={selectedProfileId}
            onChange={(event) => handleProfileChange(event.target.value)}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {labels.profileName}
          <input value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label>
          {labels.host}
          <input value={host} onChange={(event) => setHost(event.target.value)} />
        </label>
        <label>
          {labels.port}
          <input
            type="number"
            min="1"
            max="65535"
            value={port}
            onChange={(event) => setPort(event.target.value)}
          />
        </label>
        <label>
          {labels.username}
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <fieldset className="auth-method-group">
          <legend>{labels.authMethod}</legend>
          <label>
            <input
              type="radio"
              name="auth-method"
              value="password"
              checked={authMethod === 'password'}
              onChange={() => setAuthMethod('password')}
            />
            {labels.passwordAuth}
          </label>
          <label>
            <input
              type="radio"
              name="auth-method"
              value="key"
              checked={authMethod === 'key'}
              onChange={() => setAuthMethod('key')}
            />
            {labels.keyAuth}
          </label>
        </fieldset>
        {authMethod === 'password' ? (
          <label>
            {labels.password}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        ) : (
          <>
            <label>
              {labels.privateKeyPath}
              <input
                value={privateKeyPath}
                onChange={(event) => setPrivateKeyPath(event.target.value)}
              />
            </label>
            <label>
              {labels.passphrase}
              <input
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
              />
            </label>
          </>
        )}
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={saveCredential}
            onChange={(event) => setSaveCredential(event.target.checked)}
          />
          {labels.saveCredential}
        </label>
        <div className="profile-actions">
          <button type="button" onClick={() => onSaveProfile(currentProfile())}>
            {labels.saveProfile}
          </button>
          <button
            type="button"
            onClick={() => onDeleteProfile(selectedProfileId)}
            disabled={selectedProfileId === 'server-10-42-0-1' || selectedProfileId === 'custom'}
          >
            {labels.deleteProfile}
          </button>
        </div>
        <details className="advanced-settings">
          <summary>{labels.advanced}</summary>
          <label>
            {labels.aria2Rpc}
            <input value={aria2Rpc} onChange={(event) => setAria2Rpc(event.target.value)} />
          </label>
          <label>
            {labels.aria2Secret}
            <input
              type="password"
              value={aria2Secret}
              onChange={(event) => setAria2Secret(event.target.value)}
            />
          </label>
          <label>
            {labels.remoteTempDir}
            <input value={remoteTempDir} onChange={(event) => setRemoteTempDir(event.target.value)} />
          </label>
          <label>
            {labels.remoteDownloadService}
            <select
              value={remoteDownloadService}
              onChange={(event) => setRemoteDownloadService(event.target.value)}
            >
              <option value="auto">自动</option>
              <option value="rclone">rclone serve</option>
              <option value="http">自定义 HTTP</option>
            </select>
          </label>
        </details>
        <button type="submit" disabled={!canConnect || isConnecting}>
          {isConnecting ? labels.connecting : labels.connect}
        </button>
      </form>
      {error ? (
        <p className="connection-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
