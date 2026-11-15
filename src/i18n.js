// -----------------------------------------------------------------------------
// Every text the code produces, in the four languages of the Gladys interface.
// German says "du", Spanish "usted".
//
// A device integration does not receive the user's language: the feature
// names, the texts published as states and the scene outputs use the
// `language` setting; the widget receives the dashboard language with each
// request.
// -----------------------------------------------------------------------------

export const LANGS = ['en', 'fr', 'de', 'es'];

/** Language of a request, English when unknown. */
export const langOf = (language) => (LANGS.includes(language) ? language : 'en');

/** A multi-language object → one language. */
export const pick = (value, language) => value[langOf(language)] ?? value.en;

/** Feature names, by feature key (fixed when the user adds the device). */
export const NAMES = {
  en: {
    now_title: 'On now',
    now_end: 'End of the current programme',
    now_remaining: 'Time left',
    next_title: 'Next',
    tonight_title: 'Tonight',
  },
  fr: {
    now_title: 'En ce moment',
    now_end: 'Fin du programme en cours',
    now_remaining: 'Temps restant',
    next_title: 'Ensuite',
    tonight_title: 'Ce soir',
  },
  de: {
    now_title: 'Läuft gerade',
    now_end: 'Ende der laufenden Sendung',
    now_remaining: 'Restzeit',
    next_title: 'Danach',
    tonight_title: 'Heute Abend',
  },
  es: {
    now_title: 'Ahora',
    now_end: 'Fin del programa actual',
    now_remaining: 'Tiempo restante',
    next_title: 'A continuación',
    tonight_title: 'Esta noche',
  },
};

/** Short texts (states, widget, scene outputs). */
export const TEXT = {
  en: {
    none: 'No programme',
    tomorrow: 'tomorrow',
    now: 'Now',
    next: 'Next',
    tonight: 'Tonight',
    until: 'until',
    minutes: 'min',
    onNow: 'on now',
  },
  fr: {
    none: 'Aucun programme',
    tomorrow: 'demain',
    now: 'En ce moment',
    next: 'Ensuite',
    tonight: 'Ce soir',
    until: "jusqu'à",
    minutes: 'min',
    onNow: 'en ce moment',
  },
  de: {
    none: 'Keine Sendung',
    tomorrow: 'morgen',
    now: 'Jetzt',
    next: 'Danach',
    tonight: 'Heute Abend',
    until: 'bis',
    minutes: 'Min.',
    onNow: 'läuft gerade',
  },
  es: {
    none: 'Ningún programa',
    tomorrow: 'mañana',
    now: 'Ahora',
    next: 'A continuación',
    tonight: 'Esta noche',
    until: 'hasta las',
    minutes: 'min',
    onNow: 'ahora',
  },
};

