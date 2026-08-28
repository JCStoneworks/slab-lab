import React, { useState } from "react";
import { signIn } from "./auth.js";

export default function Login({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error: signInError } = await signIn(email.trim(), password);
    setLoading(false);
    if (signInError) {
      setError("Incorrect email or password. Check with whoever set up your account if you're not sure.");
      return;
    }
    onSignedIn(data.session);
  };

  return (
    <div style={styles.wrap}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&display=swap');
      `}</style>
      <form style={styles.card} onSubmit={handleSubmit}>
        <div style={styles.badge}>SL</div>
        <h1 style={styles.title}>Slab Lab</h1>
        <p style={styles.subtitle}>Sign in to continue</p>

        <label style={styles.label}>Email</label>
        <input
          style={styles.input}
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourshop.com"
          required
        />

        <label style={styles.label}>Password</label>
        <input
          style={styles.input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />

        {error && <div style={styles.error}>{error}</div>}

        <button style={styles.button} type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f7f6f1",
    fontFamily: "'Inter', sans-serif",
    padding: 20,
  },
  card: {
    background: "white",
    border: "1.5px solid #d3d2c6",
    borderRadius: 14,
    padding: "32px 28px",
    width: "100%",
    maxWidth: 360,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: "linear-gradient(135deg, #b8912f 0%, #d9c07a 45%, #3a4340 100%)",
    color: "#1c2321",
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 700,
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 22,
    fontWeight: 700,
    color: "#1c2321",
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: "#3a4340",
    margin: "0 0 14px",
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "#3a4340",
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    marginTop: 8,
  },
  input: {
    fontFamily: "'Inter', sans-serif",
    fontSize: 14,
    padding: "10px 12px",
    border: "1.5px solid #d3d2c6",
    borderRadius: 8,
    marginTop: 4,
  },
  error: {
    fontSize: 12.5,
    color: "#a3423a",
    background: "rgba(163,66,58,0.1)",
    padding: "8px 11px",
    borderRadius: 8,
    marginTop: 10,
  },
  button: {
    marginTop: 18,
    background: "#b8912f",
    color: "#1c2321",
    border: "none",
    borderRadius: 8,
    padding: "12px",
    fontFamily: "'Inter', sans-serif",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
  },
};
