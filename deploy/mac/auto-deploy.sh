#!/bin/zsh
# Poll origin/main and redeploy the Mac host whenever the checkout changes.
#
# Runs under launchd with KeepAlive, so a crash or a reboot restarts the loop.
# The deploy itself is `deploy/mac/install.sh`: build, publish the bundle,
# render config, reload the services, health-check.
#
# Why a deployed-SHA stamp and not "remote moved": the usual case here is a
# commit made *in this checkout* and pushed from it. HEAD is already the new
# commit before the fetch ever sees it, so comparing HEAD to origin/main finds
# nothing to do and the running build silently stays old. The loop therefore
# compares HEAD against the SHA it last deployed.
#
# The merge is `--ff-only` on purpose: a diverged branch is reported, never
# reset, so no one's work is discarded.
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
STAMP="$HARNESS_ROOT/config/deployed.sha"
FAILED="$HARNESS_ROOT/config/deploy.failed"
MAX_ATTEMPTS=3

cd "$REPO_ROOT" || exit 1

log() {
	print -r -- "[$(date '+%Y-%m-%dT%H:%M:%S')] $*"
}

log "auto-deploy watching $REPO_ROOT every ${INTERVAL}s (deployed: $(cut -c1-8 "$STAMP" 2>/dev/null || print 'never'))"

while true; do
	if ! git fetch --quiet origin main 2>/dev/null; then
		log "fetch failed (offline or auth); will retry"
		sleep "$INTERVAL"
		continue
	fi

	head_rev="$(git rev-parse HEAD)"
	remote_rev="$(git rev-parse origin/main)"

	# Pull a remote-only advance first; then fall through to the stamp check
	# so a pulled commit and a locally-made commit follow the same path.
	if [ "$head_rev" != "$remote_rev" ]; then
		if git merge-base --is-ancestor "$head_rev" "$remote_rev"; then
			log "fast-forward ${head_rev:0:8} -> ${remote_rev:0:8}"
			if git merge --ff-only origin/main >/dev/null 2>&1; then
				head_rev="$(git rev-parse HEAD)"
			else
				log "fast-forward refused; leaving HEAD at ${head_rev:0:8}"
			fi
		elif git merge-base --is-ancestor "$remote_rev" "$head_rev"; then
			log "local is ahead of origin/main (unpushed work); deploying HEAD as-is"
		else
			log "local and origin/main diverged; not deploying (resolve manually)"
			sleep "$INTERVAL"
			continue
		fi
	fi

	deployed="$(cat "$STAMP" 2>/dev/null || true)"
	if [ "$head_rev" = "$deployed" ]; then
		sleep "$INTERVAL"
		continue
	fi

	# A commit that keeps failing would otherwise redeploy every cycle, taking
	# the services down and back up forever. Give up until HEAD changes.
	failed_rev="$(cut -d' ' -f1 "$FAILED" 2>/dev/null || true)"
	failed_count="$(cut -d' ' -f2 "$FAILED" 2>/dev/null || print 0)"
	if [ "$failed_rev" = "$head_rev" ] && [ "${failed_count:-0}" -ge "$MAX_ATTEMPTS" ]; then
		sleep "$INTERVAL"
		continue
	fi

	if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
		log "WARNING: tracked files have uncommitted edits; deploying anyway"
	fi

	lock_before="$(shasum pnpm-lock.yaml 2>/dev/null | cut -d' ' -f1)"
	# One build log per deploy: the viewer shows it under that deploy's own
	# entry, so a failure never points at another deploy's output. This file
	# also keeps the build from flooding the deploy event stream.
	mkdir -p "$HARNESS_ROOT/logs/builds"
	build_file="${head_rev:0:7}-$(date +%s).log"
	log "deploying ${head_rev:0:7} (build: builds/${build_file})"
	if ./deploy/mac/install.sh >> "$HARNESS_ROOT/logs/builds/$build_file" 2>&1; then
		lock_after="$(shasum pnpm-lock.yaml 2>/dev/null | cut -d' ' -f1)"
		if [ "$lock_before" != "$lock_after" ]; then
			log "lockfile changed; installing dependencies"
			pnpm install --frozen-lockfile || log "pnpm install FAILED (next deploy retries)"
		fi
		print -r -- "$head_rev" > "$STAMP"
		rm -f "$FAILED"
		log "deploy succeeded at ${head_rev:0:7}"
	else
		if [ "$failed_rev" = "$head_rev" ]; then
			attempts=$(( ${failed_count:-0} + 1 ))
		else
			attempts=1
		fi
		print -r -- "$head_rev $attempts" > "$FAILED"
		if [ "$attempts" -ge "$MAX_ATTEMPTS" ]; then
			log "deploy FAILED at ${head_rev:0:7} ($attempts/$MAX_ATTEMPTS) — giving up on this commit; push a fix to retry"
		else
			log "deploy FAILED at ${head_rev:0:7} ($attempts/$MAX_ATTEMPTS); install.sh rolled back, retrying next cycle"
		fi
	fi

	sleep "$INTERVAL"
done
