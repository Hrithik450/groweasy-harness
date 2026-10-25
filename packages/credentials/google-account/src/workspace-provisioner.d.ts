/** Multi-tenant workspace and session directory provisioning with UUIDv7. @module @deepseek-ai/dsh-google-account/workspace-provisioner */
export interface ProvisionedUserWorkspace {
    readonly workspacesRoot: string;
    readonly userId: string;
    readonly userRoot: string;
    readonly userTmp: string;
    readonly workspaceId: string;
    readonly workspacePath: string;
    readonly dshPath: string;
    readonly sessionsPath: string;
    readonly attachmentsPath: string;
    readonly defaultSessionId: string;
    readonly defaultSessionPath: string;
}
/**
 * Determine the root path for workspaces based on environment and OS.
 */
export declare function resolveWorkspacesRoot(): string;
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
export declare function provisionUserWorkspace(userId: string, existingWorkspaceId?: string): ProvisionedUserWorkspace;
//# sourceMappingURL=workspace-provisioner.d.ts.map