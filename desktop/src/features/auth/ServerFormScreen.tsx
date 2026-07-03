import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectionProfile } from './connectionProfiles';

export interface ServerFormLabels {
  titleAdd: string;
  titleEdit: string;
  label: string;
  host: string;
  port: string;
  username: string;
  authMethod: string;
  passwordAuth: string;
  keyAuth: string;
  password: string;
  privateKeyPath: string;
  passphrase: string;
  advanced: string;
  aria2Rpc: string;
  aria2Secret: string;
  remoteTempDir: string;
  remoteDownloadService: string;
  downloadServiceAuto: string;
  downloadServiceRclone: string;
  downloadServiceHttp: string;
  cancel: string;
  save: string;
  saveAndConnect: string;
  validation: {
    labelRequired: string;
    hostRequired: string;
    portInvalid: string;
    usernameRequired: string;
    passwordRequired: string;
    privateKeyRequired: string;
  };
}

interface FormErrors {
  label?: string;
  host?: string;
  port?: string;
  username?: string;
  credential?: string;
}

interface ServerFormScreenProps {
  labels: ServerFormLabels;
  profile?: ConnectionProfile;
  error?: string | null;
  isSaving?: boolean;
  onCancel: () => void;
  onSave: (profile: ConnectionProfile) => void;
  onSaveAndConnect?: (profile: ConnectionProfile) => void;
}

function emptyProfile(): ConnectionProfile {
  return {
    id: `custom-${Date.now()}`,
    label: '',
    host: '',
    port: 22,
    username: '',
    authMethod: 'password',
    password: '',
    privateKeyPath: '',
    passphrase: '',
    saveCredential: true
  };
}