export const MESSAGES = {
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
    de: 'Die Initialisierung ist fehlgeschlagen, sieh in den Protokollen der Integration nach.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  noSource: {
    en: 'Enter the address of an XMLTV guide in the configuration.',
    fr: "Renseignez l'adresse d'un guide XMLTV dans la configuration.",
    de: 'Gib in der Konfiguration die Adresse eines XMLTV-Programmführers ein.',
    es: 'Indique la dirección de una guía XMLTV en la configuración.',
  },
  badSource: {
    en: 'The guide address must start with https://, http:// or /data/.',
    fr: "L'adresse du guide doit commencer par https://, http:// ou /data/.",
    de: 'Die Adresse des Programmführers muss mit https://, http:// oder /data/ beginnen.',
    es: 'La dirección de la guía debe empezar por https://, http:// o /data/.',
  },
  unreachable: {
    en: 'The guide cannot be downloaded: check its address and the network.',
    fr: 'Le guide ne peut pas être téléchargé : vérifiez son adresse et le réseau.',
    de: 'Der Programmführer kann nicht geladen werden: prüfe seine Adresse und das Netzwerk.',
    es: 'No se puede descargar la guía: compruebe su dirección y la red.',
  },
  http: {
    en: 'The guide server refused the download: check the address.',
    fr: 'Le serveur du guide a refusé le téléchargement : vérifiez l’adresse.',
    de: 'Der Server des Programmführers hat den Download abgelehnt: prüfe die Adresse.',
    es: 'El servidor de la guía ha rechazado la descarga: compruebe la dirección.',
  },
  timeout: {
    en: 'The guide download took too long.',
    fr: 'Le téléchargement du guide a pris trop de temps.',
    de: 'Der Download des Programmführers hat zu lange gedauert.',
    es: 'La descarga de la guía ha tardado demasiado.',
  },
  file: {
    en: 'The guide file cannot be read in the data volume.',
    fr: 'Le fichier du guide est illisible dans le volume de données.',
    de: 'Die Datei des Programmführers ist im Datenvolume nicht lesbar.',
    es: 'El archivo de la guía no se puede leer en el volumen de datos.',
  },
  malformed: {
    en: 'The guide file is damaged or cut short.',
    fr: 'Le fichier du guide est abîmé ou tronqué.',
    de: 'Die Datei des Programmführers ist beschädigt oder unvollständig.',
    es: 'El archivo de la guía está dañado o incompleto.',
  },
  not_xmltv: {
    en: 'The address does not lead to an XMLTV guide.',
    fr: "L'adresse ne mène pas à un guide XMLTV.",
    de: 'Die Adresse führt nicht zu einem XMLTV-Programmführer.',
    es: 'La dirección no lleva a una guía XMLTV.',
  },
  too_big: {
    en: 'The guide is larger than 1 GB: choose a smaller one.',
    fr: 'Le guide dépasse 1 Go : choisissez-en un plus petit.',
    de: 'Der Programmführer ist größer als 1 GB: wähle einen kleineren.',
    es: 'La guía supera 1 GB: elija una más pequeña.',
  },
  noChannel: {
    en: 'None of the followed channels is in the guide: use "List the channels".',
    fr: 'Aucune chaîne suivie ne figure dans le guide : utilisez « Lister les chaînes ».',
    de: 'Keiner der verfolgten Sender ist im Programmführer: nutze „Sender auflisten“.',
    es: 'Ninguna de las cadenas seguidas está en la guía: use «Listar las cadenas».',
  },
  noGuideYet: {
    en: 'No guide read yet: check the configuration, then press "Test the guide".',
    fr: 'Aucun guide lu pour l’instant : vérifiez la configuration puis « Tester le guide ».',
    de: 'Noch kein Programmführer gelesen: prüfe die Konfiguration, dann „Programmführer testen“.',
    es: 'Aún no se ha leído ninguna guía: compruebe la configuración y pulse «Probar la guía».',
  },
  addChannels: {
    en: 'Add the followed channels from the Discovery tab of the integration.',
    fr: "Ajoutez les chaînes suivies depuis l'onglet Découverte de l'intégration.",
    de: 'Füge die verfolgten Sender über den Tab „Entdecken“ der Integration hinzu.',
    es: 'Añada las cadenas seguidas desde la pestaña Descubrimiento de la integración.',
  },
};

const formatNumber = (value, lang) => new Intl.NumberFormat(lang).format(value);

