"use client";
import Link from "next/link";
import { LayoutDashboard, LogOut, Settings, Shield, User, Warehouse } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/common/avatar";
import { signOut } from "@/server/actions/auth";

export function UserMenu({ username, displayName, avatarUrl, isModerator }: { username: string; displayName: string | null; avatarUrl: string | null; isModerator: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
        <Avatar url={avatarUrl} name={displayName ?? username} size={30} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block text-sm text-foreground">{displayName ?? username}</span>
          <span className="figure">@{username}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard"><LayoutDashboard /> Dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/garage"><Warehouse /> Garage</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/profile/${username}`}><User /> Public profile</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings"><Settings /> Settings</Link>
        </DropdownMenuItem>
        {isModerator && (
          <DropdownMenuItem asChild>
            <Link href="/moderation"><Shield /> Moderation</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
