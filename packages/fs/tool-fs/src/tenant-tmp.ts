/**
 * Tenant scratchpad and engine storage resolution helper.
 * Enforces pure per-user filesystem hierarchy:
 *   /srv/workspaces/<userId>/tmp/
 *   /srv/workspaces/<userId>/.dsh/sessions/
 *   /srv/workspaces/<userId>/.dsh/attachments/
 *
 * All generation and intermediate tools are strictly confined to `tmp/`.
 * All permanent attachments are committed via `save_asset` to `.dsh/attachments/`.
 *
 * @module @deepseek-ai/dsh-tool-fs/src/tenant-tmp
 */

import { existsSync, mkdirSync, readdirSync, realpathSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/**
 * Canonicalize filesystem path handling symlinks.
 * @param p - raw path string.
 * @returns normalized absolute path.
 */
export function normalizeFsPath(p: string): string {
  try {
    if (existsSync(p)) return realpathSync(p)
    const par = dirname(p)
    if (existsSync(par)) return resolve(realpathSync(par), basename(p))
  } catch {}
  return resolve(p)
}

/**
 * Resolve the user root directory (/srv/workspaces/<userId>) for a given path or session.
 * @param cwd - session working directory or file path if known.
 * @returns absolute directory path to the user root, or undefined if outside workspaces.
 */
export function resolveUserRoot(cwd?: string): string | undefined {
  const targetDir = cwd ? resolve(cwd) : process.cwd()
  const customRoot = process.env.DSH_WORKSPACES_ROOT
  const roots = customRoot
    ? [resolve(customRoot)]
    : ['/srv/workspaces', join(homedir(), 'srv', 'workspaces'), join(homedir(), 'srv/workspaces')]

  for (const root of roots) {
    const absRoot = resolve(root)
    const rel = relative(absRoot, targetDir)
    if (!rel.startsWith('..') && !isAbsolute(rel) && rel !== '') {
      const parts = rel.split(sep).filter(Boolean)
      if (parts.length > 0) {
        return join(absRoot, parts[0]!)
      }
    }
  }

  if (customRoot && existsSync(customRoot)) {
    try {
      const currentUser = process.env.USER ?? process.env.LOGNAME
      const entries = readdirSync(customRoot, { withFileTypes: true })
      const userDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name)
      const matched = (currentUser && userDirs.includes(currentUser)) ? currentUser : userDirs[0]
      if (matched) {
        return join(customRoot, matched)
      }
    } catch {}
  }

  return undefined
}

/**
 * Resolve the user-isolated temporary scratchpad directory (/srv/workspaces/<userId>/tmp).
 * @param cwd - session working directory or file path if known.
 * @returns absolute directory path to the user's private scratchpad.
 */
export function resolveTenantTmp(cwd?: string): string {
  const userRoot = resolveUserRoot(cwd)
  if (userRoot) {
    const userTmp = join(userRoot, 'tmp')
    try {
      mkdirSync(userTmp, { recursive: true })
      return userTmp
    } catch {}
  }

  const targetDir = cwd ? resolve(cwd) : process.cwd()
  const localTmp = join(targetDir, 'tmp')
  if (existsSync(localTmp)) return localTmp
  const parentTmp = join(dirname(targetDir), 'tmp')
  if (existsSync(parentTmp)) return parentTmp

  return tmpdir()
}

/**
 * Resolve the tenant user's `.dsh` internal state directory (/srv/workspaces/<userId>/.dsh).
 * Guarantees that internal engine state (sessions, storages, attachments) is stored
 * in the user's root `.dsh` directory, never host `~/.dsh`.
 *
 * @param cwd - session working directory or file path if known.
 * @returns absolute directory path to the user's `.dsh` directory.
 */
export function resolveTenantDshHome(cwd?: string): string {
  const envDshHome = process.env.DSH_HOME
  const globalDshHome = join(homedir(), '.dsh')
  if (envDshHome && resolve(envDshHome) !== resolve(globalDshHome)) {
    return resolve(envDshHome)
  }

  const userRoot = resolveUserRoot(cwd)
  if (userRoot) {
    const userDsh = join(userRoot, '.dsh')
    try {
      mkdirSync(userDsh, { recursive: true })
      mkdirSync(join(userDsh, 'sessions'), { recursive: true })
      mkdirSync(join(userDsh, 'attachments'), { recursive: true })
      return userDsh
    } catch {}
  }

  const targetDir = cwd ? resolve(cwd) : process.cwd()
  const localDsh = join(targetDir, '.dsh')
  if (existsSync(localDsh)) return localDsh

  return join(resolveTenantTmp(cwd), 'dsh-state')
}

/**
 * Check whether a resolved path resides inside the tenant's temporary scratchpad.
 * Strictly enforces that inside /srv/workspaces/<userId>/, all intermediate assets
 * must reside within /srv/workspaces/<userId>/tmp/.
 *
 * @param resolvedPath - canonical resolved filesystem path.
 * @param cwd - session working directory or file path if known.
 * @returns true if the path is inside an allowed temporary directory.
 */
export function isPathInTenantTmp(resolvedPath: string, cwd?: string): boolean {
  const target = normalizeFsPath(resolvedPath)
  const targetDir = normalizeFsPath(cwd ? resolve(cwd) : process.cwd())

  // 1. If inside the user root /srv/workspaces/<userId>/, enforce user tmp
  const userRoot = resolveUserRoot(targetDir)
  if (userRoot) {
    const userTmp = normalizeFsPath(join(userRoot, 'tmp'))
    const relToUserTmp = relative(userTmp, target)
    if (!relToUserTmp.startsWith('..') && !isAbsolute(relToUserTmp)) {
      return true
    }
    // Any path under userRoot that is outside userRoot/tmp is strictly prohibited
    const relToUser = relative(normalizeFsPath(userRoot), target)
    if (!relToUser.startsWith('..') && !isAbsolute(relToUser)) {
      return false
    }
  }

  // 2. If target is inside the working directory, it MUST reside within a 'tmp' subdirectory
  const relToCwd = relative(targetDir, target)
  if (!relToCwd.startsWith('..') && !isAbsolute(relToCwd) && relToCwd !== '') {
    const relParts = relToCwd.split(sep)
    return relParts.includes('tmp')
  }

  // 3. Fallback for external scratch files in OS tmpdir when working directory is not inside tmpdir
  const osTmp = normalizeFsPath(tmpdir())
  const relTargetToOs = relative(osTmp, target)
  const relCwdToOs = relative(osTmp, targetDir)
  const cwdInOsTmp = !relCwdToOs.startsWith('..') && !isAbsolute(relCwdToOs)
  if (!cwdInOsTmp && !relTargetToOs.startsWith('..') && !isAbsolute(relTargetToOs)) {
    return true
  }

  return false
}

/**
 * Enforce that a resolved path resides strictly within the user's temporary scratchpad.
 * Throws a descriptive error if the path points outside.
 * @param resolvedPath - canonical resolved filesystem path.
 * @param rawInputPath - the original path string supplied by the model/caller.
 * @param cwd - session working directory or file path if known.
 */
export function assertTenantTmpPath(resolvedPath: string, rawInputPath: string, cwd?: string): void {
  if (!isPathInTenantTmp(resolvedPath, cwd)) {
    throw new Error(
      `Unsupported output path: "${rawInputPath}". All generated and intermediate assets must strictly reside within the user temporary scratchpad (e.g. "tmp/${targetBasename(rawInputPath)}"). Writing outside the temporary directory is strictly prohibited.`,
    )
  }
}

function targetBasename(p: string): string {
  const parts = p.split(/[/\\]/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1]! : 'output'
}
