# XMLTV-TV-Programm

Was **jetzt, danach und heute Abend** auf den Sendern läuft, die du verfolgst,
gelesen aus **jedem XMLTV-Programmführer**: ein Gerät pro Sender, ein Widget
für das Dashboard, ein Szenenauslöser für Stichwörter („Tatort“, „Champions
League“) und zwei Szenenaktionen.

Getestet mit echten öffentlichen Guides (xmltvfr.fr, epgshare01), noch nicht
auf vielen Gladys-Installationen: Rückmeldungen sind im Gladys-Forum
willkommen.

## Was du brauchst

- Gladys Assistant **5.1.0** oder neuer.
- Die Adresse eines XMLTV-Guides, der deine Sender abdeckt, `.xml` oder
  `.xml.gz` (siehe unten). Kein Konto, kein API-Schlüssel.

## Einen Guide finden

- **Frankreich, Belgien, Schweiz, frankophones Afrika**:
  [xmltvfr.fr](https://xmltvfr.fr) veröffentlicht kostenlose, täglich neu
  erstellte Guides, zum Beispiel `https://xmltvfr.fr/xmltv/xmltv_tnt.xml.gz`
  (französisches DVB-T, 1 MB) oder `https://xmltvfr.fr/xmltv/xmltv.xml.gz`
  (alle Sender, 18 MB).
- **Andere Länder**: Das Projekt
  [iptv-org/epg](https://github.com/iptv-org/epg) listet die Quellen und
  Werkzeuge, um einen Guide zu erstellen; Community-Seiten veröffentlichen
  fertige Guides pro Land.
- **Deine IPTV-Box oder dein Anbieter**: Viele bieten eine XMLTV-Adresse
  (oft `…/xmltv.php?username=…&password=…`). Diese wird so übernommen und nie in
  die Protokolle geschrieben.
- **Eine Datei**: Ein Guide im Datenvolume der Integration wird mit einer
  Adresse wie `/data/guide.xml.gz` gelesen.

## Einrichtung

1. Gib unter **Integrationen → XMLTV TV guide → Konfiguration** die
   **Adresse des Programmführers** ein.
2. Liste unter **Verfolgte Sender** die Sender auf, durch Kommas getrennt,
   höchstens 20: ihre **ID** im Guide (`ARD.de`) oder ihren **Namen**
   (`ZDF`). Die Schaltfläche **Sender auflisten** (mit einer Suche wie `ard`)
   zeigt die IDs und Namen des Guides.
3. Wähle den **Beginn des Abendprogramms** (standardmäßig 21:00) und wie oft
   der Guide **geladen** wird (standardmäßig alle 12 Stunden).
4. Gib bei Bedarf **Stichwörter** für die Szenen und die **Vorwarnung** ein.
5. Drücke **Programmführer testen**: Der Guide wird geladen, und du siehst,
   welche verfolgten Sender er enthält und bis wann.
6. Füge im Tab **Entdecken** die gewünschten Sender zu Gladys hinzu.

Die **Sprache der Texte** bestimmt die Namen der Funktionen, die
veröffentlichten Texte und die Szenenausgaben (standardmäßig Französisch).

## Das Gerät jedes Senders

| Funktion                   | Beispiel               |
| -------------------------- | ---------------------- |
| Läuft gerade               | `Tatort`               |
| Ende der laufenden Sendung | `21:45`                |
| Restzeit (Minuten)         | `42`                   |
| Danach                     | `21:45 · Caren Miosga` |
| Heute Abend                | `20:15 · Tatort`       |

„Heute Abend“ ist die erste Sendung von mindestens 20 Minuten, die ab
10 Minuten vor dem Beginn des Abendprogramms startet (Wetter und Trailer
werden übersprungen), oder die Sendung, die zu dieser Zeit läuft. Ist sie
vorbei, zeigt das Gerät die des nächsten Abends mit „morgen“ davor. Die Zeiten
gelten in der Zeitzone von Gladys.

## Dashboard

Das Widget **TV-Programm** listet bis zu 8 zu Gladys hinzugefügte Sender unter
dem Namen, den du ihnen gegeben hast: was gerade läuft, mit der Restzeit, oder
(Einstellung **Anzeigen**) heute Abend mit der Anfangszeit. Das Abzeichen lässt
sich ausblenden. Ein Tipp auf einen Sender zeigt jetzt, danach und heute
Abend, mit Uhrzeiten, Folge und Kategorie.

## Szenen

### Auslöser

**Sendung mit Stichwort**: Eine Sendung, deren Titel eines der konfigurierten
**Stichwörter** enthält, beginnt auf einem verfolgten Sender (Akzente und
Groß-/Kleinschreibung egal). Filter: das Stichwort (wie in der Konfiguration
geschrieben), der Sender und der Zeitpunkt — **zum Beginn** oder **vor dem
Beginn**, um die in der Konfiguration eingestellte Vorwarnung. Variablen:
Stichwort, Sender, Titel, Untertitel, Kategorie, Beginn, Ende, Dauer. Eine
Sendung, die beim Start der Integration schon läuft, löst nichts aus.

### Aktionen

- **Programm eines Senders lesen**: jetzt, danach oder heute Abend auf einem
  Sender. Ausgaben: gefunden (1 oder 0), Sender, Titel, Untertitel, Kategorie,
  Tag, Beginn, Ende und die Minuten bis zum Beginn (oder die Restzeit für
  jetzt).
- **Sendung suchen**: die nächste Ausstrahlung eines Titels (oder eines Teils
  davon) auf den verfolgten Sendern, gleiche Ausgaben.

### Ideen für Szenen

- Um 20:00 sagen: „Heute Abend im ZDF: {{title}} um {{start}}“.
- „Tatort“ beginnt in 10 Minuten: eine Nachricht senden und den Fernseher
  einschalten.
- Jeden Samstagmorgen „Champions League“ suchen und den Tag ansagen.

## Downloads und Last

- Der Guide wird beim Start geladen, dann alle 6, 12 oder 24 Stunden, mit
  einer bedingten Anfrage: Ein unveränderter Guide wird nicht erneut geladen.
  Ein Fehlschlag wird nach 30 Minuten wiederholt, und die bekannten Sendungen
  bleiben sichtbar.
- Der Guide wird als Datenstrom gelesen, auch wenn er Hunderte Megabyte groß
  ist: Nur die verfolgten Sender werden behalten (höchstens etwa 100 MB
  Speicher beim Lesen des kompletten Guides von xmltvfr.fr, unter 60 MB im
  Ruhezustand).
- Die Sendungen der verfolgten Sender werden im Datenvolume zwischengespeichert:
  Ein Neustart lädt den Guide nicht vor der Zeit neu.
- Die Zustände werden jede Minute im Speicher berechnet und nur bei Änderungen
  veröffentlicht.

Beachte die Bedingungen des verwendeten Guides: Die kostenlosen Guides werden
ein- oder zweimal am Tag neu erstellt, häufigeres Laden bringt nichts.

## Fehlerbehebung

- **„Die Adresse führt nicht zu einem XMLTV-Programmführer“**: Die Adresse
  liefert eine Webseite (Anmeldung, Fehler). Öffne sie im Browser: Der Browser muss
  eine `.xml`- oder `.xml.gz`-Datei herunterladen.
- **Ein verfolgter Sender ist „nicht gefunden“**: Nutze **Sender auflisten**
  mit einem Teil seines Namens und kopiere seine ID.
- **„Keine Sendung“**: Der Guide enthält für diesen Sender zu dieser Zeit
  keine Sendung; manche Guides decken nur wenige Tage ab.
- **Falsche Uhrzeiten**: Prüfe die Zeitzone von Gladys; die Daten im Guide
  tragen ihren eigenen Versatz.

## Grenzen

- Nur XMLTV (`.xml` oder gzip `.xml.gz`; kein `.zip` oder `.xz`).
- 20 verfolgte Sender, Sendungen bis zu 8 Tage im Voraus.
- Kein Bild, keine Beschreibung, keine Aufnahme: Es ist ein Programmführer,
  kein Receiver (für Receiver siehe die Enigma2-Integration).
