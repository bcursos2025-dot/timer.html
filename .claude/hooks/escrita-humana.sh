#!/bin/sh
# SessionStart: injeta a regra de escrita humana no contexto de toda conversa nova.
dir="$(cd "$(dirname "$0")/.." && pwd)"
skill="$dir/skills/escrita-humana/SKILL.md"
[ -f "$skill" ] || exit 0
echo "REGRA DE ESTILO SEMPRE ATIVA (vale para toda mensagem, desde a primeira):"
# remove o frontmatter YAML (entre os dois primeiros ---)
awk 'BEGIN{f=0} /^---$/ && f<2 {f++; next} f>=2' "$skill"
