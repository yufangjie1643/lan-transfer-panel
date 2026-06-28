import { FormEvent, useEffect, useState } from 'react';
import type { ConnectionProfile } from './connectionProfiles';

export interface LoginLabels {
  title: string;
  subtitle: string;
  profile: string;
  backendUrl: string;
  username: string;
  password: string;
  connect: string;
  connecting: string;
}

interface LoginScreenProps {
  labels: LoginLabels;
  profiles: ConnectionProfile[];
  isConnecting: boolean;
  error: string | null;
  onSubmit: (credentials: { backendUrl: string; username: string; password: string }) => void;
}

export function LoginScreen({
  labels,
  profiles,
  isConnecting,
  error,
  onSubmit
}: LoginScreenProps) {
  const firstProfile = profiles[0] ?? {
    id: 'custom',
    label: 'Custom',
    backendUrl: '',
    username: '',
    password: ''
  };
  const [selectedProfileId, setSelectedProfileId] = useState(firstProfile.id);
  const [backendUrl, setBackendUrl] = useState(firstProfile.backendUrl);
  const [username, setUsername] = useState(firstProfile.username);
  const [password, setPassword] = useState(firstProfile.password);

  useEffect(() => {
    const selectedProfile =
      profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0];
    if (!selectedProfile) return;
    setSelectedProfileId(selectedProfile.id);
    setBackendUrl(selectedProfile.backendUrl);
    setUsername(selectedProfile.username);
    setPassword(selectedProfile.password);
  }, [profiles, selectedProfileId]);

  function handleProfileChange(profileId: string) {
    const nextProfile = profiles.find((profile) => profile.id === profileId);
    if (!nextProfile) return;
    setSelectedProfileId(nextProfile.id);
    setBackendUrl(nextProfile.backendUrl);
    setUsername(nextProfile.username);
    setPassword(nextProfile.password);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ backendUrl, username, password });
  }

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
          {labels.backendUrl}
          <input value={backendUrl} onChange={(event) => setBackendUrl(event.target.value)} />
        </label>
        <label>
          {labels.username}
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          {labels.password}
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" disabled={!backendUrl || !username || !password || isConnecting}>
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
