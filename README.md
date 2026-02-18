# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Development

- Frontend (LAN enabled): `yarn dev`
- Upload server (HTTP): `yarn server`
- Upload server (dev watch): `yarn server:dev`
- Upload server (HTTPS): `yarn server:https`

`yarn dev` now starts Vite with `--host`, so devices on the same LAN can access the app via `http://<your-local-ip>:5173/`.

## Backend HTTPS

The upload server supports HTTPS via environment variables:

- Enable HTTPS: `HTTPS=true`
- Key path: `HTTPS_KEY_PATH` (default: `server/certs/localhost-key.pem`)
- Cert path: `HTTPS_CERT_PATH` (default: `server/certs/localhost-cert.pem`)

Example:

```bash
HTTPS=true HTTPS_KEY_PATH=server/certs/localhost-key.pem HTTPS_CERT_PATH=server/certs/localhost-cert.pem yarn server
```

Or use shortcut script:

```bash
yarn server:https
```

If frontend proxy should target HTTPS backend in development, start dev with:

```bash
VITE_BACKEND_TARGET=https://localhost:3001 yarn dev
```
