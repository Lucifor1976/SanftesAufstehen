//Sanftes Auftehen fuer ZigBee dimmbare Lampen by Lucifor V0.3

// === KONFIGURATION ===
const lampeBrightness = 'zigbee.1.403059fffef3f001.brightness'; // Helligkeits-State deiner Lampe
const lampeState      = 'zigbee.1.403059fffef3f001.state'; // Einschaltpunkt der Lampe

// Zeiten
const startZeit     = "03:45"; // Zeitpunkt zum Einschalten (Format: "HH:MM")
const endZeit       = "04:00"; // Zeitpunkt, bis auf 100% hochgedimmt wird
const abschaltZeit  = "04:10"; // Zeitpunkt zum Ausschalten der Lampe um ggf. weitere Personen im Bett nicht zu stören

// Werte
const startBrightness = 5; //Anfängliche Helligkeit
const endBrightness   = 100; //Endgültige Helligkeit

// Optionen
const wochenendeAktiv = false; // true = auch Sa/So, false = nur Mo-Fr
const feiertageAktiv  = true; //Feiertagscheck an = Keine aktivität an Feiertagen, benötigt den Adapter Feiertage D/A/CH im iobroker

// Feiertagsdatenpunkt vom ical-Adapter
const feiertagState   = 'feiertage.0.heute.boolean'; //Datenpunkt des Feiertagsadapters

// === ALEXA-ANSAGE-KONFIGURATION ===
const alexaAnsageAktiv = true; // Alexa Ansage ob morgen ein Feiertag ist
const alexaAnsageZeit  = "21:00"; //Zeitpunkt der Ansage
const alexaDevice      = 'alexa2.0.Echo-Devices.3ab65f72f1964fd58c68590cba81cb3f'; //Datenpunkt des Echodevices für die Ansage
const feiertagMorgen   = 'feiertage.0.morgen.boolean'; //Datenpunkt Feirtage für morgen

// === HILFSFUNKTIONEN === ab hier keine Änderungen mehr vornehmen!
function zeitInMinuten(zeitStr) {
    const [h, m] = zeitStr.split(':').map(Number);
    return h * 60 + m;
}

function istWerktagOderFreigeschaltet(callback) {
    const heute = new Date().getDay(); // 0 = So, 6 = Sa

    if (!wochenendeAktiv && (heute === 0 || heute === 6)) {
        return callback(false);
    }

    if (feiertageAktiv) {
        getState(feiertagState, (err, state) => {
            if (err || !state) {
                console.warn("Feiertagsprüfung fehlgeschlagen oder Datenpunkt fehlt. Fallback: Aktiv.");
                return callback(true);
            }
            return callback(!state.val);
        });
    } else {
        callback(true);
    }
}

// === DIMMFUNKTION ===
function starteDimmen(startMin, endMin) {
    let aktuelleStufe = 0;
    const fadeMinuten = endMin - startMin;
    const schrittweite = (endBrightness - startBrightness) / fadeMinuten;

    fadeTimer = setInterval(() => {
        aktuelleStufe++;
        const neueHelligkeit = Math.round(startBrightness + schrittweite * aktuelleStufe);
        setState(lampeBrightness, neueHelligkeit);
        console.log(`Dimme auf ${neueHelligkeit}%`);
        if (aktuelleStufe >= fadeMinuten) {
            clearInterval(fadeTimer);
        }
    }, 60 * 1000);
}

// === HAUPTSCHEDULER ===
let fadeTimer = null;

schedule('* * * * *', () => {
    const now = new Date();
    const aktuelleMinuten = now.getHours() * 60 + now.getMinutes();
    const startMin = zeitInMinuten(startZeit);
    const endMin = zeitInMinuten(endZeit);
    const stopMin = zeitInMinuten(abschaltZeit);

    istWerktagOderFreigeschaltet((aktiv) => {
        if (!aktiv) return;

        if (aktuelleMinuten === startMin) {
            setState(lampeState, true, true);
            console.log("Lampe eingeschaltet (Zustand auf true gesetzt)");

            setTimeout(() => {
                setState(lampeBrightness, startBrightness, true);
                console.log(`Lampe auf ${startBrightness}% gesetzt`);
                starteDimmen(startMin, endMin);
            }, 100);
        }

        if (aktuelleMinuten === stopMin) {
            setState(lampeBrightness, 0);
            console.log("Lampe ausgeschaltet");
            clearInterval(fadeTimer);
        }
    });
});

// === ALEXA-ANSAGE-DYNAMISCH NACH UHRZEIT-VARIABLE ===
schedule('* * * * *', () => {
    if (!alexaAnsageAktiv) return;

    const jetzt = new Date();
    const [ansageStunde, ansageMinute] = alexaAnsageZeit.split(':').map(Number);

    if (jetzt.getHours() === ansageStunde && jetzt.getMinutes() === ansageMinute) {
        getState(feiertagMorgen, (err, state) => {
            if (err || !state) {
                console.warn("Feiertagsprüfung (morgen) fehlgeschlagen.");
                return;
            }

            if (state.val === true) {
                const text = 'Achtung, morgen ist ein Feiertag. Sanftes Aufstehen ist deaktiviert.';
                setState(`${alexaDevice}.Commands.announcement`, text);
                console.log(`Alexa-Ansage um ${alexaAnsageZeit} wurde gesendet.`);
            } else {
                console.log("Morgen ist kein Feiertag – keine Alexa-Ansage.");
            }
        });
    }
});
