// -----------------------------------------------------------------------------
// XMLTV dates: `YYYYMMDDhhmmss ±hhmm`. The seconds, the minutes and the offset
// may be missing; without an offset the time is UTC (XMLTV DTD). Some
// generators write the offset as `+01:00`, `Z`, `UTC` or `GMT`.
// -----------------------------------------------------------------------------

const DATE = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?\s*(.*)$/;
const OFFSET = /^([+-])(\d{2}):?(\d{2})$/;

/**
 * @param {string|undefined} text
 * @returns {number|null} epoch milliseconds, null when unreadable
 */
export function parseXmltvDate(text) {
  if (typeof text !== 'string') {
    return null;
  }
  const match = DATE.exec(text.trim());
  if (!match) {
    return null;
  }
  const [, year, month, day, hours = '00', minutes = '00', seconds = '00', zone] = match;
  const utc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds),
  );
  const fields = [Number(month), Number(day), Number(hours), Number(minutes), Number(seconds)];
  if (
    fields[0] < 1 ||
    fields[0] > 12 ||
    fields[1] < 1 ||
    fields[1] > 31 ||
    fields[2] > 23 ||
    fields[3] > 59 ||
    fields[4] > 60
  ) {
    return null;
  }
  const label = zone.trim();
  if (label === '' || /^(z|utc|gmt)$/i.test(label)) {
    return utc;
  }
  const offset = OFFSET.exec(label);
  if (!offset) {
    return null;
  }
  const sign = offset[1] === '-' ? -1 : 1;
  const offsetMinutes = Number(offset[2]) * 60 + Number(offset[3]);
  return utc - sign * offsetMinutes * 60_000;
}
