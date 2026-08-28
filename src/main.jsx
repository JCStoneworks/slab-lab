import "./storage.js"; // sets up window.storage BEFORE the app loads
import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Login from "./Login.jsx";
import { getSession, onAuthStateChange, signOut } from "./auth.js";

function Root() {
  const [session, setSession] = useState(undefined); // undefined = still checking, null = signed out

  useEffect(() => {
    getSession().then(setSession);
    const subscription = onAuthStateChange((s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div style={{ minHeight: "100vh", background: "#f7f6f1" }} />; // brief blank while checking
  }

  if (!session) {
    return <Login onSignedIn={setSession} />;
  }

  return <App currentUser={session.user.email} onSignOut={signOut} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
