#!/usr/bin/env bash
npx --prefix /tmp tsx "$(dirname "$0")/src/index.ts" "$@"
