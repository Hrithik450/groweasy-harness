/** Host half of the browser-only chat surface plugin. */

/**
 * No host-side behavior. The client half registers the conversation area into
 * `main`, declares its header/empty/composer/avatar/loader/thinking seats, and
 * registers the turn and message node renderers.
 */
export function apply(): void {}
