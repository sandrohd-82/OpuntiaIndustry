import Link from "next/link";
import { LogoPlaceholder } from "@/components/branding/LogoPlaceholder";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center">
        <LogoPlaceholder size="home" />
        <Link
          href="/login"
          className="mt-10 min-w-[10rem] rounded-lg bg-[var(--primary)] px-8 py-3 text-center text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
        >
          Login
        </Link>
      </div>
    </main>
  );
}
