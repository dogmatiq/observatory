#!/bin/sh
# Runs the spike: a Node "Observatory" and a Go "engine". Exits non-zero unless
# the Node side prints RESULT: PASS.
set -e
cd "$(dirname "$0")"
[ -d certs ] || ./gen-certs.sh
(cd go && go build -o ../engine .)
(cd node && [ -d node_modules ] || npm ci)
node node/observatory.mjs > node.log 2>&1 &
pid=$!
sleep 1
./engine -certs certs || true
status=0
wait $pid || status=$?
cat node.log
exit $status
