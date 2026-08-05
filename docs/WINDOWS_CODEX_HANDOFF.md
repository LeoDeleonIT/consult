# Trinity Consult — Windows Codex Handoff

Use this handoff after copying the complete Trinity Consult project folder to the dedicated office PC, preferably at `C:\TrinityConsult`.

## Before opening Codex on the PC

1. Copy the entire project folder, including hidden files, `package-lock.json`, `migrations`, `docs`, and `.openai`.
2. Do **not** copy `.env.local`, API keys, browser profiles, test recordings, `.wrangler` state, or `node_modules` from the Mac.
3. Open `C:\TrinityConsult` as the workspace in Codex on the Windows PC.
4. Paste the handoff prompt below into the new Codex task.

## Paste this prompt into Codex on the Windows PC

> Continue the Trinity Consult office pilot from this project folder. The immediate goal is a safe, same-computer Windows pilot at `http://localhost:3003` using only a dummy Open Dental patient and synthetic consultation content. Do not use real patient information and do not expose the app to the LAN or internet yet.
>
> First, read `README.md`, `PILOT_READINESS.md`, `docs/OPEN_DENTAL_BRIDGE_SETUP.md`, `.env.example`, `.openai/hosting.json`, and the current package scripts. Inspect the Windows version, available disk space, Node/npm versions, and whether this computer hosts Open Dental, Active Directory, SQL, file sharing, or other critical services. Preserve all existing user data and do not reset or delete anything.
>
> Current application state:
>
> - The complete P0 coordinator-to-manager workflow has passed locally.
> - There are 17 verified office accounts using `@trinitydentalcenters.com`.
> - The former Aldine location is named Eastex, with `eastex@trinitydentalcenters.com`.
> - Central managers are `rlopez@trinitydentalcenters.com`, `zain@trinitydentalcenters.com`, and `leo@odysseysolutions.co`.
> - Office consultations are assigned server-side to the signed-in office, and managers can filter across offices.
> - The Open Dental Custom Bridge accepts `odPatNum=[PatNum]` and performs a server-side Patients GET.
> - The current Open Dental code supports one office customer key. Multi-office customer-key selection is not implemented yet.
> - The current D1/R2 local bindings are development storage. They are acceptable for this dummy-data pilot only and must not be represented as production storage.
>
> Work in this order:
>
> 1. Report whether the PC is safe to use as a dedicated pilot host. Stop and ask before proceeding if it is a domain controller or critical Open Dental/database server.
> 2. Ensure Node.js 22.13 or newer and npm are available. Ask before installing or changing system software.
> 3. Install project dependencies from the lockfile.
> 4. Create `.env.local` from `.env.example`. Generate a new random `AUTH_SECRET`. Never display, log, copy, or transmit secrets. Ask the user to enter the OpenAI key, Open Dental developer key, and the pilot office customer key directly on the PC.
> 5. Keep `ALLOW_FIXTURE_PROCESSING=false` for normal startup. Use fixture mode only in the isolated automated test command.
> 6. Apply the local schema and seed data, then run lint, type checking, unit tests, the production build, and the isolated browser workflow.
> 7. Start the app on `localhost:3003`, confirm it survives a clean restart, and leave it running only for the local pilot.
> 8. Test the Eastex coordinator login and a central manager login using fake data.
> 9. In Open Dental, use a dummy patient and configure a Custom Bridge named `Start Consult` to launch Chrome with `http://localhost:3003/coordinator/consultations/new?odPatNum=[PatNum]`.
> 10. Verify that the dummy patient loads, a short synthetic recording processes, the coordinator can submit it, and the manager sees it under Eastex.
> 11. Document the exact local data location and create a tested backup-and-restore procedure before leaving the PC unattended.
>
> Security boundaries:
>
> - Do not open Windows Firewall ports, configure public access, or bind the app to a LAN address during this first phase.
> - Do not paste passwords or API keys into Codex chat.
> - Do not use real patient names, recordings, treatment details, or identifiers.
> - Do not claim HIPAA compliance or production readiness.
> - Do not weaken browser, certificate, Windows, or antivirus security.
> - Back up before migrations or storage changes.
>
> Completion means the dummy Open Dental patient-to-manager workflow passes on the Windows PC after a reboot, with no secrets exposed and no non-local application port open. Then provide a short readiness report and list what remains before LAN/iPad access or real patient use.

## First-pilot Open Dental requirements

- One Developer API Key.
- One Customer API Key for the pilot office.
- Patients GET permission.
- API enabled in Open Dental.
- eConnector online.
- One dummy patient selected for the bridge test.

Keys must be entered locally on the Windows PC and must not be included in this file.

## Phase-two handoff

After the same-computer pilot passes, create a separate task for internal HTTPS, VPN/LAN access, durable local production storage, automatic backups and retention, strong account provisioning, and per-office Open Dental customer-key selection.
