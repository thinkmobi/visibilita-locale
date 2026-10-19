#!/usr/bin/env bash
# Importa le richieste nuove (zone/*/richiesta.json) e controlla subito i siti delle zone importate.
for rq in zone/*/richiesta.json; do
  dir=$(dirname "$rq")
  if python3 -c "import json,sys;r=json.load(open('$rq'));e=json.load(open('$dir/importa-esito.json'));sys.exit(0 if e.get('report_key')==r.get('report_key') and e.get('stato')=='ok' else 1)" 2>/dev/null; then
    echo "già importata: $dir"; continue
  fi
  python3 motore/importa.py "$rq" || true
  if [ -f "$dir/zona.json" ]; then python3 motore/siti.py "$dir" || true; fi
done
exit 0
