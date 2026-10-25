/** Multi-tenant workspace and session directory provisioning with UUIDv7. @module @deepseek-ai/dsh-google-account/workspace-provisioner */
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { uuidv7 } from '@deepseek-ai/dsh-util-crypto';
/**
 * Determine the root path for workspaces based on environment and OS.
 */
export function resolveWorkspacesRoot() {
    if (process.env.DSH_WORKSPACES_ROOT) {
        return resolve(process.env.DSH_WORKSPACES_ROOT);
    }
    if (process.platform === 'linux') {
        return '/srv/workspaces';
    }
    // On macOS/other: default to ~/srv/workspaces unless /srv/workspaces is writable
    try {
        if (existsSync('/srv/workspaces'))
            return '/srv/workspaces';
    }
    catch {
        // Ignore permissions check failure
    }
    return resolve(join(homedir(), 'srv/workspaces'));
}
/**
 * Provision the complete multi-tenant filesystem hierarchy for a user.
 *
 * Structure:
 * <workspacesRoot>/
 * └── <user_uuidv7>/
 *     ├── tmp/
 *     └── <workspace_uuidv7>/
 *         └── .dsh/
 *             ├── attachments/
 *             └── sessions/
 *                 └── <session_uuidv7>/
 *
 * @param userId - User UUIDv7 (anonymous or authenticated)
 * @param existingWorkspaceId - Optional existing workspace ID to reuse
 */
export function provisionUserWorkspace(userId, existingWorkspaceId) {
    const workspacesRoot = resolveWorkspacesRoot();
    const userRoot = join(workspacesRoot, userId);
    const userTmp = join(userRoot, 'tmp');
    const workspaceId = existingWorkspaceId ?? uuidv7();
    const workspacePath = join(userRoot, workspaceId);
    const dshPath = join(workspacePath, '.dsh');
    const sessionsPath = join(dshPath, 'sessions');
    const attachmentsPath = join(dshPath, 'attachments');
    const defaultSessionId = uuidv7();
    const defaultSessionPath = join(sessionsPath, defaultSessionId);
    // Recursively ensure all directories exist
    mkdirSync(userTmp, { recursive: true });
    mkdirSync(sessionsPath, { recursive: true });
    mkdirSync(attachmentsPath, { recursive: true });
    mkdirSync(defaultSessionPath, { recursive: true });
    return {
        workspacesRoot,
        userId,
        userRoot,
        userTmp,
        workspaceId,
        workspacePath,
        dshPath,
        sessionsPath,
        attachmentsPath,
        defaultSessionId,
        defaultSessionPath,
    };
}
//# sourceMappingURL=workspace-provisioner.js.map