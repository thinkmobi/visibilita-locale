"""Controllo dei siti delle attività di una zona: visita ogni link della scheda Google e scrive zone/<id>/siti.json.
Uso: python motore/siti.py [zone/<id> ...]   (senza argomenti controlla tutte le zone)
Stati: ok, dubbio (blocca i controlli, verificare a mano), ssl (certificato non valido), parcheggiato (dominio in vendita o scaduto),\ncostruzione, errore (HTTP 404/5xx), irraggiungibile (dominio inesistente o server spento).
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
    """prova https e http, con e senza verifica del certificato; distingue i siti morti dai blocchi anti-bot"""
    t0 = time.time()
    base = url.strip()
    tentativi = [base] if base.lower().startswith("http") else ["https://" + base, "http://" + base]
    ultimo, ssl_rotto = None, False
    for u in tentativi:
        for verifica_ssl in (True, False):
            ctx = ssl.create_default_context()
            if not verifica_ssl: ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
            req = urllib.request.Request(u, headers={"User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9",
                                                     "Accept": "text/html,application/xhtml+xml"})
            try:
                with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
                    corpo = r.read(120000).decode("utf-8", "ignore").lower()
                    esito = {"stato": "ok", "codice": r.status, "finale": r.geturl(), "ms": int((time.time() - t0) * 1000)}
                    if not verifica_ssl or ssl_rotto:
                        esito.update(stato="ssl", nota="il sito risponde ma il certificato HTTPS non è valido")
                    if any(k in corpo for k in PARCHEGGIO): esito["stato"] = "parcheggiato"
                    elif any(k in corpo for k in COSTRUZIONE): esito["stato"] = "costruzione"
                    elif r.status == 202 or len(corpo.strip()) < 400:   # pagine di verifica anti-bot o caricate via JavaScript
                        esito.update(stato="dubbio", nota="pagina vuota o di verifica automatica: controlla a mano")
                    return esito
            except urllib.error.HTTPError as e:
                if e.code in (400, 401, 403, 405, 406, 429, 503):   # protezioni anti-bot: il sito esiste
                    return {"stato": "ok", "codice": e.code, "finale": u, "nota": "risponde ma blocca i controlli automatici",
                            "ms": int((time.time() - t0) * 1000)}
                ultimo = {"stato": "errore", "codice": e.code, "finale": u}
                break
            except (urllib.error.URLError, socket.timeout, ConnectionError, OSError) as e:
                motivo = getattr(e, "reason", e)
                testo = str(motivo)
                if isinstance(motivo, ssl.SSLError) or isinstance(e, ssl.SSLError) or "CERTIFICATE" in testo.upper():
                    ssl_rotto = True; ultimo = {"stato": "ssl", "nota": "certificato HTTPS non valido"}; continue
                if isinstance(motivo, socket.gaierror) or "address associated" in testo or "Name or service" in testo:
                    return {"stato": "irraggiungibile", "nota": "dominio inesistente o scaduto", "ms": int((time.time() - t0) * 1000)}
                if "closed connection" in testo or "reset" in testo.lower() or isinstance(motivo, (socket.timeout, TimeoutError)) or "timed out" in testo:
                    ultimo = {"stato": "dubbio", "nota": "il server chiude la connessione ai controlli automatici: verifica a mano"}
                    break
                ultimo = {"stato": "irraggiungibile", "nota": testo[:120]}
                break
            except Exception as e:   # URL con spazi, accenti o malformati: non deve fermare il controllo della zona
                return {"stato": "dubbio", "nota": f"indirizzo non controllabile: {str(e)[:80]}", "ms": int((time.time() - t0) * 1000)}
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
