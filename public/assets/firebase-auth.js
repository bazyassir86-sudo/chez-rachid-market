import { firebaseConfig, isFirebaseConfigReady } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const ADMIN_LOGIN_PATH = "/admin-login.html";

const AdminAuth = {
  ready: null,
  configured: false,
  auth: null,
  provider: null,
  currentUser: null,
  async getIdToken() {
    await this.ready;
    if (!this.currentUser) return "";
    return this.currentUser.getIdToken();
  },
  async getExistingSession() {
    const response = await fetch("/api/admin/session", { method: "GET" });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload.admin || null;
  },
  async signInWithGoogle() {
    await this.ready;
    if (!this.configured) {
      throw new Error("Firebase is not configured yet.");
    }

    const result = await signInWithPopup(this.auth, this.provider);
    this.currentUser = result.user;
    return result.user;
  },
  async waitForUser() {
    await this.ready;
    if (!this.configured) return null;
    if (this.currentUser) return this.currentUser;

    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(this.auth, (user) => {
        unsubscribe();
        this.currentUser = user;
        resolve(user);
      });
    });
  },
  async createAdminSession() {
    await this.ready;
    if (!this.currentUser) {
      throw new Error("Please sign in with Google first.");
    }

    const token = await this.currentUser.getIdToken(true);
    const response = await fetch("/api/admin/session", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload.error || "Admin access denied.");
      error.status = response.status;
      throw error;
    }
    return payload.admin;
  },
  async requireAdmin() {
    await this.ready;
    const existingSession = await this.getExistingSession().catch(() => null);
    if (existingSession) return existingSession;

    if (!this.configured) {
      window.location.replace(`${ADMIN_LOGIN_PATH}?error=config&redirect=${encodeURIComponent(window.location.pathname)}`);
      return null;
    }

    const user = await this.waitForUser();
    if (!user) {
      window.location.replace(`${ADMIN_LOGIN_PATH}?redirect=${encodeURIComponent(window.location.pathname)}`);
      return null;
    }

    try {
      return await this.createAdminSession();
    } catch (error) {
      await this.signOutAdmin(false);
      const reason = error.status === 403 ? "forbidden" : error.status === 503 ? "config" : "session";
      window.location.replace(`${ADMIN_LOGIN_PATH}?error=${reason}&redirect=${encodeURIComponent(window.location.pathname)}`);
      return null;
    }
  },
  async signOutAdmin(redirect = true) {
    await this.ready;
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    if (this.configured && this.auth) {
      await signOut(this.auth).catch(() => {});
    }
    this.currentUser = null;
    if (redirect) {
      window.location.href = ADMIN_LOGIN_PATH;
    }
  }
};

window.AdminAuth = AdminAuth;
window.dispatchEvent(new Event("admin-auth-object-ready"));

AdminAuth.ready = (async () => {
  console.log("[Chez Rachid Admin] Firebase auth module loaded.");
  AdminAuth.configured = isFirebaseConfigReady();
  if (!AdminAuth.configured) {
    console.error("[Chez Rachid Admin] Firebase config is missing or incomplete.");
    return AdminAuth;
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  AdminAuth.auth = auth;
  AdminAuth.provider = provider;

  await new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      AdminAuth.currentUser = user;
      unsubscribe();
      resolve();
    });
  });

  console.log("[Chez Rachid Admin] Firebase auth is ready.");
  return AdminAuth;
})().catch((error) => {
  console.error("[Chez Rachid Admin] Firebase failed to initialize.", error);
  AdminAuth.setupError = error;
  throw error;
});
