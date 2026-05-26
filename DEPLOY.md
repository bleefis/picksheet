# Deployment Guide — GitHub Pages

This guide shows how to host the Four Seasons Order app on GitHub Pages for free.

---

## Prerequisites

- A GitHub account (free)
- Git installed on your computer ([git-scm.com/downloads](https://git-scm.com/downloads))

---

## Initial Setup (One-Time)

### 1. Create a new GitHub repository

Go to [github.com/new](https://github.com/new) and create a repository:
- **Name:** `four-seasons-order` (or any name you prefer)
- **Visibility:** Private or Public (your choice)
- **Don't** check "Add a README" — we already have one
- Click **Create repository**

### 2. Upload the app to GitHub

Open a terminal/command prompt in the folder containing these files, then run:

```bash
# Initialize git in this folder
git init

# Add all files to git
git add .

# Create your first commit
git commit -m "Initial commit: Four Seasons Order PWA"

# Connect to your GitHub repository (replace YOUR_USERNAME and REPO_NAME)
git remote add origin https://github.com/YOUR_USERNAME/four-seasons-order.git

# Push to GitHub
git branch -M main
git push -u origin main
```

**Replace `YOUR_USERNAME` and `four-seasons-order` with your actual GitHub username and repository name.**

### 3. Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** (top menu)
3. Click **Pages** (left sidebar)
4. Under "Source", select **main** branch and **/ (root)** folder
5. Click **Save**
6. Wait 1-2 minutes — GitHub will build your site
7. Your app will be live at: `https://YOUR_USERNAME.github.io/four-seasons-order/`

### 4. Add to Android home screen

1. Open the GitHub Pages URL in Chrome on your Android phone
2. Tap the **⋮ menu** → **Add to Home screen**
3. Tap **Add**
4. Done — the app icon is now on your home screen

---

## Updating the App

Whenever you make changes to `index.html` or other files:

```bash
# Stage your changes
git add .

# Commit with a descriptive message
git commit -m "Fix CSV export bug"

# Push to GitHub
git push
```

GitHub Pages automatically rebuilds in 1-2 minutes. Your phone will use the
updated version next time you open the app (you may need to refresh once).

---

## Custom Domain (Optional)

If you own a domain like `order.yourbusiness.com`, you can point it to GitHub Pages:

1. In your DNS settings, add a CNAME record:
   ```
   order.yourbusiness.com  →  YOUR_USERNAME.github.io
   ```
2. In GitHub: Settings → Pages → Custom domain → enter `order.yourbusiness.com`
3. Wait for DNS propagation (~5-30 minutes)
4. GitHub will automatically enable HTTPS via Let's Encrypt

---

## Troubleshooting

**"git: command not found"**  
→ Install Git from [git-scm.com/downloads](https://git-scm.com/downloads)

**"remote: Repository not found"**  
→ Check your GitHub username and repository name in the `git remote add` command

**"Updates aren't showing on my phone"**  
→ Hard refresh: open the app → Chrome menu → Settings → Site settings → Clear & reset

**"PWA install button isn't appearing"**  
→ GitHub Pages must serve over HTTPS (it does by default). Check that your URL starts with `https://`

---

## Backup Strategy

1. The GitHub repository **IS** your backup for the app code and item defaults
2. **Config backups** (your manually entered IDs) are separate:
   - Use the in-app "Backup Config" button weekly
   - Save the JSON file to Google Drive or email it to yourself
   - GitHub is for code, not for your weekly config changes
3. Commit and push to GitHub whenever you change item defaults in the code

---

## Switching from Netlify

If you were previously using Netlify and want to migrate:

1. Follow the "Initial Setup" steps above
2. Your new URL will be `https://YOUR_USERNAME.github.io/four-seasons-order/`
3. On your phone:
   - Remove the old Netlify home screen icon
   - Open the new GitHub Pages URL in Chrome
   - Add the new URL to your home screen
4. **Important:** Your old quantities and config are in browser localStorage
   tied to the Netlify domain. Export your config backup from the old app first,
   then import it in the new app.

---

## Questions?

- Git basics: [docs.github.com/get-started](https://docs.github.com/get-started)
- GitHub Pages docs: [pages.github.com](https://pages.github.com)