export function ServerFormScreen({
  labels,
  profile,
  error,
  isSaving,
  onCancel,
  onSave,
  onSaveAndConnect
}: ServerFormScreenProps) {
  const isEdit = Boolean(profile);
  const initial = useMemo(() => profile ?? emptyProfile(), [profile]);
  const [label, setLabel] = useState(initial.label);
  const [host, setHost] = useState(initial.host ?? '');
  const [port, setPort] = useState(String(initial.port ?? 22));
  const [username, setUsername] = useState(initial.username);
  const [authMethod, setAuthMethod] = useState<ConnectionProfile['authMethod']>(
    initial.authMethod
  );
  const [password, setPassword] = useState(initial.password ?? '');
  const [privateKeyPath, setPrivateKeyPath] = useState(initial.privateKeyPath ?? '');
  const [passphrase, setPassphrase] = useState(initial.passphrase ?? '');
  const [aria2Rpc, setAria2Rpc] = useState('http://127.0.0.1:6800/jsonrpc');
  const [aria2Secret, setAria2Secret] = useState('');
  const [remoteTempDir, setRemoteTempDir] = useState('/tmp/lan-transfer');
  const [remoteDownloadService, setRemoteDownloadService] = useState('auto');
  const [errors, setErrors] = useState<FormErrors>({});

  const labelRef = useRef<HTMLInputElement | null>(null);
  const hostRef = useRef<HTMLInputElement | null>(null);
  const portRef = useRef<HTMLInputElement | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const privateKeyPathRef = useRef<HTMLInputElement | null>(null);
  const prevErrorsRef = useRef<string[]>([]);

  useEffect(() => {
    setLabel(initial.label);
    setHost(initial.host ?? '');
    setPort(String(initial.port ?? 22));
    setUsername(initial.username);
    setAuthMethod(initial.authMethod ?? 'password');
    setPassword(initial.password ?? '');
    setPrivateKeyPath(initial.privateKeyPath ?? '');
    setPassphrase(initial.passphrase ?? '');
    setErrors({});
  }, [initial]);

  useEffect(() => {
    const errorKeys = Object.keys(errors);
    const prevKeys = prevErrorsRef.current;
    const keysChanged =
      errorKeys.length !== prevKeys.length ||
      errorKeys.some((key, index) => key !== prevKeys[index]);
    prevErrorsRef.current = errorKeys;
    if (!errorKeys.length || !keysChanged) return;
    const firstField: keyof FormErrors = errors.label
      ? 'label'
      : errors.host
        ? 'host'
        : errors.port
          ? 'port'
          : errors.username
            ? 'username'
            : 'credential';
    const refMap: Record<keyof FormErrors, React.RefObject<HTMLInputElement | null>> = {
      label: labelRef,
      host: hostRef,
      port: portRef,
      username: usernameRef,
      credential: authMethod === 'password' ? passwordRef : privateKeyPathRef
    };
    refMap[firstField].current?.focus();
  }, [errors, authMethod]);

  function buildProfile(): ConnectionProfile {
    return {
      id: profile?.id ?? `custom-${Date.now()}`,
      label: label.trim(),
      host: host.trim(),
      port: Number(port) || 22,
      username: username.trim(),
      authMethod,
      password: authMethod === 'password' ? password : '',
      privateKeyPath: authMethod === 'key' ? privateKeyPath : '',
      passphrase: authMethod === 'key' ? passphrase : '',
      saveCredential: true
    };
  }

  function validate(): FormErrors | null {
    const next: FormErrors = {};
    if (!label.trim()) next.label = labels.validation.labelRequired;
    if (!host.trim()) next.host = labels.validation.hostRequired;
    const portNum = Number(port);
    if (!port || portNum < 1 || portNum > 65535) next.port = labels.validation.portInvalid;
    if (!username.trim()) next.username = labels.validation.usernameRequired;
    if (authMethod === 'password' && !password) {
      next.credential = labels.validation.passwordRequired;
    }
    if (authMethod === 'key' && !privateKeyPath.trim()) {
      next.credential = labels.validation.privateKeyRequired;
    }
    return Object.keys(next).length ? next : null;
  }

  function submitForm(andConnect: boolean) {
    const validationErrors = validate();
    if (validationErrors) {
      setErrors(validationErrors);
      return;
    }
    const nextProfile = buildProfile();
    if (andConnect && onSaveAndConnect) onSaveAndConnect(nextProfile);
    else onSave(nextProfile);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitForm(false);
  }

  function handleSaveAndConnectClick() {
    submitForm(true);
  }

  return (
    <section className="server-form-panel" aria-label={isEdit ? labels.titleEdit : labels.titleAdd}>
      <div className="server-form-heading">
        <h2>{isEdit ? labels.titleEdit : labels.titleAdd}</h2>
      </div>
      <form className="server-form" onSubmit={handleSubmit}>
        <label>
          {labels.label}
          <input
            ref={labelRef}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            aria-invalid={errors.label ? 'true' : 'false'}
          />
          {errors.label ? <span className="field-error">{errors.label}</span> : null}
        </label>
        <div className="form-row">
          <label>
            {labels.host}
            <input
              ref={hostRef}
              value={host}
              onChange={(event) => setHost(event.target.value)}
              aria-invalid={errors.host ? 'true' : 'false'}
            />
            {errors.host ? <span className="field-error">{errors.host}</span> : null}
          </label>
          <label>
            {labels.port}
            <input
              ref={portRef}
              type="number"
              min="1"
              max="65535"
              value={port}
              onChange={(event) => setPort(event.target.value)}
              aria-invalid={errors.port ? 'true' : 'false'}
            />
            {errors.port ? <span className="field-error">{errors.port}</span> : null}
          </label>
        </div>
        <label>
          {labels.username}
          <input
            ref={usernameRef}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            aria-invalid={errors.username ? 'true' : 'false'}
          />
          {errors.username ? <span className="field-error">{errors.username}</span> : null}
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
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={errors.credential ? 'true' : 'false'}
            />
            {errors.credential ? <span className="field-error">{errors.credential}</span> : null}
          </label>
        ) : (
          <>
            <label>
              {labels.privateKeyPath}
              <input
                ref={privateKeyPathRef}
                value={privateKeyPath}
                onChange={(event) => setPrivateKeyPath(event.target.value)}
                aria-invalid={errors.credential ? 'true' : 'false'}
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
            {errors.credential ? <span className="field-error">{errors.credential}</span> : null}
          </>
        )}
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
              <option value="auto">{labels.downloadServiceAuto}</option>
              <option value="rclone">{labels.downloadServiceRclone}</option>
              <option value="http">{labels.downloadServiceHttp}</option>
            </select>
          </label>
        </details>
        <div className="form-actions">
          <button type="button" onClick={onCancel} disabled={isSaving}>
            {labels.cancel}
          </button>
          <button type="submit" disabled={isSaving}>
            {labels.save}
          </button>
          {onSaveAndConnect ? (
            <button
              type="button"
              className="primary"
              disabled={isSaving}
              onClick={handleSaveAndConnectClick}
            >
              {labels.saveAndConnect}
            </button>
          ) : null}
        </div>
        {error ? (
          <p className="connection-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
