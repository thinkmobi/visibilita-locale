"""Importa una scansione Local Falcon in zone/<id>/zona.json senza passare da Claude.
Uso (GitHub Actions): LOCALFALCON_API_KEY=... python motore/importa.py zone/<id>/richiesta.json
richiesta.json: {"report_key": "e01e001722b17ba", "quartiere": "Crocetta", "citta": "Torino",
                 "categoria": "AgenzieImmobiliari", "frase_kw": "un'agenzia immobiliare", "centrata": "sulla Crocetta"}
Se zona.json esiste già, prospect e registro restano intatti: si aggiornano solo punti, attività e metadati."""
import json, os, sys, time, re, urllib.request, urllib.parse, urllib.error

API = "https://api.localfalcon.com/v1/reports/{}/"
MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto",
        "settembre", "ottobre", "novembre", "dicembre"]
PROSSIMO_PASSO = {
    "intro": "Questa pagina mostra solo il risultato. L'analisi completa spiega perché Google mette altre attività davanti alla sua e cosa correggere per recuperare posizioni.",
    "items": [["Concorrenti", "chi la precede, punto per punto"], ["Recensioni", "quante, quanto recenti, cosa dicono"],
              ["Assistenti AI", "se la citano nelle loro risposte"], ["Scheda Google", "le modifiche fatte senza avvisarla"]],
    "outro": "Le propongo un incontro di mezz'ora: guardiamo insieme l'analisi completa e decidiamo da dove partire."}


def num(x, tipo=float):
    try: return tipo(float(x))
    except (TypeError, ValueError): return None


def breve(nome):
    """nome corto per le classifiche stampate; si corregge a mano nell'app (Zone o scheda prospect)"""
    n = re.split(r"\s*\|\s*|\s+\*+", nome)[0]
    n = re.sub(r"(?i)^agenzia\s+immobiliare\s+(-\s+)?", "", n)
    n = re.sub(r"(?i)\s+-\s+agenzia\b.*$", "", n)
    n = re.sub(r"(?i)\btorino\s*-\s*", "", n)
    n = re.sub(r"\s+di\s+[A-Z][\w']+\s+[A-Z][\w']+.*$", "", n)
    n = re.sub(r"\s+[-–]\s+", " ", n)
    n = re.sub(r"\s{2,}", " ", n).strip(" -–")
    if n.isupper() and len(n) > 4: n = n.title()
    if len(n) > 34: n = n[:34].rsplit(" ", 1)[0]
    return n or nome[:34]


def _post(chiave, api_key, modo):
    """Local Falcon accetta la chiave come campo del form, parametro in URL o header Bearer"""
    url = API.format(chiave)
    corpo = urllib.parse.urlencode({"api_key": api_key} if modo != "bearer" else {}).encode()
    if modo == "query": url += "?" + urllib.parse.urlencode({"api_key": api_key})
    req = urllib.request.Request(url, data=corpo, method="POST")
    if modo == "bearer": req.add_header("Authorization", "Bearer " + api_key)
    with urllib.request.urlopen(req, timeout=90) as r:
        return r.status, json.load(r)


def chiedi_report(chiave, api_key, attese=20):
    api_key = api_key.strip()
    modo, ultimo = None, None
    for _ in range(attese):
        for m in ([modo] if modo else ["form", "query", "bearer"]):
            try:
                stato, risposta = _post(chiave, api_key, m); modo = m; break
            except urllib.error.HTTPError as e:
                ultimo = e
                if e.code not in (401, 403): raise
        else:
            raise RuntimeError(f"Local Falcon rifiuta la chiave API ({ultimo.code}): controlla il secret LOCALFALCON_API_KEY")
        if stato == 200 and (risposta.get("data") or {}).get("data_points"):
            return risposta["data"]
        time.sleep(30)          # 202 = scansione ancora in elaborazione
    raise RuntimeError("Local Falcon non ha restituito i punti della griglia entro 10 minuti")


