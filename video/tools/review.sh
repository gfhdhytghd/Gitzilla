#!/usr/bin/env bash
# review.sh <video> <start-s> <dur-s> <every-s> <out.jpg> [cols] -> contact sheet with output timestamps
f=$1; ss=$2; d=$3; e=$4; out=$5; c=${6:-4}
FONT=$(fc-match -f '%{file}' 'DejaVu Sans:bold')
n=$(python3 -c "import math;print(math.ceil($d/$e))"); r=$(( (n + c - 1) / c ))
ffmpeg -v error -y -ss $ss -t $d -i "$f" -vf "fps=1/$e,scale=480:-1,drawtext=fontfile=$FONT:text='%{pts\:hms\:$ss}':x=6:y=6:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.7,tile=${c}x${r}:padding=3" -frames:v 1 "$out" && echo "$out"
