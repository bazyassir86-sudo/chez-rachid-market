# Chez Rachid Market

Professional e-commerce website for a local blankets, bedding, home covers, and Moroccan textile store in Souk Jdid, Essaouira.

## Run the website

```powershell
npm start
```

Open:

```text
http://localhost:3000
```

## Admin dashboard

Open:

```text
http://localhost:3000/admin-login.html
```

The public navigation does not show an Admin link. Hidden access is available by opening `/admin-login.html` directly, typing `admin` on the site, or clicking the CRM mark five times.

The dashboard is protected with Firebase Google Authentication. The allowed account is kept only in the server-side allowlist.

Before using login in production:

1. Create a Firebase project and enable Authentication > Google provider.
2. Copy the Firebase web app config into `public/assets/firebase-config.js`.
3. Start the server with the Firebase project ID and a session secret:

```powershell
$env:FIREBASE_PROJECT_ID="your-firebase-project-id"
$env:ADMIN_SESSION_SECRET="use-a-long-random-secret"
npm start
```

The owner can add, edit, and delete products after login. Each product includes name, MAD price, description, category, image URL or uploaded image, and stock status. Products are saved in `data/products.json`; uploaded images are saved in `public/uploads`.

The catalogue is intentionally empty by default. No demo products were added.
