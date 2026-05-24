export const firebaseConfig = {
  apiKey: "AIzaSyCYftvDf8ySgxJwdb8ihTJatP2ITUT0kB4",
  authDomain: "chez-rachid-market.firebaseapp.com",
  projectId: "chez-rachid-market",
  storageBucket: "chez-rachid-market.firebasestorage.app",
  messagingSenderId: "517065798047",
  appId: "1:517065798047:web:2702495166245e07068daa",
  measurementId: "G-TJPYQL5Z9X"
};

export function isFirebaseConfigReady() {
  return Object.values(firebaseConfig).every((value) => {
    const text = String(value || "");
    return text && !text.startsWith("PUT_FIREBASE_");
  });
}
