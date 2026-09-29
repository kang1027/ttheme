source $TTHEME_HOME/adapters/_bg.zsh

typeset -g TTHEME_WARP_SETTINGS=$HOME/.warp/settings.toml TTHEME_WARP_THEMES=$HOME/.warp/themes TTHEME_WARP_WORN="" TTHEME_WARP_BEFORE=""
typeset -g TTHEME_WARP_SHOWING="" TTHEME_WARP_VIEW=""
typeset -gi TTHEME_WARP_BASED=0 TTHEME_WARP_VIEWS=0 TTHEME_WARP_BUSY=0
typeset -ga TTHEME_WARP_LAID=()
if [[ $OSTYPE != darwin* ]]; then
  TTHEME_WARP_SETTINGS=${XDG_CONFIG_HOME:-$HOME/.config}/warp-terminal/settings.toml
  TTHEME_WARP_THEMES=${XDG_DATA_HOME:-$HOME/.local/share}/warp-terminal/themes
fi

zmodload -F zsh/files b:zf_rm 2>/dev/null
zmodload -F zsh/zselect b:zselect 2>/dev/null
zmodload -F zsh/datetime p:EPOCHREALTIME 2>/dev/null

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

__tt_warp_wearing() {
  local -a reply TTHEME_WARP_LINES
  __tt_warp_read || return 1
  REPLY=$TTHEME_WARP_WORN
  [[ -n $REPLY ]]
}

__tt_apply() {
  local REPLY
  __tt_name_of "$1"
  [[ -n ${TTHEME_PALETTE[$REPLY]} ]] || return 1
  __tt_warp_value $REPLY
  __tt_warp_set "$REPLY" || return 1
  TTHEME_WARP_VIEW=""
}

__tt_osc_reset() {
  [[ -n $TTHEME_WARP_BEFORE ]] || return 0
  local value=$TTHEME_WARP_BEFORE
  TTHEME_WARP_BEFORE="" TTHEME_WARP_VIEW=""
  __tt_warp_set "$value" || return 0
  (( TTHEME_WARP_BASED )) || zf_rm -f -- $TTHEME_HOME/warp.base 2>/dev/null
  return 0
}

__tt_bg_shown() { __tt_warp_wearing }

__tt_bg_refresh() { __tt_warp_unview }

__tt_bg_bake() {
  local place
  printf -v place '%dx%d%+d%+d' $5 $6 $7 $8
  __tt_cli bake "$1" "$2" "${3}x$4" "$place" >/dev/null 2>&1
}

__tt_bg_hide() {
  __tt_warp_set "{ custom = { name = \"$1\", path = \"ttheme-${${1/@/--}/\//--}.yaml\" } }"
  TTHEME_WARP_VIEW=""
}

