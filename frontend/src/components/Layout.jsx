import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Film } from "lucide-react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", testid: "nav-dashboard" },
  { to: "/new", label: "New Project", testid: "nav-new-project" },
  { to: "/settings", label: "Settings", testid: "nav-settings" },
];

export default function Layout({ children }) {
  const loc = useLocation();
  return (
    <div className="min-h-screen">
      <header className="glass-nav sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
          <Link to="/" data-testid="nav-home" className="flex items-center gap-2 group">
            <Film className="w-5 h-5 text-[#E5B83B]" strokeWidth={1.5} />
            <span className="font-display text-lg tracking-tight group-hover:text-[#E5B83B] transition-colors">
              BEATVISION
            </span>
          </Link>
          <nav className="flex items-center gap-1 md:gap-2">
            {NAV.map((n) => {
              const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  data-testid={n.testid}
                  className={`overline px-2 md:px-3 py-2 transition-colors ${
                    active ? "text-[#E5B83B]" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="max-w-7xl mx-auto px-5 md:px-8 py-10 mt-16 border-t border-white/5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="font-display text-lg">BEATVISION</div>
          <div className="overline text-neutral-500">
            Every Song Has A World · MVP Preview
          </div>
        </div>
      </footer>
    </div>
  );
}
