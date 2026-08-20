"use client";

import Image from "next/image";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Clock3,
  LogOut,
} from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import { useState } from "react";

type AccessScreenProps = {
  authError?: string;
  signedInEmail?: string;
};

const previewDays = [
  { day: "SUN", date: "24", active: false },
  { day: "MON", date: "25", active: true },
  { day: "TUE", date: "26", active: false },
  { day: "WED", date: "27", active: false },
  { day: "THU", date: "28", active: false },
];

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
      <path
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.01v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.98-.9 6.64-2.42l-3.24-2.53c-.9.6-2.05.96-3.4.96-2.61 0-4.83-1.77-5.62-4.14H3.03v2.62A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.38 13.87A6.01 6.01 0 0 1 6.06 12c0-.65.11-1.28.32-1.87V7.51H3.03A10 10 0 0 0 2 12c0 1.61.39 3.14 1.03 4.49l3.35-2.62Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.99c1.47 0 2.79.5 3.83 1.5l2.88-2.87A9.66 9.66 0 0 0 12 2a10 10 0 0 0-8.97 5.51l3.35 2.62C7.17 7.76 9.39 5.99 12 5.99Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function SchedulePreview() {
  return (
    <div className="relative mt-10 max-w-xl rounded-[1.75rem] border border-white/10 bg-white/[0.08] p-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="rounded-[1.35rem] bg-white p-5 text-[#121824] shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold tracking-[0.16em] text-[#0f62a3]">
              MY WEEK
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight">
              August 24–30
            </h2>
          </div>
          <div className="rounded-full bg-[#e8f3fb] px-3 py-1.5 text-xs font-bold text-[#0f62a3]">
            Published
          </div>
        </div>

        <div className="mt-5 grid grid-cols-5 gap-2">
          {previewDays.map((item) => (
            <div
              className={`rounded-xl py-2 text-center ${item.active ? "bg-[#0f62a3] text-white shadow-lg shadow-[#0f62a3]/20" : "bg-[#f2f5f8] text-[#667085]"}`}
              key={item.day}
            >
              <div className="text-[9px] font-extrabold tracking-wider">
                {item.day}
              </div>
              <div className="mt-0.5 text-lg font-black">{item.date}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-4 rounded-2xl border border-[#dce4ec] p-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#0f62a3] text-white">
              <Clock3 size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-black">Opening shift</div>
              <div className="mt-0.5 text-sm text-[#667085]">
                Monday · 9:30 AM–5:30 PM
              </div>
            </div>
            <div className="hidden size-9 place-items-center rounded-full bg-[#e8f3fb] text-xs font-black text-[#0f62a3] sm:grid">
              MK
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-[#dce4ec] p-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e8f3fb] text-[#0f62a3]">
              <CalendarDays size={20} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-black">Next shift</div>
              <div className="mt-0.5 text-sm text-[#667085]">
                Thursday · 12:00 PM–8:00 PM
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AccessScreen({ authError, signedInEmail }: AccessScreenProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const isSignedInWithoutAccess = Boolean(signedInEmail);
  const hasAuthError = Boolean(authError);

  const startGoogleSignIn = () => {
    setIsRedirecting(true);
    void signIn("google", { callbackUrl: "/" });
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070c14] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(28,118,188,0.34),transparent_34%),radial-gradient(circle_at_74%_90%,rgba(51,91,151,0.2),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:radial-gradient(circle,white_1px,transparent_1px)] [background-size:28px_28px]" />

      <div className="relative mx-auto grid min-h-screen max-w-[1500px] lg:grid-cols-[1.12fr_0.88fr]">
        <section className="flex flex-col justify-between px-6 pb-10 pt-7 sm:px-10 lg:px-16 lg:py-12 xl:px-24">
          <div
            className="relative h-[72px] w-[260px] overflow-hidden sm:h-[82px] sm:w-[300px]"
            aria-label="Men Are From Mars"
          >
            <Image
              alt="Men Are From Mars"
              className="object-cover"
              fill
              priority
              sizes="300px"
              src="/men-are-from-mars-logo.png"
            />
          </div>

          <div className="mt-12 lg:mt-20">
            <p className="mb-4 text-xs font-extrabold tracking-[0.24em] text-[#78c4f3]">
              EMPLOYEE SCHEDULING
            </p>
            <h1 className="max-w-2xl text-4xl font-black leading-[1.02] tracking-[-0.04em] sm:text-5xl xl:text-6xl">
              Your week,
              <br />
              clearly scheduled.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/65 sm:text-lg">
              Availability, shifts, and coverage—all in one place.
            </p>
            <div className="hidden lg:block">
              <SchedulePreview />
            </div>
          </div>

          <p className="mt-12 text-xs font-semibold tracking-wide text-white/35">
            THE SCHEDULE
          </p>
        </section>

        <section className="flex items-center bg-[#f4f7fb] px-4 py-10 text-[#121824] sm:px-10 lg:rounded-l-[2.5rem] lg:px-14 xl:px-20">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-9 h-1 w-14 rounded-full bg-[#0f62a3]" />
            <p className="text-sm font-extrabold tracking-[0.16em] text-[#0f62a3]">
              THE SCHEDULE
            </p>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.035em] sm:text-5xl">
              {isSignedInWithoutAccess
                ? "Account not approved"
                : "Welcome back"}
            </h2>

            {isSignedInWithoutAccess ? (
              <>
                <div className="mt-6 rounded-2xl border border-[#e5b981] bg-[#fff8ed] p-5 text-sm leading-6 text-[#70420d]">
                  <div className="font-black">
                    This Google account is not an active employee.
                  </div>
                  <p className="mt-1 text-[#70420d]/80">
                    You signed in as {signedInEmail}. Ask your manager to
                    approve this exact email address.
                  </p>
                </div>
                <button
                  className="mt-7 inline-flex h-14 w-full items-center justify-center gap-3 rounded-xl border border-[#cdd7e2] bg-white px-5 font-extrabold text-[#172033] shadow-sm transition hover:border-[#9fb0c2] hover:bg-[#f9fbfd]"
                  onClick={() => void signOut({ callbackUrl: "/" })}
                  type="button"
                >
                  <LogOut size={19} />
                  Use another Google account
                </button>
              </>
            ) : (
              <>
                <p className="mt-5 text-base leading-7 text-[#5f6877]">
                  Sign in with the Google account your manager approved.
                </p>

                {hasAuthError ? (
                  <div
                    className="mt-6 flex gap-3 rounded-2xl border border-[#e6b4b0] bg-[#fff2f1] p-4 text-sm leading-6 text-[#7c2420]"
                    role="alert"
                  >
                    <AlertCircle className="mt-0.5 shrink-0" size={19} />
                    <div>
                      <div className="font-black">
                        Google sign-in is temporarily unavailable.
                      </div>
                      <p className="mt-0.5 text-[#7c2420]/80">
                        Please try again in a moment.
                      </p>
                    </div>
                  </div>
                ) : null}

                <button
                  className="group mt-8 inline-flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#0f62a3] px-5 font-extrabold text-white shadow-[0_12px_30px_rgba(15,98,163,0.24)] transition hover:-translate-y-0.5 hover:bg-[#0b568f] hover:shadow-[0_16px_36px_rgba(15,98,163,0.3)] disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0"
                  disabled={isRedirecting}
                  onClick={startGoogleSignIn}
                  type="button"
                >
                  <span className="grid size-8 place-items-center rounded-lg bg-white">
                    <GoogleMark />
                  </span>
                  <span>
                    {isRedirecting ? "Opening Google…" : "Continue with Google"}
                  </span>
                  <ArrowRight
                    className="ml-auto transition-transform group-hover:translate-x-0.5"
                    size={19}
                  />
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
