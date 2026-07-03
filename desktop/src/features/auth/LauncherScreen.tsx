import { useState } from 'react';
import type { ConnectionProfile } from './connectionProfiles';

export interface LauncherLabels {
  title: string;
  emptyTitle: string;
  emptySubtitle: string;
  addServer: string;
  connect: string;
  connecting: string;
  edit: string;
  delete: string;
  confirmDelete: string;
}

interface LauncherScreenProps {
  labels: LauncherLabels;
  profiles: ConnectionProfile[];
  connectingId?: string | null;
  errors?: Record<string, string>;
  onConnect: (profile: ConnectionProfile) => void;
  onEdit: (profile: ConnectionProfile) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

export function LauncherScreen({
  labels,
  profiles,
  connectingId,
  errors,
  onConnect,
  onEdit,
  onDelete,
  onAdd
}: LauncherScreenProps) {
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  return (
    <section className="launcher-panel" aria-label={labels.title}>
      <header className="launcher-header">
        <h2>{labels.title}</h2>
        {profiles.length > 0 ? (
          <button type="button" className="mock-button primary" onClick={onAdd}>
            {labels.addServer}
          </button>
        ) : null}
      </header>
      {profiles.length === 0 ? (
        <div className="launcher-empty">
          <strong>{labels.emptyTitle}</strong>
          <p>{labels.emptySubtitle}</p>
          <button type="button" className="mock-button primary" onClick={onAdd}>
            {labels.addServer}
          </button>
        </div>
      ) : (
        <ul className="server-cards">
          {profiles.map((profile) => {
            const isConnecting = connectingId === profile.id;
            const error = errors?.[profile.id];
            const isConfirmingDelete = confirmingDeleteId === profile.id;
            return (
              <li key={profile.id} className="server-card">
                <div className="server-card-body">
                  <h3>{profile.label}</h3>
                  <p className="server-card-host">{`${profile.host}:${profile.port}`}</p>
                  <p className="server-card-user">{profile.username}</p>
                  {error ? <p className="server-card-error">{error}</p> : null}
                </div>
                <div className="server-card-actions">
                  <button
                    type="button"
                    className="mock-button primary"
                    disabled={isConnecting}
                    onClick={() => onConnect(profile)}
                  >
                    {isConnecting ? labels.connecting : labels.connect}
                  </button>
                  <button type="button" className="link-button" onClick={() => onEdit(profile)}>
                    {labels.edit}
                  </button>
                  {isConfirmingDelete ? (
                    <button
                      type="button"
                      className="link-button danger"
                      onClick={() => {
                        onDelete(profile.id);
                        setConfirmingDeleteId(null);
                      }}
                    >
                      {labels.confirmDelete}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="link-button danger"
                      onClick={() => setConfirmingDeleteId(profile.id)}
                    >
                      {labels.delete}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
