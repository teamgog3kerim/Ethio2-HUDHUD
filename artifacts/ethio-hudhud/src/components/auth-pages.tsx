import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Logo } from "@/components/logo";
import { Toggles } from "@/components/shell";
import { Skeleton } from "@/components/bits";
import { useApp } from "@/lib/app";
import { AUTH_SESSION_QUERY_KEY, submitAuth, useAuth, type AuthSession } from "@/lib/auth";
import { parsePlanChoice } from "@/lib/plan-choice";
import { paidPlanFromSearch, signInDestination, signUpDestination } from "@/lib/auth-flow";
import { cn } from "@/lib/utils";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

function safeReturn(): string | null {
  try {
    const raw = new URLSearchParams(window.location.search).get("redirect_url");
    if (!raw) return null;
    const u = new URL(raw, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    if (basePath && u.pathname !== basePath && !u.pathname.startsWith(basePath + "/")) return null;
    const p = stripBase(u.pathname);
    if (p.startsWith("/sign-in") || p.startsWith("/sign-up")) return null;
    return p + u.search + u.hash;
  } catch {
    return null;
  }
}

function AuthFrame({ children, mode }: { children: ReactNode; mode: "in" | "up" }) {
  const { t } = useApp();
  const { isLoaded, isSignedIn } = useAuth();
  const plan = parsePlanChoice(new URLSearchParams(window.location.search).get("plan"));
  const planSearch = plan ? `?plan=${plan}` : "";
  const paid = paidPlanFromSearch(window.location.search);
  const dest = paid ? signUpDestination(window.location.search) : safeReturn() ?? (mode === "up" ? "/learn" : "/start");
  if (isLoaded && isSignedIn) return <Redirect to={dest} replace />;
  const tab = (active: boolean) => cn("flex-1 rounded-xl px-4 py-2.5 text-center text-sm font-bold transition-colors", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground");
  return (
    <div className="grain grid min-h-[100dvh] grid-cols-1 bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden overflow-hidden bg-deep p-10 text-[hsl(75_30%_96%)] lg:flex lg:flex-col lg:justify-between">
        <span aria-hidden className="am pointer-events-none absolute -bottom-24 end-[-3rem] select-none text-[30rem] font-extrabold leading-none text-white/[0.06]">ሁ</span>
        <Link href="/" className="flex items-center gap-3"><Logo size={48} /><span className="font-display text-xl font-extrabold">HUDHUD</span></Link>
        <div className="relative">
          <h2 className="font-display text-4xl font-extrabold leading-snug">{mode === "in" ? t("أهلًا بعودتك. حروفك بانتظارك.", "Welcome back. Your letters are waiting.") : t("احفظ تقدّمك في الفيدل.", "Keep your Fidel progress safe.")}</h2>
          <p className="mt-3 max-w-sm text-white/70">{t("حسابك يحفظ دروسك ومراجعاتك على كل أجهزتك.", "Your account keeps lessons and reviews saved across devices.")}</p>
        </div>
        <p className="relative text-sm text-white/60">{t("ابدأ بحساب من اسمك واسم مستخدم وكلمة مرور.", "Create an account with your name, username, and password.")}</p>
      </aside>
      <div className="relative flex min-w-0 w-full flex-col items-center gap-4 px-4 pb-8 pt-4 lg:justify-center lg:py-10">
        <div className="flex w-full max-w-[440px] items-center justify-between lg:absolute lg:end-4 lg:top-4 lg:max-w-none lg:w-auto">
          <Link href="/" className="flex items-center gap-2 lg:hidden" data-testid="link-brand-auth"><Logo size={36} /><span className="font-display text-lg font-extrabold">HUDHUD</span></Link>
          <Toggles />
        </div>
        <nav className="flex w-[440px] max-w-full gap-1 rounded-2xl border border-border bg-card p-1" aria-label={t("نوع الحساب", "Account")}>
          <Link href={`/sign-in${planSearch}`} aria-current={mode === "in" ? "page" : undefined} className={tab(mode === "in")} data-testid="tab-signin">{t("تسجيل الدخول", "Sign in")}</Link>
          <Link href={`/sign-up${planSearch}`} aria-current={mode === "up" ? "page" : undefined} className={tab(mode === "up")} data-testid="tab-signup">{t("إنشاء حساب", "Create account")}</Link>
        </nav>
        {!isLoaded ? <div className="w-[440px] max-w-full space-y-3 rounded-3xl border border-border bg-card p-8" role="status"><Skeleton className="mx-auto h-12 w-12" /><Skeleton className="mx-auto h-6 w-48" /><Skeleton className="h-11" /><Skeleton className="h-11" /></div> : children}
        <p className="max-w-[440px] text-center text-xs text-muted-foreground">
          {t("بالمتابعة فأنت توافق على ", "By continuing you agree to the ")}
          <Link href="/terms" className="underline" data-testid="link-terms-auth">{t("الشروط", "Terms")}</Link>
          {t(" و", " and ")}
          <Link href="/privacy" className="underline" data-testid="link-privacy-auth">{t("الخصوصية", "Privacy")}</Link>.
        </p>
      </div>
    </div>
  );
}

function AuthForm({ mode }: { mode: "in" | "up" }) {
  const { t } = useApp();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const dest = mode === "up"
    ? signUpDestination(window.location.search)
    : paidPlanFromSearch(window.location.search)
      ? signInDestination(window.location.search)
      : safeReturn() ?? "/start";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setError("");
    setPending(true);
    try {
      const session = await submitAuth(mode === "up" ? "register" : "login", {
        ...(mode === "up" ? { fullName: fullName.trim() } : {}),
        username: username.trim(),
        password,
      });
      qc.setQueryData<AuthSession>(AUTH_SESSION_QUERY_KEY, session);
      if (mode === "up" && session.user) {
        try { window.sessionStorage.setItem("hudhud:signup-welcome", session.user.id); } catch { /* welcome is optional */ }
      }
      navigate(dest, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("تعذّر تسجيل الدخول. حاول مرة أخرى.", "Sign-in failed. Please try again."));
    } finally {
      setPending(false);
    }
  };

  const input = "h-12 w-full rounded-2xl border border-input bg-background px-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
  return (
    <section className="w-[440px] max-w-full rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7" aria-labelledby="auth-title">
      <h1 id="auth-title" className="font-display text-2xl font-extrabold">{mode === "in" ? t("أهلًا بعودتك", "Welcome back") : t("أنشئ حسابك", "Create your account")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{mode === "in" ? t("أدخل اسم المستخدم وكلمة المرور لمتابعة دروسك.", "Enter your username and password to continue learning.") : t("لا تحتاج إلى بريد إلكتروني لإنشاء حساب.", "No email address is needed to create an account.")}</p>
      <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
        {mode === "up" && <label className="block text-sm font-semibold">{t("الاسم الكامل", "Full name")}<input className={`${input} mt-1.5`} autoComplete="name" value={fullName} maxLength={80} required minLength={2} onChange={event => setFullName(event.target.value)} data-testid="input-full-name" /></label>}
        <label className="block text-sm font-semibold">{t("اسم المستخدم", "Username")}
          <input className={`${input} mt-1.5`} dir="ltr" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete={mode === "in" ? "username" : "username"} value={username} minLength={3} maxLength={24} pattern="[A-Za-z0-9_]{3,24}" required onChange={event => setUsername(event.target.value)} data-testid="input-username" />
          {mode === "up" && <span className="mt-1 block text-xs font-normal text-muted-foreground">{t("من 3 إلى 24 حرفًا بالإنجليزية أو رقمًا أو _", "3–24 letters, numbers, or underscores")}</span>}
        </label>
        <label className="block text-sm font-semibold">{t("كلمة المرور", "Password")}
          <input className={`${input} mt-1.5`} dir="ltr" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} minLength={mode === "up" ? 10 : 1} maxLength={128} required onChange={event => setPassword(event.target.value)} data-testid="input-password" />
          {mode === "up" && <span className="mt-1 block text-xs font-normal text-muted-foreground">{t("استخدم 10 أحرف على الأقل. لا يوجد استرداد بالبريد الإلكتروني.", "Use at least 10 characters. Email-based password recovery is not available.")}</span>}
        </label>
        {error && <p role="alert" className="flex gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-auth-error"><AlertTriangle className="size-4 shrink-0" />{error}</p>}
        <button type="submit" disabled={pending} className="press inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 font-bold text-primary-foreground disabled:opacity-60" data-testid={mode === "in" ? "button-login" : "button-register"}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? t("جارٍ التحقق…", "Please wait…") : mode === "in" ? t("تسجيل الدخول", "Sign in") : t("إنشاء الحساب وبدء التعلّم", "Create account and start learning")}
        </button>
      </form>
    </section>
  );
}

export function SignInPage() {
  return <AuthFrame mode="in"><AuthForm mode="in" /></AuthFrame>;
}

export function SignUpPage() {
  return <AuthFrame mode="up"><AuthForm mode="up" /></AuthFrame>;
}
