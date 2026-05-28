# Field Reporting Form Application

A professional, highly accessible (WCAG 2.1 AA compliant), and offline-first Progressive Web Application (PWA) designed to replace manual field reporting for educational officers.

This app is **100% serverless** and client-side, making it immediately hostable for free on **GitHub Pages**, syncing data securely and directly to a designated Google Sheet.

---

## 🌟 Key Features

- **Mandatory Privacy & Geolocation Consent Screen:** On load, a modal gates form access, explicitly seeking permission for data collection and GPS tracking. Declining locks the app, ensuring legal compliance.
- **Offline-First Architecture (IndexedDB Queue):** Form submissions are saved locally in the browser's database when internet connection is lost. Submissions will automatically sync to the cloud once network connection is recovered.
- **Automatic Geolocation Capture:** Automatically captures highly-accurate GPS coordinates on form submission with live status badge indicators (Permission granted, denied, or pending).
- **Auto-Calculated Duration:** Dynamic event listeners automatically calculate and format visit duration (e.g. `2 hours 30 mins`) after Start Date and Closing Time are filled.
- **WCAG 2.1 AA Compliant Accessibility:** Built with high-contrast color palettes, a keyboard Skip Link, focus state indicators, fully associated semantic labels, and screen-reader `aria-*` tags.
- **Vibrant & Responsive HSL Aesthetics:** Sleek premium look with beautiful gradients, custom typography (Outfit & Inter), micro-animations, and full Dark/Light theme toggles.

---

## 🛠️ Step-by-Step Google Sheets Setup (Serverless Backend)

Setting up the serverless Google Sheets sync takes less than 2 minutes and requires zero local server code:

1.  **Create your Google Sheet:**
    - Create a new blank spreadsheet in Google Drive.
2.  **Open Apps Script Editor:**
    - In the top menu, click **Extensions** > **Apps Script**.
3.  **Paste the Webhook Code:**
    - Delete any default code in the script editor.
    - Open [google-apps-script.js](file:///c:/Users/.../KFormApp/google-apps-script.js) from this project folder, copy its contents, and paste it into the script editor.
4.  **Save the Script:**
    - Click the **Save icon** (diskette) at the top of the editor.
5.  **Deploy as Web App:**
    - Click the blue **Deploy** button in the top right, then select **New deployment**.
    - Click the gear icon (Select type) and choose **Web app**.
    - Configure the following settings:
      - **Description:** `Field Reporting Form Webhook`
      - **Execute as:** `Me (your-google-email@gmail.com)`
      - **Who has access:** `Anyone` (This allows the static web app to securely POST reports).
    - Click the **Deploy** button.
6.  **Copy the Web App URL:**
    - Google will prompt you to authorize permissions (click _Advanced_ > _Go to Untitled Project (unsafe)_ to authorize).
    - Once authorized, copy the generated **Web app URL** (looks like `https://script.google.com/macros/s/.../exec`).
7.  **Enter in Web App Settings:**
    - Open your Field Form Web App, scroll to the bottom, expand **⚙️ Google Sheets Integration Settings**, paste your Web App URL, and click **Save Settings**.
    - _That's it!_ Any online submission will append as a row, and a tab named **"Field Reports"** with header formatting will automatically generate in your spreadsheet on first submission.

---

## 🚀 How to Host on GitHub Pages (Free Hosting)

Since this project has no backend server dependencies, it is perfectly suited for free, fast static hosting on GitHub Pages:

1.  **Create a GitHub Repository:**
    - Log in to GitHub and create a new public or private repository (e.g., `field-reporting-form`).
2.  **Upload Project Files:**
    - Commit and push all files in the `KFormApp` folder to the repository's `main` or `master` branch.
    - Ensure the structure looks like this in the root of your repo:
      ```text
      ├── css/
      │   └── style.css
      ├── js/
      │   ├── app.js
      │   ├── db.js
      │   └── sync.js
      ├── index.html
      ├── sw.js
      ├── manifest.json
      └── README.md
      ```
3.  **Activate GitHub Pages:**
    - In your GitHub repository, click on **Settings** (gear icon) in the top tab.
    - In the left sidebar, click on **Pages** (under the "Code and automation" section).
    - Under **Build and deployment** > **Source**, select **Deploy from a branch**.
    - Under **Branch**, select `main` (or `master`) and folder `/ (root)`.
    - Click **Save**.
4.  **Access Your Application:**
    - Wait about 30 seconds. GitHub will display your live app link at the top: `https://<your-username>.github.io/<your-repo-name>/`.
    - Educational officers can open this link on their mobile devices, install it as a PWA app on their home screens, and fill it completely offline!

---

## 💻 Running Locally

To preview and test the form on your own machine:

1.  **Open directly in browser:**
    - Double click `index.html` to open it in your web browser. Note: Service Workers (PWA capabilities) and Geolocation APIs require a secure context (HTTPS or `localhost`), so running via a local web server is highly recommended for full testing.
2.  **Run using a lightweight HTTP server:**
    - If you have **Node.js** installed, run the following command in the workspace directory:
      ```bash
      npx http-server ./
      ```
    - Alternatively, if you use VS Code, right-click `index.html` and select **Open with Live Server**.
    - Open `http://localhost:8080` (or the port specified) in your browser.

---

## 🔐 Data Security & Offline Sync Mechanics

- **Offline Data Security:** Submissions are queued in the client's **IndexedDB**, a private, sandboxed transactional database native to the browser. Data is never shared or leaked across websites.
- **Direct Syncing (CORS Bypass):** Data is sent via HTTP standard POST request containing stringified JSON, using a `text/plain` content header. This prevents CORS preflight OPTIONS blocking and guarantees smooth integration directly between GitHub Pages and Google.
- **Network Status Warnings:** The app uses live event listeners (`online` and `offline`). When the device detects it's back online, it fires a sync routine with a loading indicator, syncing queued records sequentially to the Google Sheet and clearing them from the local cache.
