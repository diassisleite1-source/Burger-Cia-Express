import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";

import {
  getAuth
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import {
  getStorage
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyAkrIjDCv3liugwucjfA5auR5Xbm_wYvZc",
  authDomain: "bellapes-maos.firebaseapp.com",
  projectId: "bellapes-maos",
  storageBucket: "bellapes-maos.firebasestorage.app",
  messagingSenderId: "569461304335",
  appId: "1:569461304335:web:7155c8879f9c165311077a",
  measurementId: "G-SS0910MTHT"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