def zona_da_report(d, rq, esistente=None):
    z = esistente or {"v": 1, "prospect": {}, "registro": {}}
    data = (d.get("date") or "")[:10]
    try:
        a, m, g = data.split("-"); data_testo = f"{int(g)} {MESI[int(m) - 1]} {a}"
    except ValueError:
        data_testo = data
    grid = num(d.get("grid_size"), int) or 7
    raggio = num(d.get("radius")) or 1.0
    if (d.get("measurement") or "km") == "mi": raggio *= 1.609
    lato = f"{raggio * 2:g}".replace(".", ",")
    kw = d.get("keyword") or rq.get("keyword", "")
    meta = dict(z.get("meta") or {})
    meta.update({
        "quartiere": rq.get("quartiere", meta.get("quartiere", "")), "citta": rq.get("citta", meta.get("citta", "")),
        "categoria": rq.get("categoria", meta.get("categoria", "")), "keyword": kw,
        "frase_kw": rq.get("frase_kw") or meta.get("frase_kw") or f"«{kw}»",
        "centrata": rq.get("centrata") or meta.get("centrata") or f"su {rq.get('quartiere', '')}",
        "data": data, "data_testo": data_testo, "lat": num(d.get("lat")), "lng": num(d.get("lng")),
        "griglia": grid, "lato": f"{lato} × {lato} km", "report_key": d.get("report_key"),
        "prossimo_passo": meta.get("prossimo_passo") or rq.get("prossimo_passo") or PROSSIMO_PASSO,
        "u": int(time.time() * 1000)})
    att = z.get("attivita") or {}
    punti = []
    for p in d["data_points"]:
        ris = sorted(p.get("results") or [], key=lambda q: int(q["rank"]))
        for q in ris:
            pid = q["place_id"]
            vecchio = att.get(pid, {})
            att[pid] = {"n": q.get("name", ""), "b": vecchio.get("b") or breve(q.get("name", "")),
                        "a": q.get("address", ""), "la": num(q.get("lat")), "lo": num(q.get("lng")),
                        "r": num(q.get("rating")), "rv": num(q.get("reviews"), int) or 0,
                        "t": q.get("phone") or "", "w": q.get("display_url") or q.get("url") or "",
                        "c": bool(q.get("claimed")), "cat": list((q.get("categories") or {}).values())}
        punti.append([num(p["lat"]), num(p["lng"]), [q["place_id"] for q in ris]])
    z.update({"meta": meta, "attivita": att, "punti": punti})
    return z


def scarica(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "visibilita-locale/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r, open(dest, "wb") as f:
        f.write(r.read())


def main(percorso):
    cartella = os.path.dirname(os.path.abspath(percorso))
    rq = json.load(open(percorso, encoding="utf-8"))
    esito = {"report_key": rq.get("report_key"), "stato": "errore"}
    try:
        api_key = os.environ.get("LOCALFALCON_API_KEY")
        if not api_key: raise RuntimeError("manca il secret LOCALFALCON_API_KEY nel repository dati")
        d = chiedi_report(rq["report_key"], api_key)
        fz = os.path.join(cartella, "zona.json")
        esistente = json.load(open(fz, encoding="utf-8")) if os.path.exists(fz) else None
        z = zona_da_report(d, rq, esistente)
        z["id"] = os.path.basename(cartella)
        if d.get("image"):
            try:
                scarica(d["image"], os.path.join(cartella, "sfondo.png")); z["meta"]["sfondo"] = "sfondo.png"
            except Exception as e:  # la stampa funziona anche senza sfondo
                esito["avviso"] = f"sfondo non scaricato: {e}"
        json.dump(z, open(fz, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        esito.update({"stato": "ok", "punti": len(z["punti"]), "attivita": len(z["attivita"])})
    except Exception as e:
        esito["messaggio"] = str(e)
    json.dump(esito, open(os.path.join(cartella, "importa-esito.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(esito, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main(sys.argv[1])
