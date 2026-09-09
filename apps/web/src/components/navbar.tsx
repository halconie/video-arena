import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession, signOut } from "@/lib/auth-client";
import { AuthModal } from "@/components/auth-modal";

export function Navbar() {
  const { data: session, isPending } = useSession();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <nav className="flex items-center gap-6">
            <Link to="/" className="font-semibold tracking-tight">
              Video Arena
            </Link>
            <NavTab to="/">Video</NavTab>
            <NavTab to="/image">Image</NavTab>
            <NavTab to="/face-swap">Face Swap</NavTab>
            <NavTab to="/user/avatar">Avatar</NavTab>
            <NavTab to="/user/templates">Templates</NavTab>
            {(session?.user as { role?: string } | undefined)?.role ===
              "admin" && <NavTab to="/admin/template/create">Admin</NavTab>}
          </nav>

          <div>
            {isPending ? null : session ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-full">
                    <Avatar>
                      <AvatarImage src={session.user.image ?? undefined} />
                      <AvatarFallback>
                        {session.user.name?.[0]?.toUpperCase() ?? "U"}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-sm font-medium">{session.user.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.user.email}
                    </p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => signOut()}>
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button size="sm" onClick={() => setAuthOpen(true)}>
                Sign in
              </Button>
            )}
          </div>
        </div>
      </header>

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
}

function NavTab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          "text-sm hover:text-foreground",
          isActive ? "font-medium text-foreground" : "text-muted-foreground",
        )
      }
    >
      {children}
    </NavLink>
  );
}
