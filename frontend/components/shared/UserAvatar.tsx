"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { avatarGradient, resolveMemberColor } from "@/lib/memberColor";
import { cn } from "@/lib/utils";

const PROFILE_AVATAR_VERSION_MAP_KEY = "lumen-profile-avatar-version-map";

interface UserAvatarProps {
  displayName?: string | null;
  avatarUrl?: string | null;
  userId?: string | null;
  memberColor?: string | null;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  alt?: string;
}

function initialsFromName(displayName?: string | null): string {
  const trimmed = (displayName ?? "").trim();
  if (!trimmed) return "?";

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  }

  return trimmed.slice(0, 2).toUpperCase();
}

function appendVersion(url: string, version?: string | null): string {
  if (!version) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(version)}`;
}

function readAvatarVersion(userId?: string | null): string | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_AVATAR_VERSION_MAP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    const version = parsed[userId];
    return typeof version === "string" && version.trim() ? version : null;
  } catch {
    return null;
  }
}

export function UserAvatar({
  displayName,
  avatarUrl,
  userId,
  memberColor,
  className,
  imageClassName,
  fallbackClassName,
  alt,
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState<string | null>(null);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl, avatarVersion]);

  useEffect(() => {
    setAvatarVersion(readAvatarVersion(userId));
  }, [userId]);

  useEffect(() => {
    const refreshVersion = () => {
      setAvatarVersion(readAvatarVersion(userId));
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === PROFILE_AVATAR_VERSION_MAP_KEY) refreshVersion();
    };
    const onCustom = () => refreshVersion();

    window.addEventListener("storage", onStorage);
    window.addEventListener("lumen:profile-avatar-updated", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("lumen:profile-avatar-updated", onCustom as EventListener);
    };
  }, [userId]);

  const fallback = useMemo(() => initialsFromName(displayName), [displayName]);
  const color = resolveMemberColor(userId, memberColor);
  const resolvedAvatarUrl =
    typeof avatarUrl === "string" && avatarUrl.trim()
      ? appendVersion(avatarUrl, avatarVersion)
      : null;
  const canRenderImage = Boolean(resolvedAvatarUrl) && !imageFailed;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white",
        className,
      )}
      style={{ background: avatarGradient(color) }}
    >
      {canRenderImage ? (
        <Image
          src={resolvedAvatarUrl as string}
          alt={alt ?? displayName ?? "user avatar"}
          fill
          sizes="64px"
          unoptimized
          className={cn("object-cover", imageClassName)}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className={fallbackClassName}>{fallback}</span>
      )}
    </div>
  );
}