__tt_bg_cells() {
  local REPLY resp
  local -a px cells
  __tt_ask $'\e[14t\e[18t' || return 0
  resp=$REPLY
  [[ $resp == *'[4;'<1->';'<1->t* && $resp == *'[8;'<1->';'<1->t* ]] || return 0
  px=(${(s:;:)${${resp##*\[4;}%%t*}}) cells=(${(s:;:)${${resp##*\[8;}%%t*}})
  bgch=$(( 2 * px[1] / cells[1] )) bgcw=$(( 2 * px[2] / cells[2] ))
}

__tt_bg_transmit() {
  local data
  integer at=1 n
  data=${$(base64 < $2 2>/dev/null)//$'\n'/}
  n=${#data}
  (( n )) || return 0
  printf '\e_Ga=t,f=100,i=%d,m=%d,q=2;%s\e\\' $1 $(( n > 4096 )) "${data[1,4096]}"
  for (( at = 4097; at <= n; at += 4096 )); do
    printf '\e_Gm=%d,q=2;%s\e\\' $(( at + 4096 <= n )) "${data[at,at+4095]}"
  done
}

__tt_bg_crop() {
  __tt_bg_send $1
  REPLY="$REPLY $4"
}

__tt_warp_tuned() {
  [[ $1 == *:* ]] && return 0
  __tt_bg_load $1
  [[ "${bgsize[$1]} ${bgpos[$1]} ${bgop[$1]} ${bgoff[$1]}" != "${bgload[$1]}" ]]
}

__tt_warp_loading() {
  msg="Loading the background" msgt=100
  printf '\e[?2026h'
  __tt_pv_draw
}

__tt_warp_saved() {
  local name=$1
  if [[ "${bgsize[$name]} ${bgpos[$name]} ${bgop[$name]}" == "${bgdef[$name]}" ]]; then
    REPLY=${bgbase[$name]}
  elif [[ ${bgsize[$name]} == fill ]]; then
    REPLY=${bgfill[$name]}
  elif [[ "${bgsize[$name]} ${bgpos[$name]}" == "${bgshotkey[$name]}" && -r ${bgshot[$name]} ]]; then
    REPLY=${bgshot[$name]}
  else
    REPLY=${bgsrc[$name]%.png}@${bgsize[$name]}-${TTHEME_BG_POSITIONS[${bgpos[$name]}]}-${2}x$3.png
  fi
}

__tt_warp_laid() {
  setopt localoptions nomultibyte
  local s=$2$'\n'${(L)${TTHEME_PALETTE[$1]}%% *} c
  local -i h=16#811c9dc5 i n
  for (( i = 1; i <= $#s; i++ )); do
    c=${s[i]}
    n=$(( #c ))
    (( n < 0 )) && (( n += 256 ))
    (( h = ((h ^ n) * 16777619) & 16#ffffffff ))
  done
  printf -v REPLY '%s/ttheme-%s.%08x.png' $TTHEME_WARP_THEMES ${${1/@/--}/\//--} $h
}

__tt_warp_view() {
  local name=$1 pal=${1%:*} img="" out="" canvas="" place="" base theme line at REPLY
  local -a wh fr lines
  local -i W=$(( pw * bgcw )) H=$(( ph * bgch )) op wait
  __tt_bg_load $name
  op=$(( ${bgop[$name]} * 100 + 0.5 ))
  base=$TTHEME_WARP_THEMES/ttheme-${${pal/@/--}/\//--}.yaml
  [[ -r $base ]] || return 1
  if (( ! bgoff[$name] )); then
    __tt_warp_saved $name $W $H
    img=$REPLY
    __tt_warp_laid $pal $img
    out=$REPLY
    if [[ ! -r $img ]]; then
      img=${bgsrc[$name]}
      __tt_bg_dim "$img" && (( W && H )) || return 1
      wh=(${=bgdim[$img]})
      __tt_bg_frame $wh[1] $wh[2] $W $H ${bgsize[$name]} ${bgpos[$name]} contain ${bgfocus[$name]}
      fr=(${=REPLY})
      canvas=${W}x$H
      printf -v place '%dx%d%+d%+d' $fr
    fi
  fi
  [[ "$pal $out $op" == "$TTHEME_WARP_VIEW" ]] && return 0
  __tt_warp_loading
  for line in "${(@f)$(<$base)}"; do
    lines+=("$line")
    [[ -n $out && $line == details:* ]] && lines+=("background_image:" "  path: \"$out\"" "  opacity: $op")
  done
  theme=ttheme-${${pal/@/--}/\//--}.view-$(( ++TTHEME_WARP_VIEWS )).yaml
  __tt_put $TTHEME_WARP_THEMES/$theme "${lines[@]}" || return 1
  at=$EPOCHREALTIME
  if [[ -n $out && ! -r $out ]]; then
    if ! __tt_cli flatten "$img" "$out" "${${TTHEME_PALETTE[$pal]}%% *}" 1 $canvas $place >/dev/null 2>&1; then
      zf_rm -f -- $TTHEME_WARP_THEMES/$theme 2>/dev/null
      return 1
    fi
    TTHEME_WARP_LAID+=($out)
  fi
  wait=$(( 25 - (EPOCHREALTIME - at) * 100 ))
  (( wait > 0 )) && zselect -t $wait
  __tt_warp_set "{ custom = { name = \"$pal\", path = \"$theme\" } }" || return 1
  [[ -z $TTHEME_WARP_SHOWING ]] || zf_rm -f -- $TTHEME_WARP_THEMES/$TTHEME_WARP_SHOWING 2>/dev/null
  TTHEME_WARP_SHOWING=$theme TTHEME_WARP_VIEW="$pal $out $op"
}

__tt_warp_unview() {
  [[ -n $TTHEME_WARP_SHOWING ]] || return 0
  local spec=$1
  [[ -n $spec ]] && __tt_apply "$spec"
  zf_rm -f -- $TTHEME_WARP_THEMES/$TTHEME_WARP_SHOWING 2>/dev/null
  TTHEME_WARP_SHOWING="" TTHEME_WARP_VIEW=""
}

__tt_pv_bg_show() {
  (( bgcw && ! TTHEME_WARP_BUSY )) || return 0
  local spec=${TTHEME_PALETTE[${1%:*}]} REPLY
  local -i tuned=0
  __tt_warp_tuned $1 && tuned=1
  if (( tuned )) || [[ $spec == "$applied" && -n $TTHEME_WARP_SHOWING ]]; then
    if zselect -t 15 -r 0 2>/dev/null; then
      bgname=""
      return 0
    fi
  fi
  bgname=$1
  TTHEME_WARP_BUSY=1
  if (( tuned )); then
    __tt_warp_view $1 && applied=$spec painted=$spec
  elif [[ $spec == "$applied" ]]; then
    if [[ -n $TTHEME_WARP_SHOWING ]]; then
      __tt_warp_loading
      __tt_warp_unview "$applied"
    elif __tt_warp_wearing && [[ $REPLY == "${1%:*}" ]]; then
      local want
      local -a reply TTHEME_WARP_LINES
      __tt_warp_value ${1%:*}
      want=$REPLY
      __tt_warp_read
      if [[ $REPLY != "$want" ]]; then
        __tt_warp_loading
        zselect -t 25
        __tt_warp_set "$want"
      fi
    fi
  fi
  [[ $msg == "Loading the background" ]] && msg="" msgt=0
  TTHEME_WARP_BUSY=0
  return 0
}

__tt_pv_bg_close() {
  (( bgcw )) && { printf '\e_Ga=d,d=A,q=2\e\\'; __tt_bg_forget }
  (( ${+bgedit[$bgname]} )) || [[ -n $bgname && ${bgview[${bgname%:*}]} == "$bgname" ]] || __tt_warp_unview "$applied"
  [[ -z $bgcut ]] || { ( zselect -t 1000; rm -rf -- $bgcut ) &!; bgcut="" }
  (( ${#TTHEME_WARP_LAID} )) || return 0
  local -a laid=($TTHEME_WARP_LAID)
  TTHEME_WARP_LAID=()
  ( zselect -t 1000; __tt_warp_sweep $laid ) &!
}

__tt_warp_sweep() {
  setopt localoptions extendedglob
  local f
  local -A used
  for f in $TTHEME_WARP_THEMES/ttheme-*.yaml(N); do
    [[ "$(<$f)" == (#b)*$'\n  path: "'([^\"]##)'"'* ]] && used[$match[1]]=1
  done
  for f; do
    (( ${+used[$f]} )) || zf_rm -f -- $f 2>/dev/null
  done
}
