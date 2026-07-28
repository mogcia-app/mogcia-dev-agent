"use client";

import { onAuthStateChanged, signInWithEmailAndPassword, type User } from "firebase/auth";
import Image from "next/image";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import { LoadingCard, PageProgress } from "@/components/ui/loading";
import { StatusBanner } from "@/components/ui/status";

export default function LoginPage() {
  const firebaseConfigured = isFirebaseConfigured();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(firebaseConfigured);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      return;
    }

    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsLoading(false);
      if (nextUser) {
        setIsRedirecting(true);
        router.replace("/home" as Route);
      }
    });
  }, [router]);

  const submitLogin = async () => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setMessage("Firebaseが未設定です。");
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setIsRedirecting(true);
      router.replace("/home" as Route);
    } catch (error) {
      setMessage(toAuthMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isAuthTransition = firebaseConfigured && (isLoading || isRedirecting || user);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <div className="absolute -right-32 -top-32 h-[480px] w-[480px] rounded-none bg-[#E9CBC8]/55" />
      <div className="absolute -bottom-36 -left-36 h-[420px] w-[420px] rounded-none bg-[#D5B5B2]/30" />
      {isRedirecting ? <PageProgress /> : null}

      <section className="relative w-full max-w-[760px] rounded-[56px] border border-white/70 bg-white/90 px-6 py-10 shadow-[0_28px_90px_rgba(31,31,34,0.12)] backdrop-blur sm:px-12 sm:py-14">
        <div className="pointer-events-none absolute left-[18%] top-[16%] text-3xl font-light text-[#D5B5B2]/70">+</div>
        <div className="pointer-events-none absolute right-[20%] top-[18%] h-4 w-4 rounded-none bg-[#E9CBC8]" />
        <div className="pointer-events-none absolute right-[15%] top-[30%] text-4xl font-light text-[#D5B5B2]/70">+</div>

        <div className="mx-auto flex max-w-[500px] flex-col items-center">
          <Image
            alt="MOGCIA Dev Agent"
            className="h-[190px] w-[190px] rounded-none object-cover shadow-[0_18px_45px_rgba(185,123,128,0.18)]"
            height={220}
            priority
            src="/m-dev-agent.png"
            width={220}
          />

          <h1 className="mt-8 text-center text-4xl font-semibold leading-tight text-[#1F1F22]">Welcome back!</h1>
          <p className="mt-3 text-center text-base leading-7 text-neutral-500">アカウントにログインして、MOGCIAを始めましょう</p>

          {!firebaseConfigured ? (
            <p className="mt-8 w-full rounded-[18px] border border-[#E9CBC8] bg-[#F8F4F3] px-5 py-4 text-sm text-[#B97B80]">
              Firebase未設定です。.env.local にFirebase Web Appの値を入れてください。
            </p>
          ) : isAuthTransition ? (
            <div className="mt-8 w-full">
              <LoadingCard compact variant="auth" title={isLoading ? "認証しています" : "ログインしました！"} description={isLoading ? "アカウントを確認しています..." : "Homeへ移動しています..."} progress={isRedirecting ? 70 : undefined} />
            </div>
          ) : (
            <form
              className="mt-9 w-full space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                void submitLogin();
              }}
            >
              <label className="block text-base font-medium text-[#1F1F22]">
                メールアドレス
                <span className="relative mt-3 block">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[#C79A98]">
                    <MailIcon />
                  </span>
                  <input
                    autoComplete="email"
                    className="h-16 w-full rounded-[18px] border border-[#E4D8D6] bg-white/72 px-14 text-base font-normal text-[#1F1F22] outline-none transition placeholder:text-neutral-400 focus:border-[#C79A98] focus:bg-white"
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="メールアドレスを入力してください"
                    type="email"
                    value={email}
                  />
                </span>
              </label>
              <label className="block text-base font-medium text-[#1F1F22]">
                パスワード
                <span className="relative mt-3 block">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-[#C79A98]">
                    <LockIcon />
                  </span>
                  <input
                    autoComplete="current-password"
                    className="h-16 w-full rounded-[18px] border border-[#E4D8D6] bg-white/72 px-14 pr-16 text-base font-normal text-[#1F1F22] outline-none transition placeholder:text-neutral-400 focus:border-[#C79A98] focus:bg-white"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="パスワードを入力してください"
                    type={isPasswordVisible ? "text" : "password"}
                    value={password}
                  />
                  <button
                    aria-label={isPasswordVisible ? "パスワードを隠す" : "パスワードを表示"}
                    className="absolute right-4 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-none text-neutral-500 transition hover:bg-[#F8F4F3]"
                    onClick={() => setIsPasswordVisible((current) => !current)}
                    type="button"
                  >
                    {isPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </span>
                <span className="mt-3 block text-right text-sm font-medium text-[#B97B80]">パスワードをお忘れですか？</span>
              </label>
              <button
                className="h-16 w-full rounded-[18px] bg-[#D89499] px-4 text-lg font-semibold text-white shadow-[0_14px_34px_rgba(185,123,128,0.28)] transition hover:bg-[#C98186] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading || isSubmitting || !email || password.length < 6}
                type="submit"
              >
                {isSubmitting ? "処理中" : "ログイン"}
              </button>
              <StatusBanner message={message} type="error" />
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

function toAuthMessage(error: unknown): string {
  if (!(error instanceof Error)) return "ログインに失敗しました。";
  if (error.message.includes("auth/invalid-credential")) return "メールアドレスまたはパスワードが違います。";
  if (error.message.includes("auth/operation-not-allowed")) return "Firebase Consoleでメールログインを有効にしてください。";
  return error.message;
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6.5h16v11H4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 7 7.5 6 7.5-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 10V8a5 5 0 0 1 10 0v2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 10h12v10H6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 14v2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="m3 3 18 18" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.7 6.2A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.6 6.7A16.6 16.6 0 0 0 2.5 12s3.5 6 9.5 6c1.8 0 3.4-.5 4.7-1.2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
