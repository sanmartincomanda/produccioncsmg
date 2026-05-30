import { getFirestore, type Firestore } from "firebase/firestore";

import { getFirebaseClientApp } from "@/lib/firebase/client";

let cachedFirestore: Firestore | null | undefined;

export function getFirebaseFirestore() {
  if (cachedFirestore !== undefined) {
    return cachedFirestore;
  }

  const app = getFirebaseClientApp();
  cachedFirestore = app ? getFirestore(app) : null;
  return cachedFirestore;
}
