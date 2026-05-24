(function () {
  console.log("[Chez Rachid Admin] Login script loaded.");

  const loginButton = document.querySelector("[data-google-login]");
  const statusNode = document.querySelector("[data-login-status]");
  const accountNode = document.querySelector("[data-login-account]");
  const setupNode = document.querySelector("[data-login-setup]");
  let auth = null;
  let authReady = false;

  function setStatus(message, isError) {
    if (!statusNode) return;
    statusNode.textContent = message || "";
    statusNode.classList.toggle("error", Boolean(isError));
    if (isError) {
      console.error("[Chez Rachid Admin]", message);
    }
  }

  function getRedirectTarget() {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get("redirect") || "/admin.html";
    return redirect.startsWith("/") ? redirect : "/admin.html";
  }

  function waitForAuthObject(timeoutMs = 8000) {
    if (window.AdminAuth) return Promise.resolve(window.AdminAuth);

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error("Firebase authentication did not load. Check the Firebase CDN scripts and browser console."));
      }, timeoutMs);

      window.addEventListener("admin-auth-object-ready", () => {
        window.clearTimeout(timer);
        resolve(window.AdminAuth);
      }, { once: true });
    });
  }

  async function authorizeCurrentUser() {
    const user = await auth.waitForUser();
    if (!user) return false;
    if (accountNode) {
      accountNode.textContent = "Google account connected.";
    }

    setStatus("Checking admin access...");
    await auth.createAdminSession();
    window.location.href = getRedirectTarget();
    return true;
  }

  function showUrlError() {
    const error = new URLSearchParams(window.location.search).get("error");
    if (error === "forbidden") {
      setStatus("This Google account is not authorized for the dashboard.", true);
    } else if (error === "session") {
      setStatus("Please sign in again to continue.", true);
    } else if (error === "config") {
      setStatus("Firebase setup is missing. Check the Firebase web config and server project ID.", true);
    }
  }

  async function handleGoogleClick() {
    console.log("[Chez Rachid Admin] Google login button clicked.");
    if (!authReady || !auth) {
      setStatus("Firebase is still loading. Please wait a moment and try again.", true);
      return;
    }

    loginButton.disabled = true;
    setStatus("Opening Google sign in...");

    try {
      const user = await auth.signInWithGoogle();
      if (!user) {
        loginButton.disabled = false;
        setStatus("Google sign in was not completed.", true);
        return;
      }
      await authorizeCurrentUser();
    } catch (error) {
      await auth.signOutAdmin(false);
      loginButton.disabled = false;
      setStatus(error.message || "Google sign in failed.", true);
    }
  }

  async function bootLogin() {
    console.log("[Chez Rachid Admin] Login page loaded.");
    showUrlError();

    if (!loginButton) {
      setStatus("Login button was not found on the page.", true);
      return;
    }

    loginButton.addEventListener("click", handleGoogleClick);
    console.log("[Chez Rachid Admin] Google login button listener attached.");

    try {
      auth = await waitForAuthObject();
      await auth.ready;
      authReady = true;
    } catch (error) {
      loginButton.disabled = true;
      if (setupNode) setupNode.hidden = false;
      setStatus(error.message || "Firebase could not be loaded.", true);
      return;
    }

    const existingSession = await auth.getExistingSession().catch(() => null);
    if (existingSession) {
      window.location.href = getRedirectTarget();
      return;
    }

    if (!auth.configured) {
      loginButton.disabled = true;
      if (setupNode) setupNode.hidden = false;
      setStatus("Firebase is not configured yet. Check public/assets/firebase-config.js.", true);
      return;
    }

    const redirected = await authorizeCurrentUser().catch(async (error) => {
      await auth.signOutAdmin(false);
      setStatus(error.message || "Admin access denied.", true);
      return false;
    });
    if (redirected) return;

    loginButton.disabled = false;
    setStatus("Ready. Continue with Google to access the dashboard.");
  }

  document.addEventListener("DOMContentLoaded", bootLogin);
})();
