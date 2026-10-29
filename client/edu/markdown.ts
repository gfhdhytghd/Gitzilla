// Match the server's classroom export escaping; keep authored text on one Markdown line.
export const md = (value: unknown) => String(value ?? '').replace(/[\\`*_{}\[\]<>|#]/g, '\\$&').replace(/[\r\n]+/g, ' ');
