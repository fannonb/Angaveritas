// Calendar dates are not instants. Keep PostgreSQL DATE as YYYY-MM-DD strings
// so comparisons, proposal expiry and HTML date controls do not shift zones.
export const calendarDateType = { to: 1082, from: [1082], serialize: (value: string) => value, parse: (value: string) => value }
