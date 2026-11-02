# @openai-harness/paths

Project-local filesystem roots. `PROJECT_ROOT` is derived from the module's
own location, so runtime state lands in the checkout no matter the working
directory. `dataRoot()` honours `DATA_ROOT` (relative values resolve against
the project root) and otherwise returns `<project>/data`; `dataPath()` joins
segments below it and `fromProjectRoot()` resolves configured relative paths.

What it owns:
- the project root, data root, and their path helpers.

What it does not own:
- which files are stored — callers name their own layout below `dataPath()`;
- session or attachment storage — those packages own their trees.

Source reference: `packages/util/home-paths` in the reference deepseek-harness
repository, narrowed from an OS home root to a single project root.
