import "server-only";

import { existsSync, readFileSync } from "node:fs";

import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

type ServiceAccountPayload = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

type FirebaseAdminStatus = {
  configured: boolean;
  initialized: boolean;
  projectId: string | null;
  clientEmail: string | null;
  credentialsPath: string | null;
  error: string | null;
};

const globalForFirebaseAdmin = globalThis as {
  firebaseAdminApp?: App;
};

function normalizePrivateKey(value: string | undefined) {
  return value ? value.replace(/\\n/g, "\n") : undefined;
}

function readServiceAccountPayload(): {
  payload: ServiceAccountPayload | null;
  credentialsPath: string | null;
} {
  const credentialsPath = process.env.FIREBASE_ADMIN_CREDENTIALS_PATH ?? null;

  if (!credentialsPath) {
    return { payload: null, credentialsPath: null };
  }

  if (!existsSync(credentialsPath)) {
    throw new Error(`No se encontro la llave de Firebase Admin en: ${credentialsPath}`);
  }

  const raw = readFileSync(credentialsPath, "utf8");
  const payload = JSON.parse(raw) as ServiceAccountPayload;
  return { payload, credentialsPath };
}

function getFirebaseAdminServiceAccount() {
  const { payload, credentialsPath } = readServiceAccountPayload();

  if (!payload?.project_id || !payload.client_email || !payload.private_key) {
    throw new Error("La llave de Firebase Admin esta incompleta o no es valida.");
  }

  return {
    credentialsPath,
    projectId: payload.project_id,
    clientEmail: payload.client_email,
    privateKey: normalizePrivateKey(payload.private_key),
  };
}

export function getFirebaseAdminApp() {
  if (globalForFirebaseAdmin.firebaseAdminApp) {
    return globalForFirebaseAdmin.firebaseAdminApp;
  }

  if (getApps().length) {
    globalForFirebaseAdmin.firebaseAdminApp = getApp();
    return globalForFirebaseAdmin.firebaseAdminApp;
  }

  const serviceAccount = getFirebaseAdminServiceAccount();

  globalForFirebaseAdmin.firebaseAdminApp = initializeApp({
    credential: cert({
      projectId: serviceAccount.projectId,
      clientEmail: serviceAccount.clientEmail,
      privateKey: serviceAccount.privateKey,
    }),
  });

  return globalForFirebaseAdmin.firebaseAdminApp;
}

export function getFirebaseAdminAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getFirebaseAdminFirestore() {
  return getFirestore(getFirebaseAdminApp());
}

export function getFirebaseAdminStatus(): FirebaseAdminStatus {
  try {
    const serviceAccount = getFirebaseAdminServiceAccount();
    getFirebaseAdminApp();

    return {
      configured: true,
      initialized: true,
      projectId: serviceAccount.projectId,
      clientEmail: serviceAccount.clientEmail,
      credentialsPath: serviceAccount.credentialsPath,
      error: null,
    };
  } catch (error) {
    return {
      configured: false,
      initialized: false,
      projectId: null,
      clientEmail: null,
      credentialsPath: process.env.FIREBASE_ADMIN_CREDENTIALS_PATH ?? null,
      error: error instanceof Error ? error.message : "No fue posible leer la llave de Firebase Admin.",
    };
  }
}
