# Slab Lab — going live

This is your Slab Lab inventory app, converted from a Claude artifact into a
standalone website. The app itself (`src/App.jsx`) is unchanged — every
feature works exactly as it did before. The only real change is `src/storage.js`,
which replaces Claude's built-in storage with a small Supabase-backed database.

## 1. Create a Supabase project (free)

1. Go to https://supabase.com and sign up / log in.
2. Click "New project." Pick any name and a strong database password (save it
   somewhere safe — you likely won't need it again, but keep it just in case).
3. Once the project finishes setting up, open **SQL Editor** (left sidebar) →
   **New query**, paste in everything from `supabase-setup.sql` in this folder,
   and click **Run**. This creates the one table the app needs.
4. Go to **Project Settings → API**. You'll need two values from this page:
   - **Project URL**
   - **anon public** key
5. Copy `.env.example` to a new file named `.env` and paste those two values in.

## 2. Run it locally to confirm it works

```
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173). You should see Slab
Lab exactly as it looked before — try adding a slab and refreshing the page
to confirm it's actually saving to Supabase now.

## 3. Push the code to GitHub

1. Create a free account at https://github.com if you don't have one.
2. Create a new, empty repository (don't add a README — you already have one).
3. From this project folder:
   ```
   git init
   git add .
   git commit -m "Slab Lab"
   git branch -M main
   git remote add origin <the URL GitHub gives you>
   git push -u origin main
   ```

## 4. Deploy to Vercel or Netlify (both free, either works)

**Vercel:**
1. Go to https://vercel.com, sign up with your GitHub account.
2. "Add New Project" → pick your `slab-lab` repo → it auto-detects Vite.
3. Under "Environment Variables," add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` with the same values from your `.env`.
4. Click Deploy. You'll get a live URL in about a minute.

**Netlify** works the same way: "Add new site" → "Import an existing project"
→ pick the repo → add the same two environment variables under
Site settings → Environment variables → Deploy.

## 5. Set up employee logins (Supabase Auth)

The site now has a real login screen — no one can see any inventory data
without signing in, and every pull/reserve/cut/hold gets attributed to
whoever's logged in.

**If you already deployed this before this update:** go back into your
Supabase project's **SQL Editor** and run `supabase-setup.sql` again — it now
tightens the security policy to require a logged-in user instead of allowing
open access. This is a one-time step; you won't need to re-run it after this.

**To add an employee:**
1. In Supabase, go to **Authentication → Users**.
2. Click **Add user → Create new user**.
3. Enter their email and a password (make one up if they don't want to use
   their real email as their login — it doesn't need to receive mail; company
   emails like `name@yourcompany.com` work fine even if that inbox isn't
   actively used).
4. Toggle **Auto Confirm User** to ON before creating — this skips email
   verification, since you're creating the account directly rather than
   having them sign up themselves.
5. Give that employee their email + password. They'll use it to log into the
   site directly — no separate account creation screen exists, which is
   intentional, so only people you've explicitly added can get in.

**One extra lock worth flipping:** in Supabase, go to **Authentication →
Settings**, and turn off **"Allow new users to sign up."** The app has no
sign-up screen anyway, but this closes the door on anyone hitting Supabase's
sign-up API directly.

To remove someone's access later (an employee leaves, etc.), just delete
their user under Authentication → Users — takes effect immediately.

## 6. Password-protect the site itself (optional, extra layer)

With real logins in place from step 5, this is no longer your main line of
defense — but it's a reasonable extra layer if you want the site itself
unreachable to search engines or random visitors before they even see a
login screen:

- **Netlify** (paid plans): Site settings → Access control → Visitor access →
  Password protection.
- **Cloudflare Access** (free, works with any host): put the site behind
  Cloudflare and set up a free Zero Trust Access policy that requires a login
  (email code, Google login, etc.) before anyone can reach it.

## 7. Point your own domain at it (optional)

In Vercel or Netlify, go to your project's Domain settings, add your domain,
and follow the DNS instructions they give you (usually just adding one or two
records at wherever you bought the domain).

## 8. Install it as an app on phones

Once it's live and deployed (steps 3–4), anyone can turn it into a real app
icon on their phone — no App Store needed:

- **iPhone (Safari):** open the site → Share button → "Add to Home Screen."
- **Android (Chrome):** open the site → the browser will usually prompt
  "Install app" automatically, or use the ⋮ menu → "Install app."

It'll open full-screen with its own icon, exactly like a native app, and
still talks to the same Supabase database as everyone else using it.

If you specifically want it listed in the Apple App Store / Google Play
Store (rather than an install-from-the-browser app), that's a separate,
bigger project — wrapping this in a tool like Capacitor and going through
each store's developer program ($99/year for Apple, $25 one-time for
Google) and review process. Worth a separate conversation if that's
something you actually need, since most internal shop tools don't.

## Where things stand on security

With the updated SQL policy in step 5, the database itself now requires a
real login — not just the website's front door. The optional host-level
password in step 6 is a nice-to-have extra layer, not a requirement. If you
ever want finer-grained control (e.g., some employees can see costs and
others can't), that's a further step worth its own conversation.
