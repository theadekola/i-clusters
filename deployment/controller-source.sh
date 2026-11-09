# Save the Git information needed by both CLI and dashboard updates.
# Run backup in the installation and restore in the extracted source directory.
backup_controller_source(){
 local stage=$1 branch remote merge upstream
 git rev-parse HEAD > "$stage/revision"
 git remote get-url origin > "$stage/origin"
 branch=$(git symbolic-ref -q --short HEAD) || branch=''
 remote=$(git config --get "branch.$branch.remote") || remote=''
 merge=$(git config --get "branch.$branch.merge") || merge=''
 if [[ -n $branch && $remote == origin && $merge == refs/heads/* ]]; then
   upstream=$(git rev-parse --symbolic-full-name '@{upstream}')
   git bundle create "$stage/source.bundle" HEAD "$upstream"
   printf '%s\n%s\n' "$branch" "${merge#refs/heads/}" > "$stage/update-branch"
 else
   git bundle create "$stage/source.bundle" HEAD
   printf '\n' > "$stage/update-branch"
 fi
}

restore_controller_source(){
 local stage=$1 requested=${2:-} revision branch='' upstream='' tracked='' saved_ref=''
 revision=$(cat "$stage/revision")
 git init -b main --quiet
 git fetch --quiet --no-tags "$stage/source.bundle" HEAD
 [[ $(git rev-parse FETCH_HEAD) == "$revision" ]] || { echo 'Backup revision mismatch.' >&2; return 1; }
 # Keep the verified extracted files, including any locally configured Compose file.
 git update-ref --no-deref HEAD "$revision"
 git reset --mixed --quiet "$revision"
 git remote add origin "$(cat "$stage/origin")"
 if [[ -n $requested ]]; then
   branch=$requested; upstream=$requested
 elif [[ -f $stage/update-branch ]]; then
   branch=$(sed -n '1p' "$stage/update-branch")
   upstream=$(sed -n '2p' "$stage/update-branch")
   [[ -z $upstream ]] || saved_ref="refs/remotes/origin/$upstream"
 else
   # Older archives only recorded HEAD. Identify a unique remote branch containing it.
   if GIT_TERMINAL_PROMPT=0 timeout 15 git fetch --quiet --no-tags origin; then
     tracked=$(git for-each-ref --contains="$revision" --format='%(if)%(symref)%(then)%(else)%(refname:lstrip=3)%(end)' refs/remotes/origin | sed '/^$/d')
     if [[ -n $tracked && $tracked != *$'\n'* ]]; then branch=$tracked; upstream=$tracked; fi
   fi
 fi
 if [[ -z $branch && -z $upstream ]]; then
   echo 'Restored a pinned revision. Automatic updates are paused.'
   [[ -f $stage/update-branch ]] || echo 'This legacy backup has no unique update branch. Supply the original branch as the fourth restore argument to attach it offline.'
   return 0
 fi
 git check-ref-format --branch "$branch" >/dev/null
 git check-ref-format --branch "$upstream" >/dev/null
 tracked="refs/remotes/origin/$upstream"
 if [[ -n $saved_ref ]]; then
   git fetch --quiet --no-tags "$stage/source.bundle" "$saved_ref:$tracked"
 elif ! git show-ref --verify --quiet "$tracked"; then
   git update-ref "$tracked" "$revision"
 fi
 git branch "$branch" "$revision"
 git symbolic-ref HEAD "refs/heads/$branch"
 git branch --set-upstream-to="origin/$upstream" "$branch" >/dev/null
 [[ $(git rev-parse --symbolic-full-name '@{upstream}') == "$tracked" ]]
 git rev-parse --verify '@{upstream}^{commit}' >/dev/null
 echo "Restored update branch $branch tracking origin/$upstream."
}
