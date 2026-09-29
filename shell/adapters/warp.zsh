typeset -g TTHEME_WARP_SETTINGS=$HOME/.warp/settings.toml TTHEME_WARP_THEMES=$HOME/.warp/themes TTHEME_WARP_WORN="" TTHEME_WARP_BEFORE=""
typeset -gi TTHEME_WARP_BASED=0
if [[ $OSTYPE != darwin* ]]; then
  TTHEME_WARP_SETTINGS=${XDG_CONFIG_HOME:-$HOME/.config}/warp-terminal/settings.toml
  TTHEME_WARP_THEMES=${XDG_DATA_HOME:-$HOME/.local/share}/warp-terminal/themes
fi

zmodload -F zsh/files b:zf_rm 2>/dev/null

__tt_paints() { return 1 }

__tt_warp_wired() { (( ${TTHEME_TERMINALS[(Ie)warp]} )) && [[ -r $TTHEME_WARP_SETTINGS ]] }

__tt_unpainted() {
  local how='`ttheme default <palette>`'
  __tt_warp_wired && how='`ttheme preview` or '$how
  print -u2 "ttheme: Warp wears one theme app-wide and paints no tab background of its own — $how puts one on every Warp window"
}

__tt_previews() {
  local REPLY
  local -a reply TTHEME_WARP_LINES
  __tt_warp_wired && __tt_warp_read || return 1
  TTHEME_WARP_BEFORE=${REPLY:-'"dark"'} TTHEME_WARP_BASED=0 TTHEME_SPEC=""
  [[ -e $TTHEME_HOME/warp.base ]] && TTHEME_WARP_BASED=1
  [[ -n $TTHEME_WARP_WORN ]] && TTHEME_SPEC=${TTHEME_PALETTE[$TTHEME_WARP_WORN]}
  return 0
}

__tt_warp_value() {
  setopt localoptions extendedglob
  local file=ttheme-${${1/@/--}/\//--}
  local -a pics=($TTHEME_WARP_THEMES/$file.[0-9a-f](#c8).yaml(Nom))
  (( ${#pics} )) && file=${pics[1]:t:r}
  REPLY="{ custom = { name = \"$1\", path = \"$file.yaml\" } }"
}

__tt_warp_read() {
  setopt localoptions extendedglob
  local f=$TTHEME_WARP_SETTINGS line
  local -a at=(0 0)
  integer i s=0
  reply=() REPLY="" TTHEME_WARP_WORN=""
  [[ -r $f ]] || return 1
  reply=("${(@f)$(<$f)}")
  for (( i = 1; i <= $#reply; i++ )); do
    line=${reply[i]}
    if (( s )); then
      [[ $line == [[:space:]]#\[* ]] && break
      [[ $line == theme[[:space:]]#=* ]] && { at=($s $i); break }
    elif [[ $line == [[:space:]]#'[appearance.themes]'[[:space:]]# ]]; then
      s=$i at=($s 0)
    fi
  done
  TTHEME_WARP_LINES=($at)
  (( at[2] )) && REPLY=${${reply[at[2]]#theme}##[[:space:]]#=[[:space:]]#}
  [[ $REPLY == '{ custom = { name = "'*'", path = "ttheme-'* ]] && TTHEME_WARP_WORN=${${REPLY#*name = \"}%%\"*}
  return 0
}

__tt_warp_set() {
  local REPLY
  local -a at reply TTHEME_WARP_LINES
  __tt_warp_read || return 1
  [[ $REPLY == "$1" ]] && return 0
  if [[ $1 == *'path = "ttheme-'* && -z $TTHEME_WARP_WORN && ! -e $TTHEME_HOME/warp.base ]]; then
    __tt_put $TTHEME_HOME/warp.base "$REPLY" || return 1
  fi
  [[ -e $TTHEME_WARP_SETTINGS.ttheme.bak ]] || __tt_put $TTHEME_WARP_SETTINGS.ttheme.bak "${reply[@]}"
  at=($TTHEME_WARP_LINES)
  if (( at[2] )); then
    reply[at[2]]="theme = $1"
  elif (( at[1] )); then
    reply[at[1]]=("${reply[at[1]]}" "theme = $1")
  else
    reply+=("" "[appearance.themes]" "theme = $1")
  fi
  __tt_put $TTHEME_WARP_SETTINGS "${reply[@]}"
}

__tt_apply() {
  local REPLY
  __tt_name_of "$1"
  [[ -n ${TTHEME_PALETTE[$REPLY]} ]] || return 1
  __tt_warp_value $REPLY
  __tt_warp_set "$REPLY"
}

__tt_osc_reset() {
  [[ -n $TTHEME_WARP_BEFORE ]] || return 0
  local value=$TTHEME_WARP_BEFORE
  TTHEME_WARP_BEFORE=""
  __tt_warp_set "$value" || return 0
  (( TTHEME_WARP_BASED )) || zf_rm -f -- $TTHEME_HOME/warp.base 2>/dev/null
  return 0
}
