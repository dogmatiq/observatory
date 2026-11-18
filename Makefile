# The frontend's sources live in the "web" directory, rather than in "src".
JS_SOURCE_FILES += $(shell PATH="$(PATH)" git-find web)

-include .makefiles/Makefile
-include .makefiles/pkg/go/v1/Makefile
-include .makefiles/pkg/js/v1/Makefile
-include .makefiles/pkg/js/v1/with-pnpm.mk
-include .makefiles/pkg/js/v1/with-tsc.mk
-include .makefiles/pkg/vscode/v1/Makefile
-include .makefiles/pkg/changelog/v2/Makefile
-include .makefiles/pkg/apm/v1/Makefile

# The Go makefile defines "release" with a single colon, so the Vite makefile's
# "release::" can't be included. Build the frontend in "precommit" and "ci"
# instead.
.PHONY: precommit ci
precommit:: vite-build
ci:: vite-build

.makefiles/%:
	@curl -sfL https://makefiles.dev/v1 | bash /dev/stdin "$@"
