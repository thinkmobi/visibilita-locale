"""Controllo dei siti delle attività di una zona: visita ogni link della scheda Google e scrive zone/<id>/siti.json.
Uso: python motore/siti.py [zone/<id> ...]   (senza argomenti controlla tutte le zone)
Stati: ok, parcheggiato (dominio in vendita o scaduto), costruzione, errore (HTTP 4xx/5xx), irraggiungibile.
Il file è separato da zona.json, così il controllo non entra mai in conflitto con le modifiche fatte dall'app."""
import json, os, sys, glob, ssl, time, socket, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
PARCHEGGIO = ["domain is for sale", "buy this domain", "this domain may be for sale", "dominio è in vendita", "dominio in vendita",
              "sedoparking", "parkingcrew", "bodis.com", "dan.com", "afternic", "domain has expired", "dominio scaduto",
              "questo dominio è stato registrato", "this domain has been registered", "account suspended", "account sospeso",
              "hosting scaduto", "the domain name is not configured", "default web site page", "web server's default page"]
COSTRUZIONE = ["sito in costruzione", "under construction", "coming soon", "stiamo lavorando al nuovo sito", "sito in manutenzione",
               "maintenance mode", "index of /"]


def chiave(url):
    """stessa normalizzazione usata dall'app: niente protocollo, niente www, minuscolo, senza / finale"""
    u = (url or "").strip().lower()
    for p in ("https://", "http://"):
        if u.startswith(p): u = u[len(p):]
    if u.startswith("www."): u = u[4:]
    return u.rstrip("/")


def visita(url):
    t0 = time.time()
    tentativi = [url if url.lower().startswith("http") else "https://" + url]
    if not url.lower().startswith("http"): tentativi.append("http://" + url)
    ultimo = None
    for u in tentativi:
        for verifica_ssl in (True, False):
            ctx = ssl.create_default_context()
            if not verifica_ssl: ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(u, headers={"User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9"})
            try:
                with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
                    corpo = r.read(120000).decode("utf-8", "ignore").lower()
                    finale = r.geturl()
                    esito = {"stato": "ok", "codice": r.status, "finale": finale, "ms": int((time.time() - t0) * 1000)}
                    if not verifica_ssl: esito["nota"] = "certificato HTTPS non valido"
                    if any(k in corpo for k in PARCHEGGIO): esito["stato"] = "parcheggiato"
                    elif any(k in corpo for k in COSTRUZIONE) or len(corpo.strip()) < 400: esito["stato"] = "costruzione"
                    return esito
            except urllib.error.HTTPError as e:
                if e.code in (403, 429, 503) and verifica_ssl:   # spesso protezioni anti-bot: il sito esiste
                    return {"stato": "ok", "codice": e.code, "finale": u, "nota": "risponde ma blocca i controlli automatici",
                            "ms": int((time.time() - t0) * 1000)}
                ultimo = {"stato": "errore", "codice": e.code, "finale": u}
                break
            except ssl.SSLError as e:
                ultimo = {"stato": "irraggiungibile", "nota": f"SSL: {e.__class__.__name__}"}
                continue
            except (urllib.error.URLError, socket.timeout, ConnectionError, OSError) as e:
                motivo = getattr(e, "reason", e)
                if isinstance(motivo, ssl.SSLError): ultimo = {"stato": "irraggiungibile", "nota": "SSL"}; continue
                ultimo = {"stato": "irraggiungibile", "nota": str(motivo)[:120]}
                break
    ultimo = ultimo or {"stato": "irraggiungibile"}
    ultimo["ms"] = int((time.time() - t0) * 1000)
    return ultimo


def controlla(cartella):
    fz = os.path.join(cartella, "zona.json")
    if not os.path.exists(fz): return None
    z = json.load(open(fz, encoding="utf-8"))
    urls = {}
    for a in (z.get("attivita") or {}).values():
        if a.get("w"): urls[chiave(a["w"])] = a["w"]
    for p in (z.get("prospect") or {}).values():
        if p.get("sito") and not p.get("del"): urls[chiave(p["sito"])] = p["sito"]
    urls.pop("", None)
    with ThreadPoolExecutor(max_workers=16) as ex:
        risultati = dict(zip(urls.keys(), ex.map(visita, urls.values())))
    out = {"aggiornato": datetime.now(timezone.utc).isoformat(timespec="seconds"), "siti": risultati}
    json.dump(out, open(os.path.join(cartella, "siti.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    conta = {}
    for r in risultati.values(): conta[r["stato"]] = conta.get(r["stato"], 0) + 1
    print(os.path.basename(cartella), len(risultati), "siti", conta)
    return conta


if __name__ == "__main__":
    cartelle = sys.argv[1:] or sorted(glob.glob("zone/*/"))
    for c in cartelle: controlla(c.rstrip("/"))
