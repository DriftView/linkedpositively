"use client";

import { useEffect } from "react";
import type { ColorThemeId } from "../catalog";
import "./color-themes.css";

/**
 * Applies a participant's colour theme (unlocked at level 6). Wrap the
 * participant shell with it: the wrapper themes the page on the server
 * render (no flash), and the effect also themes dialogs and sheets, which
 * render outside the wrapper. `display: contents` keeps layout unchanged.
 */
export function ColorThemeScope({ theme, children }: { theme: ColorThemeId; children?: React.ReactNode }) {
  useEffect(() => {
    applyColorTheme(theme);
    return () => applyColorTheme("theme-1");
  }, [theme]);

  if (theme === "theme-1") return <>{children}</>;
  return (
    <div data-color-theme={theme} className="contents">
      {children}
    </div>
  );
}

/** Instantly previews a theme on the whole document (used by the picker). */
export function applyColorTheme(theme: ColorThemeId) {
  const root = document.documentElement;
  if (theme === "theme-1") delete root.dataset.colorTheme;
  else root.dataset.colorTheme = theme;
}
