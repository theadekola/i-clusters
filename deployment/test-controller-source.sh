#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "$0")/controller-source.sh"
stage=$(mktemp -d)
trap 'rm -rf -- "$stage"' EXIT
git init -q -b releases "$stage/remote"
git -C "$stage/remote" -c user.name=Fixture -c user.email=fixture@localhost commit --allow-empty -qm first
git clone -q "$stage/remote" "$stage/controller"
(cd "$stage/controller" && git branch -m production && mkdir "$stage/archive" && backup_controller_source "$stage/archive")
mkdir "$stage/restored"
(cd "$stage/restored" && restore_controller_source "$stage/archive" && test "$(git branch --show-current)" = production && test "$(git rev-parse --abbrev-ref '@{u}')" = origin/releases)
git -C "$stage/remote" -c user.name=Fixture -c user.email=fixture@localhost commit --allow-empty -qm second
git -C "$stage/restored" pull --quiet --ff-only
test "$(git -C "$stage/restored" rev-parse HEAD)" = "$(git -C "$stage/remote" rev-parse HEAD)"
rm "$stage/archive/update-branch"
mkdir "$stage/legacy"
(cd "$stage/legacy" && restore_controller_source "$stage/archive" && test "$(git rev-parse --abbrev-ref '@{u}')" = origin/releases)
mkdir "$stage/pinned" "$stage/pinned-archive"
(cd "$stage/controller" && git checkout -q --detach && backup_controller_source "$stage/pinned-archive")
(cd "$stage/pinned" && restore_controller_source "$stage/pinned-archive" && test -z "$(git branch --show-current)")
