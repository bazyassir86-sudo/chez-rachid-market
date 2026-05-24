import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCYftvDf8ySgxJwdb8ihTJatP2ITUT0kB4",
  authDomain: "chez-rachid-market.firebaseapp.com",
  projectId: "chez-rachid-market",
  storageBucket: "chez-rachid-market.firebasestorage.app",
  messagingSenderId: "517065798047",
  appId: "1:517065798047:web:2702495166245e07068daa",
  measurementId: "G-TJPYQL5Z9X"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
