"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const links = [
  { href: "/agents", label: "Agents" },
  { href: "/", label: "Dashboard" },
  { href: "/knowledge", label: "Knowledge Base" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/calls", label: "Call History" },
  { href: "/test", label: "Make a Call" },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 border-r border-border bg-background flex flex-col">
      <div className="p-6 border-b border-border">
        <h1 className="text-sm font-semibold tracking-wide uppercase text-foreground">
          Voice Agent
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Admin</p>
      </div>
      <nav className="flex-1 p-3">
        {links.map((link) => {
          const isActive =
            pathname === link.href ||
            (link.href === "/agents" && pathname.startsWith("/agents")) ||
            (link.href === "/campaigns" && pathname.startsWith("/campaigns"))
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "block px-3 py-2 text-sm transition-colors",
                isActive
                  ? "text-foreground bg-card"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          )
        })}
      </nav>
      <div className="p-4 border-t border-border">
        <p className="text-xs text-muted-foreground">Server: localhost:5050</p>
      </div>
    </aside>
  )
}
