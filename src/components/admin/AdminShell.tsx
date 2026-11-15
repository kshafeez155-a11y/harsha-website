import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Building2,
  CalendarDays,
  ChevronRight,
  FileText,
  Handshake,
  LayoutDashboard,
  MapPin,
  Mail,
  LogOut,
  Menu,
  MessageSquare,
  Network,
  Rocket,
  Settings,
  Users,
  X,
} from "lucide-react";

import { supabase } from "@/lib/supabase";

type AdminShellProps = {
  children: ReactNode;
  title?: string;
  description?: string;
};

const navigation = [
  { label: "Dashboard", to: "/admin", icon: LayoutDashboard },
  { label: "Hub Management", to: "/admin/hubs", icon: MapPin },
  { label: "Manage Startups", to: "/admin/portfolio", icon: Rocket },
  { label: "Startup Applications", to: "/admin/startups", icon: Building2 },
  { label: "Chapter Applications", to: "/admin/chapters", icon: Network },
  { label: "Community Applications", to: "/admin/community", icon: Users },
  { label: "Event Registrations", to: "/admin/events", icon: CalendarDays },
  { label: "Meeting Registrations", to: "/admin/meetings", icon: MessageSquare },
  { label: "Partner Applications", to: "/admin/partners", icon: Handshake },
  { label: "Founder Connections", to: "/admin/founders", icon: Users },
  { label: "Pitch Deck Submissions", to: "/admin/pitch-decks", icon: FileText },
  { label: "Contact Messages", to: "/admin/messages", icon: Mail },
  { label: "Settings", to: "/admin/settings", icon: Settings },
] as const;

export function AdminShell({ children, title, description }: AdminShellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("[Admin] Sign out failed", error);
      return;
    }

    await navigate({ to: "/admin/login" });
  }

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-slate-200 bg-slate-950 px-4 py-5 text-white transition-transform duration-200 lg:translate-x-0 ${isMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-3 pb-7">
          <Link
            to="/admin"
            className="flex items-center gap-3"
            onClick={() => setIsMenuOpen(false)}
          >
            <span className="grid size-10 place-items-center rounded-xl bg-[#d9f85a] text-lg font-black text-slate-950">
              H
            </span>
            <span>
              <span className="block text-lg font-bold tracking-tight">Hanova</span>
              <span className="block text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Admin portal
              </span>
            </span>
          </Link>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setIsMenuOpen(false)}
            className="rounded-md p-2 text-slate-400 hover:bg-white/10 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Admin navigation">
          {navigation.map(({ label, to, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/admin" }}
              activeProps={{ className: "bg-[#d9f85a] text-slate-950" }}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              onClick={() => setIsMenuOpen(false)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-4 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut size={18} strokeWidth={1.8} />
          Log out
        </button>
      </aside>

      {isMenuOpen && (
        <button
          type="button"
          aria-label="Close menu overlay"
          onClick={() => setIsMenuOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
        />
      )}

      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-20 flex min-h-16 items-center border-b border-slate-200 bg-[#f6f8fb]/95 px-4 backdrop-blur sm:px-8 lg:px-10">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setIsMenuOpen(true)}
            className="mr-3 rounded-md p-2 text-slate-600 hover:bg-slate-200 lg:hidden"
          >
            <Menu size={21} />
          </button>
          <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
            <Activity size={16} />
            <span className="truncate">Hanova operations</span>
            {title && <ChevronRight size={15} />}
            {title && <span className="truncate font-medium text-slate-900">{title}</span>}
          </div>
        </header>
        <main className="px-4 py-8 sm:px-8 lg:px-10">
          {description && <p className="mb-1 text-sm text-slate-500">{description}</p>}
          {children}
        </main>
      </div>
    </div>
  );
}
