/**
 * Tenant scratchpad resolution helper.
 * Resolves the private scratchpad directory (/srv/workspaces/<userId>/tmp)
 * for intermediate tool processing (audio cuts, video frames, ffmpeg chunks).
 * @module @deepseek-ai/dsh-tool-fs/src/tenant-tmp
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/**
 * Resolve the user-isolated temporary scratchpad directory.
 * @param cwd - session working directory or file path if known.
 * @returns absolute directory path to the user's private scratchpad.
 */
export function resolveTenantTmp(cwd?: string): string {
  const targetDir = cwd ? resolve(cwd) : process.cwd()
  const parentTmp = join(dirname(targetDir), 'tmp')
  if (existsSync(parentTmp)) return parentTmp
  const wsTmp = join(targetDir, 'tmp')
  if (existsSync(wsTmp)) return wsTmp

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
        const userId = parts[0]!
        const userTmp = join(absRoot, userId, 'tmp')
        try {
          mkdirSync(userTmp, { recursive: true })
          return userTmp
        } catch {}
      }
    }
  }

  if (cwd) {
    try {
      mkdirSync(parentTmp, { recursive: true })
      return parentTmp
    } catch {}
  }

  if (customRoot && existsSync(customRoot)) {
    try {
      const currentUser = process.env.USER ?? process.env.LOGNAME
      const entries = readdirSync(customRoot, { withFileTypes: true })
      const userDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name)
      const matched = (currentUser && userDirs.includes(currentUser)) ? currentUser : userDirs[0]
      if (matched) {
        const userTmp = join(customRoot, matched, 'tmp')
        mkdirSync(userTmp, { recursive: true })
        return userTmp
      }
    } catch {}
  }

  return tmpdir()
}

/**
 * Resolve the tenant workspace's `.dsh` internal state directory.
 * Guarantees that internal engine state (sessions, storages, attachments) is never
 * written to host `~/.dsh`.
 * @param cwd - session working directory or file path if known.
 * @returns absolute directory path to the workspace's `.dsh` directory.
 */
export function resolveTenantDshHome(cwd?: string): string {
  const envDshHome = process.env.DSH_HOME
  const globalDshHome = join(homedir(), '.dsh')
  if (envDshHome && resolve(envDshHome) !== resolve(globalDshHome)) {
    return resolve(envDshHome)
  }

  const targetDir = cwd ? resolve(cwd) : process.cwd()
  const wsDsh = join(targetDir, '.dsh')
  if (existsSync(wsDsh)) return wsDsh

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
        const userId = parts[0]!
        const userDir = join(absRoot, userId)
        if (parts.length > 1 && parts[1] !== 'tmp') {
          const tenantWsDsh = join(userDir, parts[1]!, '.dsh')
          mkdirSync(tenantWsDsh, { recursive: true })
          return tenantWsDsh
        }
        try {
          const wsEntries = readdirSync(userDir, { withFileTypes: true })
          const wsEntry = wsEntries.find(e => e.isDirectory() && e.name !== 'tmp' && !e.name.startsWith('.'))
          if (wsEntry) {
            const tenantWsDsh = join(userDir, wsEntry.name, '.dsh')
            mkdirSync(tenantWsDsh, { recursive: true })
            return tenantWsDsh
          }
        } catch {}
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
        const userDir = join(customRoot, matched)
        const wsEntries = readdirSync(userDir, { withFileTypes: true })
        const wsEntry = wsEntries.find(e => e.isDirectory() && e.name !== 'tmp' && !e.name.startsWith('.'))
        if (wsEntry) {
          const tenantWsDsh = join(userDir, wsEntry.name, '.dsh')
          mkdirSync(tenantWsDsh, { recursive: true })
          return tenantWsDsh
        }
      }
    } catch {}
  }

  return join(resolveTenantTmp(cwd), 'dsh-state')
}
