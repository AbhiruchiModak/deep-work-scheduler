```markdown
# Deep Work Scheduler

Maximize productivity by creating **time blocks for deep work**.  
This lightweight web app helps you plan focused sessions, receive reminders, and track your daily progress — all without requiring sign-in.

---

## 🚀 Features
- **Frictionless onboarding** → no accounts, tasks stored in browser local storage.
- **Time block creation** → schedule deep work sessions for the day.
- **Reminders & notifications** → push notifications via PWA service worker.
- **Offline support** → works even without internet once installed.
- **Cross-platform** → installable on mobile and desktop as a Progressive Web App (PWA).

---

## 🛠️ Tech Stack
- **Frontend:** HTML, CSS, JavaScript
- **PWA:** Manifest.json + Service Worker
- **Hosting:** GitHub Pages

---

## 📦 Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/<your-username>/deep-work-scheduler.git
   ```
2. Navigate to the project folder:
   ```bash
   cd deep-work-scheduler
   ```
3. Open `index.html` in your browser, or serve with a local server.

---

## 🌐 Deployment (GitHub Pages)
1. Push your project to the `main` branch.  
2. Go to **Settings → Pages**.  
3. Under **Source**, select `main` branch and `/root`.  
4. Your app will be live at:
   ```
   https://<your-username>.github.io/deep-work-scheduler/
   ```

---

## 📱 PWA Setup
- Add `manifest.json` for app metadata (name, icons, theme color).  
- Register a **service worker** for caching and notifications.  
- Once hosted over HTTPS, users can install the app on mobile or desktop.
