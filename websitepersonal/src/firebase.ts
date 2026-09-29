import { isBrowser } from "@builder.io/qwik/build";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDiowlpy4S6_8BMyacGNPfyjLYBEzmp9NQ",
  authDomain: "arjundubey-dbe8d.firebaseapp.com",
  projectId: "arjundubey-dbe8d",
  storageBucket: "arjundubey-dbe8d.firebasestorage.app",
};

let firebaseApp: FirebaseApp | undefined;
let auth: Auth | undefined;

export function getFirebaseAuth(): Auth {
  if (!isBrowser) {
    throw new Error("Firebase Auth is only available in the browser");
  }
  if (!auth) {
    firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
  }
  return auth;
}

export function watchAuth(
  listener: (userId: string | null) => void,
): () => void {
  return onAuthStateChanged(getFirebaseAuth(), (user) => {
    listener(user?.uid ?? null);
  });
}

export async function requireToken(): Promise<{
  token: string;
  userId: string;
}> {
  const current = getFirebaseAuth().currentUser;
  if (!current) throw new Error("Not signed in");
  const token = await current.getIdToken();
  if (!token) throw new Error("Missing auth token");
  return { token, userId: current.uid };
}

export function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(getFirebaseAuth(), email, password);
}

export function signUpWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
}

export function signOutCurrent() {
  return signOut(getFirebaseAuth());
}