/** "21:05", 24-hour clock, time zone of Gladys. */
export function formatTime(ms, lang) {
  return new Intl.DateTimeFormat(langOf(lang), {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
}

/** "Sunday 15 November" in the given language. */
export function formatDay(ms, lang) {
  return new Intl.DateTimeFormat(langOf(lang), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(ms));
}

/** "21:05 · Title", or "tomorrow 21:05 · Title". */
export function slotText(programme, lang, { tomorrow = false } = {}) {
  const t = TEXT[langOf(lang)];
  if (!programme) {
    return t.none;
  }
  const time = formatTime(programme.start, lang);
  return `${tomorrow ? `${t.tomorrow} ` : ''}${time} · ${programme.title}`.slice(0, 200);
}

// The report of the "Test the guide" action.
export const REPORT_TEXT = {
  en: {
    guide: (channels, programmes, until) =>
      `Guide read: ${channels} channels, ${programmes} programmes, until ${until}.`,
    unchanged: 'Unchanged since the last download.',
    followed: 'Followed:',
    missing: 'Not found:',
    none: 'No followed channel yet: fill "Followed channels".',
    failed: 'Failure:',
  },
  fr: {
    guide: (channels, programmes, until) =>
      `Guide lu : ${channels} chaînes, ${programmes} programmes, jusqu'au ${until}.`,
    unchanged: 'Inchangé depuis le dernier téléchargement.',
    followed: 'Suivies :',
    missing: 'Introuvables :',
    none: 'Aucune chaîne suivie : remplissez « Chaînes suivies ».',
    failed: 'Échec :',
  },
  de: {
    guide: (channels, programmes, until) =>
      `Programmführer gelesen: ${channels} Sender, ${programmes} Sendungen, bis ${until}.`,
    unchanged: 'Seit dem letzten Download unverändert.',
    followed: 'Verfolgt:',
    missing: 'Nicht gefunden:',
    none: 'Noch kein verfolgter Sender: fülle „Verfolgte Sender“ aus.',
    failed: 'Fehler:',
  },
  es: {
    guide: (channels, programmes, until) =>
      `Guía leída: ${channels} cadenas, ${programmes} programas, hasta el ${until}.`,
    unchanged: 'Sin cambios desde la última descarga.',
    followed: 'Seguidas:',
    missing: 'No encontradas:',
    none: 'Ninguna cadena seguida: rellene «Cadenas seguidas».',
    failed: 'Error:',
  },
};

/**
 * @param {object} result
 * @param {string} [result.error] error code (see MESSAGES)
 * @param {boolean} [result.unchanged]
 * @param {number} result.channels channels in the guide
 * @param {number} result.programmes programmes kept
 * @param {number} result.until last programme end (ms)
 * @param {{ id: string, name: string }[]} result.found
 * @param {string[]} result.missing
 */
export function testReport(result) {
  return Object.fromEntries(
    LANGS.map((lang) => {
      const t = REPORT_TEXT[lang];
      const lines = [];
      if (result.error) {
        lines.push(`${t.failed} ${(MESSAGES[result.error] ?? MESSAGES.unreachable)[lang]}`);
      }
      if (result.channels > 0) {
        const until = result.until > 0 ? `${formatDay(result.until, lang)}` : '-';
        lines.push(
          t.guide(
            formatNumber(result.channels, lang),
            formatNumber(result.programmes, lang),
            until,
          ),
        );
      }
      if (result.unchanged) {
        lines.push(t.unchanged);
      }
      if (result.found.length > 0) {
        lines.push(`${t.followed} ${result.found.map((c) => `${c.name} (${c.id})`).join(', ')}.`);
      }
      if (result.missing.length > 0) {
        lines.push(`${t.missing} ${result.missing.join(', ')}.`);
      }
      if (result.found.length === 0 && result.missing.length === 0) {
        lines.push(t.none);
      }
      return [lang, lines.join('\n').slice(0, 2000)];
    }),
  );
}

export const LIST_TEXT = {
  en: {
    count: (shown, total) => `${shown} of ${total} channels (id: name):`,
    none: 'No channel matches.',
    more: 'Narrow the search to see the others.',
  },
  fr: {
    count: (shown, total) => `${shown} chaînes sur ${total} (identifiant : nom) :`,
    none: 'Aucune chaîne ne correspond.',
    more: 'Affinez la recherche pour voir les autres.',
  },
  de: {
    count: (shown, total) => `${shown} von ${total} Sendern (ID: Name):`,
    none: 'Kein Sender passt.',
    more: 'Grenze die Suche ein, um die anderen zu sehen.',
  },
  es: {
    count: (shown, total) => `${shown} de ${total} cadenas (identificador: nombre):`,
    none: 'Ninguna cadena coincide.',
    more: 'Afine la búsqueda para ver las demás.',
  },
};

/** The answer of "List the channels": matching channels, `id: name`. */
export function channelList(matches, total, max) {
  return Object.fromEntries(
    LANGS.map((lang) => {
      const t = LIST_TEXT[lang];
      if (matches.length === 0) {
        return [lang, t.none];
      }
      const shown = matches.slice(0, max);
      const lines = [t.count(shown.length, total)];
      for (const channel of shown) {
        lines.push(`${channel.id}: ${channel.names[0] ?? channel.id}`);
      }
      if (matches.length > max) {
        lines.push(t.more);
      }
      return [lang, lines.join('\n')];
    }),
  );
}
