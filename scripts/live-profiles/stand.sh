#!/bin/sh
# B3.3: commands on the Windows stand `winstand`.
#   stand.sh admin <command>   the administrator alias, key and BatchMode, as in B0.2 and B0.4
#   stand.sh user <command>    the temporary standard account. Its password comes from the 0600 file named by
#                              B33_ACCOUNT_SECRET through SSH_ASKPASS and is never printed. A key logon cannot be
#                              used: the account has no profile and no authorized_keys before its first logon, and
#                              Task Scheduler cannot run it either (no "Log on as a batch job" right, 0xC000015B).
set -eu
who=$1
shift
case "$who" in
  admin) exec ssh -o BatchMode=yes -o ServerAliveInterval=30 winstand "$@" ;;
  user)
    askpass=$(mktemp)
    trap 'rm -f "$askpass"' EXIT
    printf '#!/bin/sh\ncat "%s"\n' "$B33_ACCOUNT_SECRET" > "$askpass"
    chmod 700 "$askpass"
    SSH_ASKPASS=$askpass SSH_ASKPASS_REQUIRE=force DISPLAY=none ssh -o BatchMode=no -o PubkeyAuthentication=no \
      -o PreferredAuthentications=password,keyboard-interactive -o NumberOfPasswordPrompts=1 -o ServerAliveInterval=30 \
      -l 'Проверка Б33' winstand "$@"
    ;;
  *) echo "usage: stand.sh admin|user <command>" >&2; exit 2 ;;
esac
