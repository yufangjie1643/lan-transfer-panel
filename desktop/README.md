# LAN Transfer Desktop

Windows desktop client for the LAN transfer panel. The app uses Tauri v2, React, TypeScript, and Rust, and talks to the existing Node.js backend over HTTP.

## Development

Start the backend from the repository root:

```powershell
npm start
```

Start the desktop app:

```powershell
npm run desktop:dev
```

The default backend URL is `http://localhost:5590`.

## Verification

```powershell
npm run desktop:test
cargo check --manifest-path desktop/src-tauri/Cargo.toml
```
