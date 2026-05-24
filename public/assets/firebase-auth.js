import { firebaseConfig, isFirebaseConfigReady } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

window.AdminAuth = {
  configured: isFirebaseConfigReady(),
  auth,
  provider,

  signInWithGoogle: async () => {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  },

  signOutAdmin: () => signOut(auth),

  onAuthStateChanged: (callback) => {
    return onAuthStateChanged(auth, callback);
  }
};

window.dispatchEvent(new Event("admin-auth-object-ready"));
