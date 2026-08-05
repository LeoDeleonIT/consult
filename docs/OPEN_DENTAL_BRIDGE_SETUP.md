# Open Dental bridge setup

This integration uses two Open Dental-supported mechanisms:

1. A **Custom Program Link** launches Trinity Consult from Open Dental and passes only `[PatNum]` in the URL.
2. Trinity Consult uses the official Open Dental API on the server to load the minimum patient context needed for the consultation screen.

No Open Dental key is placed in the URL, browser bundle, or browser storage.

## Prerequisites

- Execute a BAA and complete Trinity privacy/security approval before using real patient information.
- The office must have eConnector running.
- In Open Dental, enable the API under **Setup → Advanced Setup → API**.
- Obtain both the Developer API Key and the office-specific Customer API Key.
- Grant the key **Patients GET** permission (included in Read All).

Open Dental's official setup documentation confirms that both keys are required and the office must enable the key: [API Developer Setup](https://www.opendental.com/site/apisetup.html).

## Configure Trinity Consult

Set these server-only values, then restart the app:

```text
OPEN_DENTAL_DEVELOPER_KEY=developer-key
OPEN_DENTAL_CUSTOMER_KEY=office-customer-key
OPEN_DENTAL_API_BASE_URL=https://api.opendental.com/api/v1
```

## Add the Open Dental button

On a Windows workstation:

1. Go to **Setup → Program Links** and add a Custom Bridge.
2. Enable the bridge.
3. Set **Text on Button** to `Start Consult`.
4. Select the **Appointments**, **Chart**, and **Treatment Plan** toolbars where appropriate.
5. Set **Path of file to open** to the office's browser executable, for example:

   ```text
   C:\Program Files\Google\Chrome\Application\chrome.exe
   ```

6. Set **Optional command line arguments** to the hosted Trinity Consult address:

   ```text
   "https://YOUR-TRINITY-HOST/coordinator/consultations/new?odPatNum=[PatNum]"
   ```

7. Save, select a test patient, and click **Start Consult**.

Open Dental documents `[PatNum]` as a supported Custom Bridge argument and permits a toolbar button to launch a URL: [Custom Bridges](https://opendental.com/manual/bridgecustom.html), [Program Links](https://opendental.com/site/programlinks.html).

## Expected workflow

The button opens Trinity Consult. After sign-in, the patient is loaded from Open Dental. The staff member selects **Doctor**, **Treatment coordinator**, or **Dental assistant**, confirms recording consent, and continues to the compact recorder.

The URL contains only the Open Dental internal patient number. Patient name, date of birth, API keys, and other demographics are not included in the URL.
