# Repository Guidelines

## Project Structure & Module Organization

This repository is a small Node.js LAN file-transfer panel. The backend entry point is `server.js`; it uses Node core modules and proxies local rclone RC and aria2 RPC services. Static browser assets live in `public/`: `index.html` for markup, `app.js` for vanilla client-side behavior, and `styles.css` for layout and visual styling. `README.md` documents runtime configuration and user-facing behavior. There is currently no dedicated `test/` directory or build output directory.

## Build, Test, and Development Commands

- `npm start`: runs `node server.js` with default bind addresses and port.
- `npm run dev`: runs the panel with `PANEL_BIND=127.0.0.1,10.42.0.1` and `PANEL_PORT=5590`.
- `npm test`: not configured. Do not assume an automated test suite exists until one is added.

The project requires Node.js `>=20`. Local runtime also depends on accessible rclone RC credentials and aria2 configuration, normally under `~/.config/file-transfer/`.

## Coding Style & Naming Conventions

Use ES modules and modern Node APIs. Follow the existing JavaScript style: two-space indentation, semicolons, single quotes, `const` by default, and `async`/`await` for asynchronous work. Prefer small helper functions in `server.js` for shared request parsing, validation, and response handling. Use `camelCase` for JavaScript variables and functions. Use descriptive `kebab-case` CSS class names and keep shared colors or spacing values in CSS custom properties when they are reused.

## Testing Guidelines

No automated testing framework or coverage requirement is currently defined. For backend changes, manually run `npm start` or `npm run dev` and smoke test login, remote listing, file browsing, upload/download, and aria2 task controls. For UI changes, verify the panel at desktop and narrow mobile widths. If adding tests, prefer Node's built-in `node:test` runner and place files under `test/*.test.js`.

## Commit & Pull Request Guidelines

This checkout does not include Git history, so no repository-specific commit convention can be inferred. Use concise imperative commit messages such as `add upload size validation` or `fix aria2 task refresh`. Pull requests should describe the behavior change, list manual or automated verification performed, note configuration changes, and include screenshots for visible UI updates.

## Security & Configuration Tips

Do not commit local credentials, aria2 secrets, or machine-specific paths. Prefer environment variables such as `PANEL_USER`, `PANEL_PASS`, `RCLONE_CREDENTIALS`, `ARIA2_CONF`, `ARIA2_URL`, and `ARIA2_SECRET` for local overrides.
