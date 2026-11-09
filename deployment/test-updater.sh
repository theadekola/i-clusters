#!/usr/bin/env bash
set -Eeuo pipefail
project=$PWD
temporary=$(mktemp -d)
trap 'rm -rf -- "$temporary"' EXIT
mkdir -p "$temporary/repo/runtime" "$temporary/status" "$temporary/bin"
sed -e "s|/opt/i-clusters|$temporary/repo|g" -e "s|/var/lib/iclusters-updater|$temporary/status|g" -e "s|/run/iclusters-updater.lock|$temporary/lock|g" -e "s|/usr/local/bin/iclusters|$temporary/bin/iclusters|g" "$project/deployment/iclusters-updater" > "$temporary/worker"
cat > "$temporary/bin/git" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  symbolic-ref) exit 0;;
  merge-base) exit 0;;
  fetch) grep -q '"state":"checking"' "$FIXTURE/status/update-status.json" || exit 1; if [[ -e "$FIXTURE/retain" ]]; then grep -q '"available":true' "$FIXTURE/status/update-status.json" || exit 1; fi; [[ ! -e "$FIXTURE/fail-fetch" ]]; exit $?;;
  log) printf '%s\n' 'Merge pull request #151 from branch' 'Fix "SSH" popup' 'Fix "SSH" popup' 'Improve update review';;
  rev-parse) if [[ $2 == HEAD ]]; then cat "$FIXTURE/current"; else cat "$FIXTURE/upstream"; fi;;
esac
EOF
cat > "$temporary/bin/iclusters" <<'EOF'
#!/usr/bin/env bash
[[ $1 == update && $2 == "$reviewed" ]] || exit 1
[[ $ICLUSTERS_UPDATE_STATUS_FILE == "$FIXTURE/status/update-status.json" ]] || exit 1
[[ ! -e "$FIXTURE/repo/runtime/update-request.json" ]] || exit 1
grep -q '"state":"updating"' "$FIXTURE/status/update-status.json"
if [[ -e "$FIXTURE/fail" ]]; then exit 1; fi
echo "$reviewed" > "$FIXTURE/current"
EOF
chmod +x "$temporary/bin/"*
installed=$(printf 'a%.0s' {1..40})
reviewed=$(printf 'b%.0s' {1..40})
printf '%s\n' "$reviewed" > "$temporary/upstream"
approve(){ printf '{"revision":"%s"}\n' "$reviewed" > "$temporary/repo/runtime/update-request.json"; }
export reviewed
export FIXTURE=$temporary PATH="$temporary/bin:$PATH"
echo "$installed" > "$temporary/current"
bash "$temporary/worker"
grep -q '"available":true' "$temporary/status/update-status.json"
python3 - "$temporary/status/update-status.json" <<'PYTHON'
import json, sys
status = json.load(open(sys.argv[1]))
assert status['changes'] == ['Fix "SSH" popup', 'Improve update review']
PYTHON
touch "$temporary/retain"
bash "$temporary/worker"
touch "$temporary/fail-fetch"
if bash "$temporary/worker"; then exit 1; fi
grep -q '"available":true' "$temporary/status/update-status.json"
rm "$temporary/retain" "$temporary/fail-fetch"
approve
bash "$temporary/worker"
grep -q '"state":"completed"' "$temporary/status/update-status.json"
python3 -c 'import json,sys; s=json.load(open(sys.argv[1])); assert s["progress"]["percent"]==100; assert "health checks passed" in s["progress"]["stage"]' "$temporary/status/update-status.json"
grep -q '"available":false' "$temporary/status/update-status.json"
echo '{"checkId":"fixture-check"}' > "$temporary/repo/runtime/update-check.json"
bash "$temporary/worker"
grep -q '"checkId":"fixture-check"' "$temporary/status/update-status.json"
grep -q '"message":"Up to date."' "$temporary/status/update-status.json"
test ! -e "$temporary/repo/runtime/update-check.json"
echo "$installed" > "$temporary/current"
touch "$temporary/fail"
approve
if bash "$temporary/worker"; then exit 1; fi
grep -q '"state":"failed"' "$temporary/status/update-status.json"
test ! -e "$temporary/repo/runtime/update-request.json"

# A release published after approval remains a separate available update.
rm -f "$temporary/fail"
printf 'c%.0s' {1..40} > "$temporary/upstream"
approve
bash "$temporary/worker"
python3 - "$temporary/status/update-status.json" <<'PYTHON'
import json,sys
status=json.load(open(sys.argv[1]))
assert status['current']=='b'*40 and status['latest']=='c'*40
assert status['state']=='completed' and status['available']
PYTHON
echo '{}' > "$temporary/repo/runtime/update-request.json"
bash "$temporary/worker"
grep -q '"state":"failed"' "$temporary/status/update-status.json"
echo 'Updater availability, approved revision and failure handling passed.'
