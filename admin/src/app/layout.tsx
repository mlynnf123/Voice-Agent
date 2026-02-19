import type { Metadata } from "next"
import { Montserrat } from "next/font/google"
import "./globals.css"
import { Sidebar } from "@/components/sidebar"

const montserrat = Montserrat({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Voice Agent Admin",
  description: "Admin dashboard for Voice Agent",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={montserrat.className}>
        <div className="flex h-screen">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
