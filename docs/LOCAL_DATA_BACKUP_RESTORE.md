# Local Data Backup and Restore

This procedure is for the same-computer dummy-data Windows pilot only. It backs up local development data, not production storage.

## Local data location

- Local D1 and R2 emulator root: `C:\Users\test\Documents\Consult\.wrangler\state\v3`
- D1 SQLite emulator data: `C:\Users\test\Documents\Consult\.wrangler\state\v3\d1`
- R2 audio emulator data: `C:\Users\test\Documents\Consult\.wrangler\state\v3\r2`

The backup script does not include `.env.local`, API keys, browser profiles, test recordings, `node_modules`, or the portable Node runtime.

## Create a backup

1. Stop the local app.
2. Run:

   ```powershell
   .\scripts\backup-local-data.ps1
   ```

3. The archive is written under `C:\Users\test\Documents\Consult\.backups`.

## Test a backup archive

Run:

```powershell
.\scripts\test-restore-local-data.ps1 -BackupPath "C:\Users\test\Documents\Consult\.backups\<backup-file>.zip"
```

This extracts the archive into a temporary restore-test directory, confirms D1 and R2 folders are present, then removes the temporary test directory. It does not overwrite live app data.

## Restore live local data

Only restore after stopping the app.

1. Copy the current `C:\Users\test\Documents\Consult\.wrangler\state\v3` folder aside as a rollback copy.
2. Extract the selected backup archive into a temporary folder.
3. Replace `C:\Users\test\Documents\Consult\.wrangler\state\v3` with the extracted `v3` folder.
4. Start the app again and verify login before using the pilot.

Do not use this local development restore procedure as a production backup plan.
