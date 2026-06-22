// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // Gidugang ni
import { getStorage } from "firebase/storage";     // Gidugang ni

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB2K6i9_5dLZ26rz2b7ZR_rxQQMedqu74w",
  authDomain: "mrs-g-rental-system.firebaseapp.com",
  projectId: "mrs-g-rental-system",
  storageBucket: "mrs-g-rental-system.firebasestorage.app",
  messagingSenderId: "505354415626",
  appId: "1:505354415626:web:37ea5b167af29901b779f3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// KINI ANG PINAKA-IMPORTANTE NGA KUWANG:
// Gi-export nato para magamit sa Inventory.jsx
export const db = getFirestore(app);
export const storage = getStorage(app);