#!/usr/bin/env node
/**
 * Command-line entry for dsh.
 * @module @deepseek-ai/dsh/bin
 */

/* v8 ignore file -- built-bin acceptance exercises this self-executing dispatch. */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  getDshRuntimeVersion,
  loadLayeredEnv,
  StartupError,
} from "@deepseek-ai/dsh-app-boot";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { parseDshArgs } from "./args.ts";
import { reportStartupFailure } from "./startup-diagnostics.ts";
import type { RunProfileOptions } from "./profile-boot.ts";

/** Installation-owned dependencies supplied by a packaged CLI launcher. */
export type RunCliOptions = Pick<RunProfileOptions, "packageManager"> & {
  /** Permit plugin commands for Desktop's existing profile; reserved for its installed carrier. */
  manageDesktopProfile?: boolean;
};

/**
 * Run the public dsh command-line interface.
 * @param options - Package runtime and Desktop profile access supplied by the installation.
 * @returns a promise that settles when the selected command mode finishes.
 */
export async function runCli(options: RunCliOptions = {}): Promise<void> {
  if (process.env.DSH_HOME === undefined) {
    const cwd = resolve(process.cwd());
    const customRoot = process.env.DSH_WORKSPACES_ROOT;
    const home = homedir();
    const candidateRoots = customRoot
      ? [resolve(customRoot)]
      : [
          "/srv/workspaces",
          join(home, "srv", "workspaces"),
          join(home, "srv/workspaces"),
        ];
    let tenantDshHome: string | undefined;
    for (const root of candidateRoots) {
      const absRoot = resolve(root);
      const rel = relative(absRoot, cwd);
      if (!rel.startsWith("..") && !isAbsolute(rel) && rel !== "") {
        const parts = rel.split(sep).filter(Boolean);
        if (parts.length > 0) {
          const userDir = join(absRoot, parts[0]!);
          if (parts.length > 1 && parts[1] !== "tmp") {
            const wsDsh = join(userDir, parts[1]!, ".dsh");
            mkdirSync(wsDsh, { recursive: true });
            tenantDshHome = wsDsh;
            break;
          }
          try {
            const entries = readdirSync(userDir, { withFileTypes: true })
              .filter(
                (e) =>
                  e.isDirectory() && e.name !== "tmp" && !e.name.startsWith("."),
              )
              .map((e) => e.name);
            if (entries.length > 0) {
              const wsDsh = join(userDir, entries[0]!, ".dsh");
              mkdirSync(wsDsh, { recursive: true });
              tenantDshHome = wsDsh;
              break;
            }
          } catch {}
        }
      }
    }
    if (tenantDshHome === undefined && customRoot && existsSync(customRoot)) {
      try {
        const currentUser = process.env.USER ?? process.env.LOGNAME;
        const userDirs = readdirSync(customRoot, { withFileTypes: true })
          .filter((e) => e.isDirectory() && !e.name.startsWith("."))
          .map((e) => e.name);
        const matchedUser =
          currentUser && userDirs.includes(currentUser)
            ? currentUser
            : userDirs[0];
        if (matchedUser) {
          const userDir = join(customRoot, matchedUser);
          const entries = readdirSync(userDir, { withFileTypes: true })
            .filter(
              (e) =>
                e.isDirectory() && e.name !== "tmp" && !e.name.startsWith("."),
            )
            .map((e) => e.name);
          if (entries.length > 0) {
            const wsDsh = join(userDir, entries[0]!, ".dsh");
            mkdirSync(wsDsh, { recursive: true });
            tenantDshHome = wsDsh;
          }
        }
      } catch {}
    }
    process.env.DSH_HOME = tenantDshHome ?? resolveDshHome();
  }
  const dshHome = process.env.DSH_HOME;
  const globalHome = join(homedir(), ".dsh");
  const candidateBins = [join(dshHome, "bin"), join(globalHome, "bin")];
  for (const dir of [join(dshHome, "tools"), join(globalHome, "tools")]) {
    if (existsSync(dir)) {
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            candidateBins.push(join(dir, entry.name, "bin"));
          }
        }
      } catch {
        // ignore
      }
    }
  }
  const currentPath = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const toAdd = candidateBins.filter(
    (p) => existsSync(p) && !currentPath.includes(p),
  );
  if (toAdd.length > 0) {
    process.env.PATH = [...toAdd, ...currentPath].join(delimiter);
  }
  const ffmpegCandidates = [
    join(
      dshHome,
      "tools",
      "ffmpeg",
      "bin",
      process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
    ),
    join(
      globalHome,
      "tools",
      "ffmpeg",
      "bin",
      process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
    ),
  ];
  const ffmpegBinary = ffmpegCandidates.find((p) => existsSync(p));
  if (ffmpegBinary && process.env.FFMPEG_PATH === undefined) {
    process.env.FFMPEG_PATH = ffmpegBinary;
  }
  const version = getDshRuntimeVersion();
  const { manageDesktopProfile, ...profileOptions } = options;
  const invocation = parseDshArgs(
    process.argv.slice(2),
    version,
    manageDesktopProfile,
  );

  switch (invocation.mode) {
    case "profile": {
      const { runProfile } = await import("./profile-boot.ts");
      try {
        await runProfile({
          environment: loadLayeredEnv("dsh"),
          profile: invocation.profile,
          fromDefaultProfile: invocation.fromDefaultProfile,
          patchFiles: invocation.patches,
          args: invocation.args,
          ...profileOptions,
        });
      } catch (error) {
        if (!(error instanceof StartupError)) throw error;
        await reportStartupFailure(error, {
          home: resolveDshHome(),
          version,
          profile: invocation.profile,
        });
        process.exit(1);
      }
      break;
    }
    case "plugin": {
      const { runPlugin } = await import("./plugin.ts");
      process.exit(
        await runPlugin(
          invocation.profile,
          invocation.args,
          options.packageManager,
        ),
      );
      break;
    }
    case "dump-config": {
      const { runDumpConfig } = await import("./dump-config.ts");
      runDumpConfig(
        invocation.profile,
        invocation.defaultOnly,
        invocation.patches,
        invocation.fromDefaultProfile,
      );
      break;
    }
    case "dump-config-schema": {
      const { runDumpConfigSchema } = await import("./dump-config-schema.ts");
      await runDumpConfigSchema(
        invocation.profile,
        invocation.patches,
        invocation.fromDefaultProfile,
      );
      break;
    }
    default:
      invocation satisfies never;
      throw new Error(
        `dsh: unhandled invocation mode ${JSON.stringify(invocation)}`,
      );
  }
}

if (import.meta.main) {
  await runCli();
}
