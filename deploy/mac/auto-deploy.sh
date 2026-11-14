#!/bin/zsh
# Poll origin/main and redeploy the Mac host when it moves.
#
# Runs under launchd with KeepAlive, so a crash or a reboot restarts the loop.
# The deploy itself is `deploy/mac/install.sh`: build, publish the bundle,
# reload the services, health-check.
#
# The merge is `--ff-only` on purpose. If the checkout has diverged or carries
# local edits, this refuses and logs instead of discarding anyone's work —
# fixing that is a human decision.
set -u

# Where this script runs from decides how it finds the checkout:
#   <repo>/deploy/mac/auto-deploy.sh   → three levels up is the repo
#   $HARNESS_ROOT/config/auto-deploy.sh → read the path install.sh recorded
# `paths.env` is written by install.sh from its own location, so the checkout
# may live anywhere; nothing here hardcodes a directory.
script_dir="${0:A:h}"
HARNESS_ROOT="${HARNESS_ROOT:-${script_dir:h}}"
if [ -f "$HARNESS_ROOT/config/paths.env" ]; then
	source "$HARNESS_ROOT/config/paths.env"
fi
if [ -z "${REPO_ROOT:-}" ] || [ ! -d "$REPO_ROOT/.git" ]; then
	REPO_ROOT="${script_dir:h:h}"
fi

INTERVAL="${AUTODEPLOY_INTERVAL:-60}"

cd "$REPO_ROOT" || exit 1

log() {
	print -r -- "[$(date '+%Y-%m-%dT%H:%M:%S')] $*"
}

log "auto-deploy watching origin/main every ${INTERVAL}s in $REPO_ROOT"

while true; do
	if ! git fetch --quiet origin main 2>/dev/null; then
		log "fetch failed (offline or auth); will retry"
		sleep "$INTERVAL"
		continue
	fi

	local_rev="$(git rev-parse HEAD)"
	remote_rev="$(git rev-parse origin/main)"

	if [ "$local_rev" != "$remote_rev" ]; then
		if git merge-base --is-ancestor "$local_rev" "$remote_rev"; then
			lock_before="$(shasum pnpm-lock.yaml 2>/dev/null | cut -d' ' -f1)"
			log "deploying ${local_rev:0:8} -> ${remote_rev:0:8}"
			if git merge --ff-only origin/main >/dev/null 2>&1; then
				lock_after="$(shasum pnpm-lock.yaml 2>/dev/null | cut -d' ' -f1)"
				if [ "$lock_before" != "$lock_after" ]; then
					log "lockfile changed; installing dependencies"
					if ! pnpm install --frozen-lockfile; then
						log "pnpm install FAILED; leaving the running build in place"
						sleep "$INTERVAL"
						continue
					fi
				fi
				if ./deploy/mac/install.sh; then
					log "deploy succeeded at ${remote_rev:0:8}"
				else
					log "deploy FAILED at ${remote_rev:0:8}; check build output above"
				fi
			else
				log "fast-forward refused; local branch has diverged or is dirty"
			fi
		else
			log "local and origin/main diverged; not deploying (resolve manually)"
		fi
	fi

	sleep "$INTERVAL"
done
