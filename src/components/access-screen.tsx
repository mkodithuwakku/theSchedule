"use client";

import { LogIn, LogOut, ShieldCheck } from "lucide-react";
import { signIn, signOut } from "next-auth/react";

export function AccessScreen({ signedInEmail }: { signedInEmail?: string }) {
  const isSignedInWithoutAccess = Boolean(signedInEmail);

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4 text-ink">
      <section className="w-full max-w-lg rounded-2xl border border-line bg-white p-8 text-center shadow-panel">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-mall text-white">
          <ShieldCheck size={28} />
        </div>
        <h1 className="mt-5 text-3xl font-black">The Schedule</h1>
        <p className="mt-2 text-ink/65">Men Are From Mars employee scheduling</p>

        {isSignedInWithoutAccess ? (
          <>
            <div className="mt-6 rounded-lg border border-warn/40 bg-warn/10 p-4 text-left text-sm">
              <div className="font-black">This Google account is not an active employee.</div>
              <p className="mt-1 text-ink/70">
                You signed in as {signedInEmail}. Ask the manager to invite this exact email address, then open the invite link.
              </p>
            </div>
            <button
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 font-bold hover:bg-paper"
              onClick={() => void signOut({ callbackUrl: "/" })}
              type="button"
            >
              <LogOut size={18} />
              Use another Google account
            </button>
          </>
        ) : (
          <>
            <p className="mt-6 text-sm leading-6 text-ink/70">
              Sign in with the Google account your manager approved. Your employee status determines which tools you can use.
            </p>
            <button
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-mall px-4 font-bold text-white hover:opacity-90"
              onClick={() => void signIn("google", { callbackUrl: "/" })}
              type="button"
            >
              <LogIn size={18} />
              Continue with Google
            </button>
          </>
        )}
      </section>
    </main>
  );
}
