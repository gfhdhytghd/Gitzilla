#!/usr/bin/env bash
# sheet.sh <raw-name> <every-seconds> [cols] -> scratch contact sheet with timestamps burned in
n=$1; e=${2:-2}; c=${3:-4}; S=${SHEETS:-/tmp/claude-1000/-home-wilf-data-HackPSU-repo-kaiju/26672cd5-4c17-479c-9cb7-fe05873013da/scratchpad}
ffmpeg -v error -y -i raw/$n.mp4 -vf "fps=1/$e,scale=480:-1,drawtext=fontfile=/home/wilf/.local/share/fonts/inter/Inter.ttc:text='%{pts\:hms}':x=6:y=6:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.7,tile=${c}x4:padding=3" -frames:v 1 $S/sheet-$n.jpg && echo $S/sheet-$n.jpg
